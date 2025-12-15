//! Execution metrics for monitoring and observability.
//!
//! This module provides types for collecting and reporting metrics about
//! handler execution, including timing, memory usage, and host function calls.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Execution metrics collected during handler execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionMetrics {
    /// Execution duration in microseconds
    pub duration_us: u64,

    /// Memory used in bytes
    pub memory_used_bytes: u64,

    /// Peak memory in bytes
    pub memory_peak_bytes: u64,

    /// Host function call counts
    pub host_calls: HashMap<String, u32>,

    /// Approximate CPU instruction count (if available)
    pub instruction_count: u64,

    /// Compilation time in microseconds (if not cached)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compilation_time_us: Option<u64>,

    /// Whether compilation cache was hit
    pub cache_hit: bool,
}

impl Default for ExecutionMetrics {
    fn default() -> Self {
        Self {
            duration_us: 0,
            memory_used_bytes: 0,
            memory_peak_bytes: 0,
            host_calls: HashMap::new(),
            instruction_count: 0,
            compilation_time_us: None,
            cache_hit: false,
        }
    }
}

impl ExecutionMetrics {
    /// Create new metrics
    pub fn new() -> Self {
        Self::default()
    }

    /// Record execution duration
    pub fn with_duration(mut self, duration: Duration) -> Self {
        self.duration_us = duration.as_micros() as u64;
        self
    }

    /// Record memory usage
    pub fn with_memory(mut self, used: u64, peak: u64) -> Self {
        self.memory_used_bytes = used;
        self.memory_peak_bytes = peak;
        self
    }

    /// Record host calls
    pub fn with_host_calls(mut self, calls: HashMap<String, u32>) -> Self {
        self.host_calls = calls;
        self
    }

    /// Record compilation time
    pub fn with_compilation_time(mut self, time: Duration) -> Self {
        self.compilation_time_us = Some(time.as_micros() as u64);
        self
    }

    /// Set cache hit
    pub fn with_cache_hit(mut self, hit: bool) -> Self {
        self.cache_hit = hit;
        self
    }

    /// Increment host call count
    pub fn increment_host_call(&mut self, function_name: &str) {
        *self.host_calls.entry(function_name.to_string()).or_insert(0) += 1;
    }

    /// Get total host calls
    pub fn total_host_calls(&self) -> u32 {
        self.host_calls.values().sum()
    }
}

/// Runtime statistics for the entire runtime
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStats {
    /// Total handlers executed
    pub total_executions: u64,

    /// Active WASM instances
    pub active_instances: usize,

    /// Available instances in pool
    pub available_instances: usize,

    /// Cache hit rate (0-1)
    pub cache_hit_rate: f64,

    /// Average execution time in microseconds
    pub avg_execution_time_us: f64,

    /// Total memory used by all instances
    pub total_memory_bytes: u64,
}

impl Default for RuntimeStats {
    fn default() -> Self {
        Self {
            total_executions: 0,
            active_instances: 0,
            available_instances: 0,
            cache_hit_rate: 0.0,
            avg_execution_time_us: 0.0,
            total_memory_bytes: 0,
        }
    }
}

/// Metrics collector for aggregating runtime metrics
pub struct MetricsCollector {
    total_executions: AtomicU64,
    successful_executions: AtomicU64,
    failed_executions: AtomicU64,
    total_execution_time_us: AtomicU64,
    cache_hits: AtomicU64,
    cache_misses: AtomicU64,
    total_memory_used: AtomicU64,
    peak_memory: AtomicU64,
    host_calls: parking_lot::Mutex<HashMap<String, u64>>,
    error_counts: parking_lot::Mutex<HashMap<String, u64>>,
}

impl MetricsCollector {
    /// Create a new metrics collector
    pub fn new() -> Self {
        Self {
            total_executions: AtomicU64::new(0),
            successful_executions: AtomicU64::new(0),
            failed_executions: AtomicU64::new(0),
            total_execution_time_us: AtomicU64::new(0),
            cache_hits: AtomicU64::new(0),
            cache_misses: AtomicU64::new(0),
            total_memory_used: AtomicU64::new(0),
            peak_memory: AtomicU64::new(0),
            host_calls: parking_lot::Mutex::new(HashMap::new()),
            error_counts: parking_lot::Mutex::new(HashMap::new()),
        }
    }

