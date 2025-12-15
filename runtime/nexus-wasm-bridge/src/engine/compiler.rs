//! Handler compilation and bytecode caching.
//!
//! This module handles compiling JavaScript handler code to QuickJS bytecode
//! and caching the results for performance.

use crate::config::RuntimeConfig;
use crate::error::{Result, RuntimeError};
use parking_lot::RwLock;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, info, warn};

/// Compiled handler result
#[derive(Clone)]
pub struct CompiledHandler {
    /// QuickJS bytecode
    pub bytecode: Vec<u8>,
    /// Source map for error mapping (optional)
    pub source_map: Option<SourceMap>,
    /// Whether this was a cache hit
    pub cache_hit: bool,
}

/// Source map for error location mapping
#[derive(Clone, Debug)]
pub struct SourceMap {
    /// Original source code
    pub source: String,
    /// Line offsets for mapping
    pub line_offsets: Vec<usize>,
}

impl SourceMap {
    /// Create a source map from source code
    pub fn from_source(source: &str) -> Self {
        let mut line_offsets = vec![0];
        for (i, c) in source.chars().enumerate() {
            if c == '\n' {
                line_offsets.push(i + 1);
            }
        }

        Self {
            source: source.to_string(),
            line_offsets,
        }
    }

    /// Get line and column from byte offset
    pub fn get_location(&self, offset: usize) -> (usize, usize) {
        let line = self
            .line_offsets
            .iter()
            .position(|&o| o > offset)
            .unwrap_or(self.line_offsets.len())
            .saturating_sub(1);

        let col = offset - self.line_offsets.get(line).unwrap_or(&0);
        (line + 1, col + 1) // 1-indexed
    }

