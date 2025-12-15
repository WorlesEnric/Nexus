//! WASM engine management.
//!
//! This module provides the core WasmRuntime that manages WASM instance
//! pooling, compilation caching, and handler execution.

pub mod compiler;
pub mod instance;
pub mod pool;

use crate::config::RuntimeConfig;
use crate::context::{AsyncResult, WasmContext, WasmResult};
use crate::error::{Result, RuntimeError, WasmError};
use crate::metrics::{ExecutionMetrics, ExecutionTimer, MetricsCollector};
use compiler::HandlerCompiler;
use pool::InstancePool;
use std::sync::Arc;
use tokio::time::{timeout, Duration};
use tracing::{debug, error, info, instrument, warn};

/// The main WASM runtime
pub struct WasmRuntime {
    /// Runtime configuration
    config: RuntimeConfig,
    /// Instance pool
    pool: InstancePool,
    /// Handler compiler
    compiler: HandlerCompiler,
    /// Metrics collector
    metrics: Arc<MetricsCollector>,
}

impl WasmRuntime {
    /// Create a new WASM runtime
    pub fn new(config: RuntimeConfig) -> Result<Self> {
        config.validate()?;

        info!(
            max_instances = config.max_instances,
            memory_limit = config.memory_limit_bytes,
            "Initializing WASM runtime"
        );

        let pool = InstancePool::new(&config)?;
        let compiler = HandlerCompiler::new(&config)?;
        let metrics = Arc::new(MetricsCollector::new());

        Ok(Self {
            config,
            pool,
            compiler,
            metrics,
        })
    }

    /// Execute a handler in WASM sandbox
    #[instrument(skip(self, handler_code, context), fields(panel_id = %context.panel_id, handler = %context.handler_name))]
    pub async fn execute_handler(
        &self,
        handler_code: &str,
        context: WasmContext,
        timeout_ms: u32,
    ) -> Result<WasmResult> {
        let timer = ExecutionTimer::start();

        // Compile handler (may be cached)
        let compiled = self.compiler.compile(handler_code)?;
        let cache_hit = compiled.cache_hit;

        debug!(cache_hit = cache_hit, "Handler compiled");

        // Acquire instance from pool
        let instance = self.pool.acquire().await?;

        debug!("Acquired WASM instance from pool");

        // Execute with timeout
        let timeout_duration = Duration::from_millis(timeout_ms as u64);
        let result = timeout(timeout_duration, instance.execute(&compiled, context)).await;

        // Release instance back to pool
        self.pool.release(instance);

        // Handle timeout
        let wasm_result = match result {
            Ok(Ok(result)) => result,
            Ok(Err(e)) => {
                let metrics = timer.into_metrics(cache_hit);
                self.metrics.record_execution(&metrics, false);
                self.metrics.record_error(&e.to_wasm_error().code.to_string());
                return Err(e);
            }
            Err(_) => {
                warn!(timeout_ms = timeout_ms, "Handler execution timed out");
                let metrics = timer.into_metrics(cache_hit);
                self.metrics.record_execution(&metrics, false);
                self.metrics.record_error("TIMEOUT");
                return Ok(WasmResult::error(
                    WasmError::timeout(timeout_ms),
                    metrics,
                ));
            }
        };

        let metrics = timer.into_metrics(cache_hit);
        let success = wasm_result.error.is_none();
        self.metrics.record_execution(&metrics, success);

        Ok(wasm_result)
    }

    /// Pre-compile handler code to bytecode
    #[instrument(skip(self, handler_code))]
    pub async fn precompile_handler(&self, handler_code: &str) -> Result<Vec<u8>> {
        let compiled = self.compiler.compile(handler_code)?;
        Ok(compiled.bytecode)
    }

    /// Execute pre-compiled handler bytecode
    #[instrument(skip(self, bytecode, context), fields(panel_id = %context.panel_id, handler = %context.handler_name))]
    pub async fn execute_compiled_handler(
        &self,
        bytecode: &[u8],
        context: WasmContext,
        timeout_ms: u32,
    ) -> Result<WasmResult> {
        let timer = ExecutionTimer::start();

        // Create compiled handler from bytecode
        let compiled = compiler::CompiledHandler {
            bytecode: bytecode.to_vec(),
            source_map: None,
            cache_hit: true, // Pre-compiled is always a "cache hit"
        };

        // Acquire instance from pool
        let instance = self.pool.acquire().await?;

        // Execute with timeout
        let timeout_duration = Duration::from_millis(timeout_ms as u64);
        let result = timeout(timeout_duration, instance.execute(&compiled, context)).await;

        // Release instance back to pool
        self.pool.release(instance);

        // Handle timeout
        let wasm_result = match result {
            Ok(Ok(result)) => result,
            Ok(Err(e)) => {
                let metrics = timer.into_metrics(true);
                self.metrics.record_execution(&metrics, false);
                return Err(e);
            }
            Err(_) => {
                let metrics = timer.into_metrics(true);
                self.metrics.record_execution(&metrics, false);
                return Ok(WasmResult::error(WasmError::timeout(timeout_ms), metrics));
            }
        };

        let metrics = timer.into_metrics(true);
        let success = wasm_result.error.is_none();
        self.metrics.record_execution(&metrics, success);

        Ok(wasm_result)
    }

    /// Resume a suspended handler execution
    #[instrument(skip(self, result), fields(suspension_id = %suspension_id))]
    pub async fn resume_handler(
        &self,
        suspension_id: &str,
        result: AsyncResult,
    ) -> Result<WasmResult> {
        debug!(
            success = result.success,
            "Resuming suspended handler execution"
        );

        // Get the suspended instance from the pool
        let instance = self
            .pool
            .get_suspended(suspension_id)
            .ok_or_else(|| RuntimeError::Suspension("Suspension not found".into()))?;

        // Resume execution
        let timer = ExecutionTimer::start();
        let wasm_result = instance.resume(result).await?;
        let metrics = timer.into_metrics(true);

        let success = wasm_result.error.is_none();
        self.metrics.record_execution(&metrics, success);

        Ok(wasm_result)
    }

    /// Get runtime statistics
    pub fn get_stats(&self) -> crate::metrics::RuntimeStats {
        crate::metrics::RuntimeStats {
            total_executions: self.metrics.total_executions(),
            active_instances: self.pool.active_count(),
            available_instances: self.pool.available_count(),
            cache_hit_rate: self.metrics.cache_hit_rate(),
            avg_execution_time_us: self.metrics.avg_execution_time_us(),
            total_memory_bytes: self.pool.total_memory(),
        }
    }

    /// Get Prometheus metrics
    pub fn get_prometheus_metrics(&self) -> String {
        self.metrics.to_prometheus()
    }

    /// Shutdown the runtime and cleanup resources
    pub async fn shutdown(&self) -> Result<()> {
        info!("Shutting down WASM runtime");
        self.pool.shutdown().await;
        Ok(())
    }
}

/// Re-export WasmInstance for convenience
pub use instance::WasmInstance;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capability::CapabilityToken;
    use std::collections::HashMap;

    fn create_runtime() -> WasmRuntime {
        WasmRuntime::new(RuntimeConfig::default()).unwrap()
    }

    #[tokio::test]
    async fn test_runtime_creation() {
        let runtime = create_runtime();
        let stats = runtime.get_stats();
        assert_eq!(stats.total_executions, 0);
    }

    // Note: Full execution tests require the actual QuickJS WASM module
    // These would be integration tests in a real implementation
}