    /// Record an execution
    pub fn record_execution(&self, metrics: &ExecutionMetrics, success: bool) {
        self.total_executions.fetch_add(1, Ordering::Relaxed);
        
        if success {
            self.successful_executions.fetch_add(1, Ordering::Relaxed);
        } else {
            self.failed_executions.fetch_add(1, Ordering::Relaxed);
        }

        self.total_execution_time_us
            .fetch_add(metrics.duration_us, Ordering::Relaxed);

        if metrics.cache_hit {
            self.cache_hits.fetch_add(1, Ordering::Relaxed);
        } else {
            self.cache_misses.fetch_add(1, Ordering::Relaxed);
        }

        // Update memory stats
        self.total_memory_used
            .fetch_add(metrics.memory_used_bytes, Ordering::Relaxed);
        
        // Update peak memory (CAS loop)
        let mut current_peak = self.peak_memory.load(Ordering::Relaxed);
        while metrics.memory_peak_bytes > current_peak {
            match self.peak_memory.compare_exchange_weak(
                current_peak,
                metrics.memory_peak_bytes,
                Ordering::SeqCst,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(p) => current_peak = p,
            }
        }

        // Update host call counts
        let mut host_calls = self.host_calls.lock();
        for (name, count) in &metrics.host_calls {
            *host_calls.entry(name.clone()).or_insert(0) += *count as u64;
        }
    }

    /// Record an error
    pub fn record_error(&self, error_code: &str) {
        let mut counts = self.error_counts.lock();
        *counts.entry(error_code.to_string()).or_insert(0) += 1;
    }

    /// Get total executions
    pub fn total_executions(&self) -> u64 {
        self.total_executions.load(Ordering::Relaxed)
    }

    /// Get successful executions
    pub fn successful_executions(&self) -> u64 {
        self.successful_executions.load(Ordering::Relaxed)
    }

    /// Get failed executions
    pub fn failed_executions(&self) -> u64 {
        self.failed_executions.load(Ordering::Relaxed)
    }

    /// Get cache hit rate
    pub fn cache_hit_rate(&self) -> f64 {
        let hits = self.cache_hits.load(Ordering::Relaxed);
        let misses = self.cache_misses.load(Ordering::Relaxed);
        let total = hits + misses;
        if total == 0 {
            0.0
        } else {
            hits as f64 / total as f64
        }
    }

    /// Get average execution time in microseconds
    pub fn avg_execution_time_us(&self) -> f64 {
        let total = self.total_executions.load(Ordering::Relaxed);
        if total == 0 {
            0.0
        } else {
            self.total_execution_time_us.load(Ordering::Relaxed) as f64 / total as f64
        }
    }

    /// Get peak memory usage
    pub fn peak_memory(&self) -> u64 {
        self.peak_memory.load(Ordering::Relaxed)
    }

    /// Get host call counts
    pub fn host_calls(&self) -> HashMap<String, u64> {
        self.host_calls.lock().clone()
    }

    /// Get error counts
    pub fn error_counts(&self) -> HashMap<String, u64> {
        self.error_counts.lock().clone()
    }

    /// Reset all metrics
    pub fn reset(&self) {
        self.total_executions.store(0, Ordering::Relaxed);
        self.successful_executions.store(0, Ordering::Relaxed);
        self.failed_executions.store(0, Ordering::Relaxed);
        self.total_execution_time_us.store(0, Ordering::Relaxed);
        self.cache_hits.store(0, Ordering::Relaxed);
        self.cache_misses.store(0, Ordering::Relaxed);
        self.total_memory_used.store(0, Ordering::Relaxed);
        self.peak_memory.store(0, Ordering::Relaxed);
        self.host_calls.lock().clear();
        self.error_counts.lock().clear();
    }