    /// Get a code snippet around a location
    pub fn get_snippet(&self, line: usize, context_lines: usize) -> String {
        let lines: Vec<&str> = self.source.lines().collect();
        let start = line.saturating_sub(context_lines + 1);
        let end = (line + context_lines).min(lines.len());

        lines[start..end]
            .iter()
            .enumerate()
            .map(|(i, l)| {
                let line_num = start + i + 1;
                let marker = if line_num == line { ">" } else { " " };
                format!("{} {:4} | {}", marker, line_num, l)
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

/// Cache entry with metadata
struct CacheEntry {
    /// Compiled bytecode
    bytecode: Vec<u8>,
    /// Source map
    source_map: Option<SourceMap>,
    /// When this entry was created
    created_at: Instant,
    /// Last access time
    last_accessed: Instant,
    /// Access count
    access_count: u64,
    /// Size in bytes
    size: usize,
}

impl CacheEntry {
    fn new(bytecode: Vec<u8>, source_map: Option<SourceMap>) -> Self {
        let size = bytecode.len() + source_map.as_ref().map_or(0, |s| s.source.len());
        let now = Instant::now();

        Self {
            bytecode,
            source_map,
            created_at: now,
            last_accessed: now,
            access_count: 1,
            size,
        }
    }
}

/// Handler compiler with caching
pub struct HandlerCompiler {
    /// Configuration
    config: RuntimeConfig,
    /// In-memory cache
    cache: RwLock<HashMap<String, CacheEntry>>,
    /// Disk cache directory (optional)
    disk_cache_dir: Option<PathBuf>,
    /// Cache hits
    cache_hits: AtomicU64,
    /// Cache misses
    cache_misses: AtomicU64,
    /// Total compilations
    total_compilations: AtomicU64,
    /// Maximum cache size in bytes
    max_cache_size: usize,
    /// Current cache size in bytes
    cache_size: AtomicU64,
}

impl HandlerCompiler {
    /// Create a new compiler
    pub fn new(config: &RuntimeConfig) -> Result<Self> {
        let disk_cache_dir = config
            .cache_dir
            .as_ref()
            .map(|p| {
                let path = PathBuf::from(p);
                if !path.exists() {
                    std::fs::create_dir_all(&path).ok();
                }
                path
            });

        info!(
            disk_cache = disk_cache_dir.is_some(),
            "Initialized handler compiler"
        );

        Ok(Self {
            config: config.clone(),
            cache: RwLock::new(HashMap::new()),
            disk_cache_dir,
            cache_hits: AtomicU64::new(0),
            cache_misses: AtomicU64::new(0),
            total_compilations: AtomicU64::new(0),
            max_cache_size: config.max_cache_size_bytes.unwrap_or(64 * 1024 * 1024), // 64MB default
            cache_size: AtomicU64::new(0),
        })
    }

    /// Compile handler code to bytecode
    pub fn compile(&self, source: &str) -> Result<CompiledHandler> {
        let cache_key = self.compute_cache_key(source);

        // Try memory cache first
        if let Some(entry) = self.get_from_cache(&cache_key) {
            self.cache_hits.fetch_add(1, Ordering::Relaxed);
            debug!(key = %cache_key, "Cache hit");
            return Ok(CompiledHandler {
                bytecode: entry.bytecode.clone(),
                source_map: entry.source_map.clone(),
                cache_hit: true,
            });
        }

        // Try disk cache
        if let Some(entry) = self.get_from_disk_cache(&cache_key) {
            self.cache_hits.fetch_add(1, Ordering::Relaxed);
            debug!(key = %cache_key, "Disk cache hit");
            
            // Promote to memory cache
            self.put_to_cache(&cache_key, entry.bytecode.clone(), entry.source_map.clone());
            
            return Ok(CompiledHandler {
                bytecode: entry.bytecode,
                source_map: entry.source_map,
                cache_hit: true,
            });
        }

        // Cache miss - compile
        self.cache_misses.fetch_add(1, Ordering::Relaxed);
        self.total_compilations.fetch_add(1, Ordering::Relaxed);
        debug!(key = %cache_key, "Cache miss, compiling");

        let (bytecode, source_map) = self.compile_source(source)?;

        // Store in caches
        self.put_to_cache(&cache_key, bytecode.clone(), Some(source_map.clone()));
        self.put_to_disk_cache(&cache_key, &bytecode);

        Ok(CompiledHandler {
            bytecode,
            source_map: Some(source_map),
            cache_hit: false,
        })
    }

    /// Compute cache key from source
    fn compute_cache_key(&self, source: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(source.as_bytes());
        
        // Include version in key so upgrades invalidate cache
        hasher.update(b":v1");
        
        let result = hasher.finalize();
        hex::encode(result)
    }

    /// Get from memory cache
    fn get_from_cache(&self, key: &str) -> Option<CacheEntry> {
        let mut cache = self.cache.write();
        
        if let Some(entry) = cache.get_mut(key) {
            entry.last_accessed = Instant::now();
            entry.access_count += 1;
            
            return Some(CacheEntry {
                bytecode: entry.bytecode.clone(),
                source_map: entry.source_map.clone(),
                created_at: entry.created_at,
                last_accessed: entry.last_accessed,
                access_count: entry.access_count,
                size: entry.size,
            });
        }
        
        None
    }

    /// Put to memory cache
    fn put_to_cache(&self, key: &str, bytecode: Vec<u8>, source_map: Option<SourceMap>) {
        let entry = CacheEntry::new(bytecode, source_map);
        let entry_size = entry.size as u64;

        // Evict if necessary
        while self.cache_size.load(Ordering::Relaxed) + entry_size > self.max_cache_size as u64 {
            if !self.evict_lru() {
                break;
            }
        }

        let mut cache = self.cache.write();
        if let Some(old) = cache.insert(key.to_string(), entry) {
            self.cache_size.fetch_sub(old.size as u64, Ordering::Relaxed);
        }
        self.cache_size.fetch_add(entry_size, Ordering::Relaxed);
    }

    /// Evict least recently used entry
    fn evict_lru(&self) -> bool {
        let mut cache = self.cache.write();
        
        if cache.is_empty() {
            return false;
        }

        // Find LRU entry
        let lru_key = cache
            .iter()
            .min_by_key(|(_, e)| e.last_accessed)
            .map(|(k, _)| k.clone());

        if let Some(key) = lru_key {
            if let Some(entry) = cache.remove(&key) {
                self.cache_size.fetch_sub(entry.size as u64, Ordering::Relaxed);
                debug!(key = %key, "Evicted LRU cache entry");
                return true;
            }
        }

        false
    }

    /// Get from disk cache
    fn get_from_disk_cache(&self, key: &str) -> Option<CacheEntry> {
        let cache_dir = self.disk_cache_dir.as_ref()?;
        let path = cache_dir.join(format!("{}.qjsc", key));

        match std::fs::read(&path) {
            Ok(bytecode) => {
                debug!(path = %path.display(), "Read from disk cache");
                Some(CacheEntry::new(bytecode, None))
            }
            Err(_) => None,
        }
    }

    /// Put to disk cache
    fn put_to_disk_cache(&self, key: &str, bytecode: &[u8]) {
        if let Some(cache_dir) = &self.disk_cache_dir {
            let path = cache_dir.join(format!("{}.qjsc", key));
            
            if let Err(e) = std::fs::write(&path, bytecode) {
                warn!(path = %path.display(), error = %e, "Failed to write disk cache");
            } else {
                debug!(path = %path.display(), "Wrote to disk cache");
            }
        }
    }

    /// Compile source to bytecode
    fn compile_source(&self, source: &str) -> Result<(Vec<u8>, SourceMap)> {
        // Wrap source in handler function
        let wrapped = self.wrap_handler(source);
        let source_map = SourceMap::from_source(&wrapped);

        // In a real implementation, this would:
        // 1. Load QuickJS WASM module
        // 2. Call JS_Compile to compile to bytecode
        // 3. Return the bytecode
        //
        // For now, we simulate compilation by storing the source as "bytecode"
        // This is a placeholder that will be replaced with actual QuickJS compilation
        
        let bytecode = wrapped.as_bytes().to_vec();

        Ok((bytecode, source_map))
    }

    /// Wrap handler source in runtime wrapper
    fn wrap_handler(&self, source: &str) -> String {
        // The wrapper provides the handler interface
        format!(
            r#"(function(__nexus_state, __nexus_args, __nexus_scope) {{
    // Inject globals
    const $state = {{
        get: (key) => __nexus_state_get(key),
        set: (key, value) => __nexus_state_set(key, value),
        delete: (key) => __nexus_state_delete(key),
        has: (key) => __nexus_state_has(key),
        keys: () => __nexus_state_keys(),
    }};

    const $args = __nexus_args;

    const $emit = (name, payload) => __nexus_emit_event(name, payload);

    const $view = {{
        setFilter: (viewId, filter) => __nexus_view_set_filter(viewId, filter),
        scrollTo: (viewId, position) => __nexus_view_scroll_to(viewId, position),
        focus: (viewId) => __nexus_view_focus(viewId),
        command: (viewId, cmd, params) => __nexus_view_command(viewId, cmd, params),
    }};

    const $ext = new Proxy({{}}, {{
        get: (target, name) => {{
            if (!__nexus_ext_exists(name)) {{
                return undefined;
            }}
            return new Proxy({{}}, {{
                get: (_, method) => {{
                    return async (...args) => {{
                        return __nexus_ext_call(name, method, args);
                    }};
                }}
            }});
        }}
    }});

    const $log = {{
        debug: (msg) => __nexus_log(0, msg),
        info: (msg) => __nexus_log(1, msg),
        warn: (msg) => __nexus_log(2, msg),
        error: (msg) => __nexus_log(3, msg),
    }};

    // Handler code
    {source}
}})"#
        )
    }

    /// Get cache statistics
    pub fn get_stats(&self) -> CompilerStats {
        let cache = self.cache.read();
        
        CompilerStats {
            cache_entries: cache.len(),
            cache_size_bytes: self.cache_size.load(Ordering::Relaxed),
            cache_hits: self.cache_hits.load(Ordering::Relaxed),
            cache_misses: self.cache_misses.load(Ordering::Relaxed),
            total_compilations: self.total_compilations.load(Ordering::Relaxed),
        }
    }

    /// Clear all caches
    pub fn clear_cache(&self) {
        let mut cache = self.cache.write();
        cache.clear();
        self.cache_size.store(0, Ordering::Relaxed);

        // Clear disk cache
        if let Some(cache_dir) = &self.disk_cache_dir {
            if let Ok(entries) = std::fs::read_dir(cache_dir) {
                for entry in entries.flatten() {
                    if entry.path().extension().map_or(false, |e| e == "qjsc") {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
        }

        info!("Cleared all caches");
    }
}

/// Compiler statistics
#[derive(Debug, Clone)]
pub struct CompilerStats {
    /// Number of cache entries
    pub cache_entries: usize,
    /// Total cache size in bytes
    pub cache_size_bytes: u64,
    /// Number of cache hits
    pub cache_hits: u64,
    /// Number of cache misses
    pub cache_misses: u64,
    /// Total compilations performed
    pub total_compilations: u64,
}

impl CompilerStats {
    /// Get cache hit rate (0.0 - 1.0)
    pub fn hit_rate(&self) -> f64 {
        let total = self.cache_hits + self.cache_misses;
        if total == 0 {
            0.0
        } else {
            self.cache_hits as f64 / total as f64
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_compiler() -> HandlerCompiler {
        let config = RuntimeConfig::default();
        HandlerCompiler::new(&config).unwrap()
    }

    #[test]
    fn test_compiler_creation() {
        let compiler = create_compiler();
        let stats = compiler.get_stats();
        assert_eq!(stats.cache_entries, 0);
    }

    #[test]
    fn test_compile_basic() {
        let compiler = create_compiler();
        let result = compiler.compile("return 42;").unwrap();

        assert!(!result.bytecode.is_empty());
        assert!(!result.cache_hit);
    }

    #[test]
    fn test_cache_hit() {
        let compiler = create_compiler();
        let source = "return $state.get('count');";

        // First compilation - miss
        let result1 = compiler.compile(source).unwrap();
        assert!(!result1.cache_hit);

        // Second compilation - hit
        let result2 = compiler.compile(source).unwrap();
        assert!(result2.cache_hit);

        // Bytecode should be identical
        assert_eq!(result1.bytecode, result2.bytecode);
    }

    #[test]
    fn test_cache_key_different_sources() {
        let compiler = create_compiler();

        let result1 = compiler.compile("return 1;").unwrap();
        let result2 = compiler.compile("return 2;").unwrap();

        assert!(!result1.cache_hit);
        assert!(!result2.cache_hit);
        assert_ne!(result1.bytecode, result2.bytecode);
    }

    #[test]
    fn test_source_map() {
        let source = "line1\nline2\nline3";
        let map = SourceMap::from_source(source);

        assert_eq!(map.get_location(0), (1, 1)); // Start of line 1
        assert_eq!(map.get_location(6), (2, 1)); // Start of line 2
        assert_eq!(map.get_location(12), (3, 1)); // Start of line 3
    }

    #[test]
    fn test_source_map_snippet() {
        let source = "line1\nline2\nline3\nline4\nline5";
        let map = SourceMap::from_source(source);

        let snippet = map.get_snippet(3, 1);
        assert!(snippet.contains("line2"));
        assert!(snippet.contains("line3"));
        assert!(snippet.contains("line4"));
    }

    #[test]
    fn test_wrapped_handler() {
        let compiler = create_compiler();
        let result = compiler.compile("$state.set('x', 1);").unwrap();

        let wrapped = String::from_utf8_lossy(&result.bytecode);
        assert!(wrapped.contains("$state"));
        assert!(wrapped.contains("$emit"));
        assert!(wrapped.contains("$view"));
        assert!(wrapped.contains("$ext"));
        assert!(wrapped.contains("$log"));
    }

    #[test]
    fn test_stats() {
        let compiler = create_compiler();

        compiler.compile("return 1;").unwrap();
        compiler.compile("return 1;").unwrap();
        compiler.compile("return 2;").unwrap();

        let stats = compiler.get_stats();
        assert_eq!(stats.cache_hits, 1);
        assert_eq!(stats.cache_misses, 2);
        assert_eq!(stats.total_compilations, 2);
        assert!((stats.hit_rate() - 0.333).abs() < 0.01);
    }

    #[test]
    fn test_clear_cache() {
        let compiler = create_compiler();

        compiler.compile("return 1;").unwrap();
        assert_eq!(compiler.get_stats().cache_entries, 1);

        compiler.clear_cache();
        assert_eq!(compiler.get_stats().cache_entries, 0);
    }
}
