//! Runtime configuration types and defaults.
//!
//! This module defines the configuration options for the WASM runtime,
//! including memory limits, instance pool size, and feature flags.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Default memory limit per instance (32 MB)
pub const DEFAULT_MEMORY_LIMIT_BYTES: u64 = 32 * 1024 * 1024;

/// Default stack size per instance (1 MB)
pub const DEFAULT_STACK_SIZE_BYTES: u64 = 1024 * 1024;

/// Default maximum instances in pool
pub const DEFAULT_MAX_INSTANCES: usize = 10;

/// Default handler timeout in milliseconds
pub const DEFAULT_TIMEOUT_MS: u32 = 5000;

/// Default cache directory
pub const DEFAULT_CACHE_DIR: &str = ".nexus-cache";

/// Default maximum host function calls per execution
pub const DEFAULT_MAX_HOST_CALLS: u32 = 10000;

/// Default maximum state mutations per execution
pub const DEFAULT_MAX_STATE_MUTATIONS: u32 = 1000;

/// Default maximum events per execution
pub const DEFAULT_MAX_EVENTS: u32 = 100;

/// Configuration for the WASM runtime
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConfig {
    /// Maximum number of concurrent WASM instances in pool
    #[serde(default = "default_max_instances")]
    pub max_instances: usize,

    /// Memory limit per instance in bytes (default: 32MB)
    #[serde(default = "default_memory_limit")]
    pub memory_limit_bytes: u64,

    /// Stack size per instance in bytes (default: 1MB)
    #[serde(default = "default_stack_size")]
    pub stack_size_bytes: u64,

    /// Enable SIMD instructions (default: true)
    #[serde(default = "default_true")]
    pub enable_simd: bool,

    /// Enable bulk memory operations (default: true)
    #[serde(default = "default_true")]
    pub enable_bulk_memory: bool,

    /// Path to QuickJS WASM module (optional, uses bundled if not provided)
    #[serde(default)]
    pub quickjs_module_path: Option<PathBuf>,

    /// Enable AOT compilation for hot handlers (default: false)
    #[serde(default)]
    pub enable_aot: bool,

    /// Compilation cache directory (default: .nexus-cache/)
    #[serde(default = "default_cache_dir")]
    pub cache_dir: PathBuf,

    /// Enable debug mode (default: false)
    #[serde(default)]
    pub debug: bool,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            max_instances: DEFAULT_MAX_INSTANCES,
            memory_limit_bytes: DEFAULT_MEMORY_LIMIT_BYTES,
            stack_size_bytes: DEFAULT_STACK_SIZE_BYTES,
            enable_simd: true,
            enable_bulk_memory: true,
            quickjs_module_path: None,
            enable_aot: false,
            cache_dir: PathBuf::from(DEFAULT_CACHE_DIR),
            debug: false,
        }
    }
}

impl RuntimeConfig {
    /// Create a new configuration with default values
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the maximum number of instances
    pub fn with_max_instances(mut self, max: usize) -> Self {
        self.max_instances = max;
        self
    }

    /// Set the memory limit per instance
    pub fn with_memory_limit(mut self, bytes: u64) -> Self {
        self.memory_limit_bytes = bytes;
        self
    }

    /// Set the stack size per instance
    pub fn with_stack_size(mut self, bytes: u64) -> Self {
        self.stack_size_bytes = bytes;
        self
    }

    /// Enable or disable SIMD
    pub fn with_simd(mut self, enable: bool) -> Self {
        self.enable_simd = enable;
        self
    }

    /// Set the QuickJS module path
    pub fn with_quickjs_path(mut self, path: PathBuf) -> Self {
        self.quickjs_module_path = Some(path);
        self
    }

    /// Enable or disable AOT compilation
    pub fn with_aot(mut self, enable: bool) -> Self {
        self.enable_aot = enable;
        self
    }

    /// Set the cache directory
    pub fn with_cache_dir(mut self, path: PathBuf) -> Self {
        self.cache_dir = path;
        self
    }

    /// Enable debug mode
    pub fn with_debug(mut self, debug: bool) -> Self {
        self.debug = debug;
        self
    }