    /// Export Prometheus-format metrics
    pub fn to_prometheus(&self) -> String {
        let mut output = String::new();

        output.push_str("# HELP nexus_handler_executions_total Total handler executions\n");
        output.push_str("# TYPE nexus_handler_executions_total counter\n");
        output.push_str(&format!(
            "nexus_handler_executions_total{{status=\"success\"}} {}\n",
            self.successful_executions()
        ));
        output.push_str(&format!(
            "nexus_handler_executions_total{{status=\"error\"}} {}\n",
            self.failed_executions()
        ));

        output.push_str("\n# HELP nexus_handler_execution_time_us Average execution time\n");
        output.push_str("# TYPE nexus_handler_execution_time_us gauge\n");
        output.push_str(&format!(
            "nexus_handler_execution_time_us {:.2}\n",
            self.avg_execution_time_us()
        ));

        output.push_str("\n# HELP nexus_cache_hit_rate Compilation cache hit rate\n");
        output.push_str("# TYPE nexus_cache_hit_rate gauge\n");
        output.push_str(&format!(
            "nexus_cache_hit_rate {:.4}\n",
            self.cache_hit_rate()
        ));

        output.push_str("\n# HELP nexus_peak_memory_bytes Peak memory usage\n");
        output.push_str("# TYPE nexus_peak_memory_bytes gauge\n");
        output.push_str(&format!("nexus_peak_memory_bytes {}\n", self.peak_memory()));

        // Host calls
        output.push_str("\n# HELP nexus_host_calls_total Host function calls\n");
        output.push_str("# TYPE nexus_host_calls_total counter\n");
        for (name, count) in self.host_calls() {
            output.push_str(&format!(
                "nexus_host_calls_total{{function=\"{}\"}} {}\n",
                name, count
            ));
        }

        // Errors
        output.push_str("\n# HELP nexus_errors_total Error counts by code\n");
        output.push_str("# TYPE nexus_errors_total counter\n");
        for (code, count) in self.error_counts() {
            output.push_str(&format!(
                "nexus_errors_total{{code=\"{}\"}} {}\n",
                code, count
            ));
        }

        output
    }
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

/// Timer for measuring execution duration
pub struct ExecutionTimer {
    start: Instant,
    compilation_start: Option<Instant>,
    compilation_duration: Option<Duration>,
}

impl ExecutionTimer {
    /// Start a new timer
    pub fn start() -> Self {
        Self {
            start: Instant::now(),
            compilation_start: None,
            compilation_duration: None,
        }
    }

    /// Start compilation timing
    pub fn start_compilation(&mut self) {
        self.compilation_start = Some(Instant::now());
    }

    /// Stop compilation timing
    pub fn stop_compilation(&mut self) {
        if let Some(start) = self.compilation_start.take() {
            self.compilation_duration = Some(start.elapsed());
        }
    }

    /// Get elapsed time
    pub fn elapsed(&self) -> Duration {
        self.start.elapsed()
    }

    /// Get compilation duration
    pub fn compilation_duration(&self) -> Option<Duration> {
        self.compilation_duration
    }

    /// Build metrics from timer
    pub fn into_metrics(self, cache_hit: bool) -> ExecutionMetrics {
        let mut metrics = ExecutionMetrics::new()
            .with_duration(self.elapsed())
            .with_cache_hit(cache_hit);

        if let Some(compilation_time) = self.compilation_duration {
            metrics = metrics.with_compilation_time(compilation_time);
        }

        metrics
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execution_metrics_default() {
        let metrics = ExecutionMetrics::default();
        assert_eq!(metrics.duration_us, 0);
        assert!(metrics.host_calls.is_empty());
        assert!(!metrics.cache_hit);
    }

    #[test]
    fn test_execution_metrics_builder() {
        let metrics = ExecutionMetrics::new()
            .with_duration(Duration::from_millis(100))
            .with_cache_hit(true)
            .with_memory(1000, 2000);

        assert_eq!(metrics.duration_us, 100_000);
        assert!(metrics.cache_hit);
        assert_eq!(metrics.memory_used_bytes, 1000);
        assert_eq!(metrics.memory_peak_bytes, 2000);
    }

    #[test]
    fn test_metrics_collector() {
        let collector = MetricsCollector::new();
        
        let metrics = ExecutionMetrics::new()
            .with_duration(Duration::from_millis(10))
            .with_cache_hit(true);
        
        collector.record_execution(&metrics, true);
        collector.record_execution(&metrics, false);
        
        assert_eq!(collector.total_executions(), 2);
        assert_eq!(collector.successful_executions(), 1);
        assert_eq!(collector.failed_executions(), 1);
    }

    #[test]
    fn test_cache_hit_rate() {
        let collector = MetricsCollector::new();
        
        let hit = ExecutionMetrics::new().with_cache_hit(true);
        let miss = ExecutionMetrics::new().with_cache_hit(false);
        
        collector.record_execution(&hit, true);
        collector.record_execution(&hit, true);
        collector.record_execution(&miss, true);
        
        assert!((collector.cache_hit_rate() - 0.666).abs() < 0.01);
    }

    #[test]
    fn test_prometheus_output() {
        let collector = MetricsCollector::new();
        let metrics = ExecutionMetrics::new();
        collector.record_execution(&metrics, true);
        
        let output = collector.to_prometheus();
        assert!(output.contains("nexus_handler_executions_total"));
        assert!(output.contains("nexus_cache_hit_rate"));
    }

    #[test]
    fn test_execution_timer() {
        let timer = ExecutionTimer::start();
        std::thread::sleep(Duration::from_millis(10));
        let elapsed = timer.elapsed();
        assert!(elapsed >= Duration::from_millis(10));
    }
}