    /// Validate the configuration
    pub fn validate(&self) -> Result<(), ConfigError> {
        if self.max_instances == 0 {
            return Err(ConfigError::InvalidValue {
                field: "max_instances".into(),
                reason: "must be greater than 0".into(),
            });
        }

        if self.memory_limit_bytes < 1024 * 1024 {
            return Err(ConfigError::InvalidValue {
                field: "memory_limit_bytes".into(),
                reason: "must be at least 1MB".into(),
            });
        }

        if self.stack_size_bytes < 64 * 1024 {
            return Err(ConfigError::InvalidValue {
                field: "stack_size_bytes".into(),
                reason: "must be at least 64KB".into(),
            });
        }

        Ok(())
    }
}

/// Resource limits for handler execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceLimits {
    /// Maximum execution time in milliseconds (0 = no limit)
    #[serde(default = "default_timeout")]
    pub timeout_ms: u32,

    /// Maximum memory per instance in bytes
    #[serde(default = "default_memory_limit")]
    pub memory_limit_bytes: u64,

    /// Maximum stack depth in bytes
    #[serde(default = "default_stack_size")]
    pub stack_size_bytes: u64,

    /// Maximum number of host function calls
    #[serde(default = "default_max_host_calls")]
    pub max_host_calls: u32,

    /// Maximum state mutation count per execution
    #[serde(default = "default_max_state_mutations")]
    pub max_state_mutations: u32,

    /// Maximum event emission count per execution
    #[serde(default = "default_max_events")]
    pub max_events: u32,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            timeout_ms: DEFAULT_TIMEOUT_MS,
            memory_limit_bytes: DEFAULT_MEMORY_LIMIT_BYTES,
            stack_size_bytes: DEFAULT_STACK_SIZE_BYTES,
            max_host_calls: DEFAULT_MAX_HOST_CALLS,
            max_state_mutations: DEFAULT_MAX_STATE_MUTATIONS,
            max_events: DEFAULT_MAX_EVENTS,
        }
    }
}

/// Configuration error types
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    /// Invalid configuration value
    #[error("Invalid configuration value for {field}: {reason}")]
    InvalidValue {
        /// The field name
        field: String,
        /// The reason it's invalid
        reason: String,
    },

    /// Missing required field
    #[error("Missing required configuration field: {field}")]
    MissingField {
        /// The field name
        field: String,
    },

    /// IO error
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// Serialization error
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

// Default value functions for serde
fn default_max_instances() -> usize {
    DEFAULT_MAX_INSTANCES
}

fn default_memory_limit() -> u64 {
    DEFAULT_MEMORY_LIMIT_BYTES
}

fn default_stack_size() -> u64 {
    DEFAULT_STACK_SIZE_BYTES
}

fn default_timeout() -> u32 {
    DEFAULT_TIMEOUT_MS
}

fn default_cache_dir() -> PathBuf {
    PathBuf::from(DEFAULT_CACHE_DIR)
}

fn default_true() -> bool {
    true
}

fn default_max_host_calls() -> u32 {
    DEFAULT_MAX_HOST_CALLS
}

fn default_max_state_mutations() -> u32 {
    DEFAULT_MAX_STATE_MUTATIONS
}

fn default_max_events() -> u32 {
    DEFAULT_MAX_EVENTS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = RuntimeConfig::default();
        assert_eq!(config.max_instances, DEFAULT_MAX_INSTANCES);
        assert_eq!(config.memory_limit_bytes, DEFAULT_MEMORY_LIMIT_BYTES);
        assert!(config.enable_simd);
        assert!(!config.enable_aot);
    }

    #[test]
    fn test_config_builder() {
        let config = RuntimeConfig::new()
            .with_max_instances(20)
            .with_memory_limit(64 * 1024 * 1024)
            .with_aot(true);

        assert_eq!(config.max_instances, 20);
        assert_eq!(config.memory_limit_bytes, 64 * 1024 * 1024);
        assert!(config.enable_aot);
    }

    #[test]
    fn test_config_validation() {
        let invalid = RuntimeConfig::new().with_max_instances(0);
        assert!(invalid.validate().is_err());

        let valid = RuntimeConfig::default();
        assert!(valid.validate().is_ok());
    }

    #[test]
    fn test_config_serialization() {
        let config = RuntimeConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        let parsed: RuntimeConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.max_instances, config.max_instances);
    }
}
