//! N-API bindings for Node.js integration.
//!
//! This module exposes the WASM runtime to Node.js via N-API,
//! allowing the workspace-kernel to interact with the Rust runtime.

use crate::capability::CapabilityChecker;
use crate::config::RuntimeConfig;
use crate::context::{AsyncResult, RuntimeValue, WasmContext, WasmResult};
use crate::engine::WasmRuntime;
use crate::error::RuntimeError;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// JavaScript-friendly configuration
#[napi(object)]
pub struct JsRuntimeConfig {
    /// Maximum number of WASM instances
    pub max_instances: Option<u32>,
    /// Minimum number of pre-warmed instances
    pub min_instances: Option<u32>,
    /// Memory limit per instance in bytes
    pub memory_limit_bytes: Option<u32>,
    /// Execution timeout in milliseconds
    pub timeout_ms: Option<u32>,
    /// Maximum host calls per execution
    pub max_host_calls: Option<u32>,
    /// Cache directory for bytecode
    pub cache_dir: Option<String>,
    /// Maximum cache size in bytes
    pub max_cache_size_bytes: Option<u32>,
}

impl From<JsRuntimeConfig> for RuntimeConfig {
    fn from(js: JsRuntimeConfig) -> Self {
        RuntimeConfig {
            max_instances: js.max_instances.unwrap_or(10),
            min_instances: js.min_instances,
            memory_limit_bytes: js.memory_limit_bytes.unwrap_or(32 * 1024 * 1024),
            timeout_ms: js.timeout_ms.unwrap_or(5000),
            max_host_calls: js.max_host_calls.unwrap_or(1000),
            cache_dir: js.cache_dir,
            max_cache_size_bytes: js.max_cache_size_bytes.map(|v| v as usize),
        }
    }
}

/// JavaScript-friendly execution context
#[napi(object)]
pub struct JsWasmContext {
    /// Panel ID
    pub panel_id: String,
    /// Handler name
    pub handler_name: String,
    /// Current state snapshot (MessagePack encoded)
    pub state: Buffer,
    /// Handler arguments (MessagePack encoded)
    pub args: Buffer,
    /// Variable scope (MessagePack encoded)
    pub scope: Buffer,
    /// Granted capabilities
    pub capabilities: Vec<String>,
}

impl TryFrom<JsWasmContext> for WasmContext {
    type Error = napi::Error;

    fn try_from(js: JsWasmContext) -> Result<Self> {
        // Decode MessagePack state
        let state: HashMap<String, RuntimeValue> = if js.state.is_empty() {
            HashMap::new()
        } else {
            rmp_serde::from_slice(&js.state)
                .map_err(|e| napi::Error::from_reason(format!("Failed to decode state: {}", e)))?
        };

        // Decode MessagePack args
        let args: RuntimeValue = if js.args.is_empty() {
            RuntimeValue::Null
        } else {
            rmp_serde::from_slice(&js.args)
                .map_err(|e| napi::Error::from_reason(format!("Failed to decode args: {}", e)))?
        };

        // Decode MessagePack scope
        let scope: HashMap<String, RuntimeValue> = if js.scope.is_empty() {
            HashMap::new()
        } else {
            rmp_serde::from_slice(&js.scope)
                .map_err(|e| napi::Error::from_reason(format!("Failed to decode scope: {}", e)))?
        };

        // Parse capabilities
        let capabilities = js
            .capabilities
            .iter()
            .filter_map(|s| s.parse().ok())
            .collect();

        Ok(WasmContext {
            panel_id: js.panel_id,
            handler_name: js.handler_name,
            state,
            args,
            scope,
            capabilities,
        })
    }
}

/// JavaScript-friendly execution result
#[napi(object)]
pub struct JsWasmResult {
    /// Execution status: "success", "suspended", "error"
    pub status: String,
    /// Return value (MessagePack encoded)
    pub return_value: Option<Buffer>,
    /// State mutations (MessagePack encoded array)
    pub state_mutations: Buffer,
    /// Emitted events (MessagePack encoded array)
    pub events: Buffer,
    /// View commands (MessagePack encoded array)
    pub view_commands: Buffer,
    /// Suspension details (if suspended)
    pub suspension: Option<JsSuspension>,
    /// Error details (if error)
    pub error: Option<JsWasmError>,
    /// Execution metrics
    pub metrics: JsMetrics,
}

impl From<WasmResult> for JsWasmResult {
    fn from(result: WasmResult) -> Self {
        Self {
            status: result.status.to_string(),
            return_value: result.return_value.map(|v| {
                Buffer::from(rmp_serde::to_vec(&v).unwrap_or_default())
            }),
            state_mutations: Buffer::from(
                rmp_serde::to_vec(&result.state_mutations).unwrap_or_default()
            ),
            events: Buffer::from(
                rmp_serde::to_vec(&result.events).unwrap_or_default()
            ),
            view_commands: Buffer::from(
                rmp_serde::to_vec(&result.view_commands).unwrap_or_default()
            ),
            suspension: result.suspension.map(|s| JsSuspension {
                suspension_id: s.suspension_id,
                extension_name: s.extension_name,
                method: s.method,
                args: Buffer::from(rmp_serde::to_vec(&s.args).unwrap_or_default()),
            }),
            error: result.error.map(|e| JsWasmError {
                code: e.code.to_string(),
                message: e.message,
                location: e.location.map(|l| JsLocation {
                    line: l.line as u32,
                    column: l.column as u32,
                    source_snippet: l.source_snippet,
                }),
            }),
            metrics: JsMetrics {
                execution_time_us: result.metrics.execution_time_us,
                memory_used_bytes: result.metrics.memory_used_bytes,
                memory_peak_bytes: result.metrics.memory_peak_bytes,
                host_calls: result.metrics.host_calls,
                cache_hit: result.metrics.cache_hit,
            },
        }
    }
}

/// JavaScript-friendly suspension details
#[napi(object)]
pub struct JsSuspension {
    /// Unique suspension ID
    pub suspension_id: String,
    /// Extension name
    pub extension_name: String,
    /// Method being called
    pub method: String,
    /// Arguments (MessagePack encoded)
    pub args: Buffer,
}

/// JavaScript-friendly async result for resumption
#[napi(object)]
pub struct JsAsyncResult {
    /// Whether the operation succeeded
    pub success: bool,
    /// Result value (MessagePack encoded)
    pub value: Option<Buffer>,
    /// Error message if failed
    pub error: Option<String>,
}

impl TryFrom<JsAsyncResult> for AsyncResult {
    type Error = napi::Error;

    fn try_from(js: JsAsyncResult) -> Result<Self> {
        let value = if let Some(buf) = js.value {
            if buf.is_empty() {
                RuntimeValue::Null
            } else {
                rmp_serde::from_slice(&buf)
                    .map_err(|e| napi::Error::from_reason(format!("Failed to decode value: {}", e)))?
            }
        } else {
            RuntimeValue::Null
        };

        Ok(AsyncResult {
            success: js.success,
            value,
            error: js.error,
        })
    }
}

/// JavaScript-friendly error details
#[napi(object)]
pub struct JsWasmError {
    /// Error code
    pub code: String,
    /// Error message
    pub message: String,
    /// Source location
    pub location: Option<JsLocation>,
}

/// JavaScript-friendly source location
#[napi(object)]
pub struct JsLocation {
    /// Line number (1-indexed)
    pub line: u32,
    /// Column number (1-indexed)
    pub column: u32,
    /// Source code snippet
    pub source_snippet: Option<String>,
}

/// JavaScript-friendly metrics
#[napi(object)]
pub struct JsMetrics {
    /// Execution time in microseconds
    pub execution_time_us: u64,
    /// Memory used in bytes
    pub memory_used_bytes: u64,
    /// Peak memory in bytes
    pub memory_peak_bytes: u64,
    /// Number of host function calls
    pub host_calls: u32,
    /// Whether bytecode was from cache
    pub cache_hit: bool,
}

/// JavaScript-friendly runtime statistics
#[napi(object)]
pub struct JsRuntimeStats {
    /// Total executions
    pub total_executions: u64,
    /// Active instances
    pub active_instances: usize,
    /// Available instances
    pub available_instances: usize,
    /// Cache hit rate (0.0 - 1.0)
    pub cache_hit_rate: f64,
    /// Average execution time in microseconds
    pub avg_execution_time_us: u64,
    /// Total memory in bytes
    pub total_memory_bytes: u64,
}

/// The WASM runtime wrapper exposed to Node.js
#[napi]
pub struct NexusRuntime {
    inner: Arc<RwLock<Option<WasmRuntime>>>,
}

#[napi]
impl NexusRuntime {
    /// Create a new runtime with the given configuration
    #[napi(constructor)]
    pub fn new(config: Option<JsRuntimeConfig>) -> Result<Self> {
        let config = config.map(RuntimeConfig::from).unwrap_or_default();

        let runtime = WasmRuntime::new(config)
            .map_err(|e| napi::Error::from_reason(format!("Failed to create runtime: {}", e)))?;

        Ok(Self {
            inner: Arc::new(RwLock::new(Some(runtime))),
        })
    }

    /// Execute a handler in the WASM sandbox
    #[napi]
    pub async fn execute_handler(
        &self,
        handler_code: String,
        context: JsWasmContext,
        timeout_ms: Option<u32>,
    ) -> Result<JsWasmResult> {
        let inner = self.inner.read().await;
        let runtime = inner
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Runtime has been shut down"))?;

        let wasm_context = WasmContext::try_from(context)?;
        let timeout = timeout_ms.unwrap_or(5000);

        let result = runtime
            .execute_handler(&handler_code, wasm_context, timeout)
            .await
            .map_err(|e| napi::Error::from_reason(format!("Execution failed: {}", e)))?;

        Ok(JsWasmResult::from(result))
    }

    /// Pre-compile handler code to bytecode
    #[napi]
    pub async fn precompile_handler(&self, handler_code: String) -> Result<Buffer> {
        let inner = self.inner.read().await;
        let runtime = inner
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Runtime has been shut down"))?;

        let bytecode = runtime
            .precompile_handler(&handler_code)
            .await
            .map_err(|e| napi::Error::from_reason(format!("Compilation failed: {}", e)))?;

        Ok(Buffer::from(bytecode))
    }

    /// Execute pre-compiled bytecode
    #[napi]
    pub async fn execute_compiled_handler(
        &self,
        bytecode: Buffer,
        context: JsWasmContext,
        timeout_ms: Option<u32>,
    ) -> Result<JsWasmResult> {
        let inner = self.inner.read().await;
        let runtime = inner
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Runtime has been shut down"))?;

        let wasm_context = WasmContext::try_from(context)?;
        let timeout = timeout_ms.unwrap_or(5000);

        let result = runtime
            .execute_compiled_handler(&bytecode, wasm_context, timeout)
            .await
            .map_err(|e| napi::Error::from_reason(format!("Execution failed: {}", e)))?;

        Ok(JsWasmResult::from(result))
    }

    /// Resume a suspended handler execution
    #[napi]
    pub async fn resume_handler(
        &self,
        suspension_id: String,
        result: JsAsyncResult,
    ) -> Result<JsWasmResult> {
        let inner = self.inner.read().await;
        let runtime = inner
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Runtime has been shut down"))?;

        let async_result = AsyncResult::try_from(result)?;

        let wasm_result = runtime
            .resume_handler(&suspension_id, async_result)
            .await
            .map_err(|e| napi::Error::from_reason(format!("Resume failed: {}", e)))?;

        Ok(JsWasmResult::from(wasm_result))
    }

    /// Get runtime statistics
    #[napi]
    pub async fn get_stats(&self) -> Result<JsRuntimeStats> {
        let inner = self.inner.read().await;
        let runtime = inner
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Runtime has been shut down"))?;

        let stats = runtime.get_stats();

        Ok(JsRuntimeStats {
            total_executions: stats.total_executions,
            active_instances: stats.active_instances,
            available_instances: stats.available_instances,
            cache_hit_rate: stats.cache_hit_rate,
            avg_execution_time_us: stats.avg_execution_time_us,
            total_memory_bytes: stats.total_memory_bytes,
        })
    }

    /// Get Prometheus metrics
    #[napi]
    pub async fn get_prometheus_metrics(&self) -> Result<String> {
        let inner = self.inner.read().await;
        let runtime = inner
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Runtime has been shut down"))?;

        Ok(runtime.get_prometheus_metrics())
    }

    /// Infer capabilities from handler code
    #[napi]
    pub fn infer_capabilities(handler_code: String) -> Vec<String> {
        CapabilityChecker::infer_from_code(&handler_code)
            .into_iter()
            .map(|c| c.to_string())
            .collect()
    }

    /// Shutdown the runtime
    #[napi]
    pub async fn shutdown(&self) -> Result<()> {
        let mut inner = self.inner.write().await;
        
        if let Some(runtime) = inner.take() {
            runtime
                .shutdown()
                .await
                .map_err(|e| napi::Error::from_reason(format!("Shutdown failed: {}", e)))?;
        }

        Ok(())
    }
}

/// Initialize the module
#[napi]
pub fn init() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("nexus_wasm_bridge=debug".parse().unwrap()),
        )
        .init();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_conversion() {
        let js_config = JsRuntimeConfig {
            max_instances: Some(20),
            min_instances: Some(5),
            memory_limit_bytes: Some(64 * 1024 * 1024),
            timeout_ms: Some(10000),
            max_host_calls: Some(2000),
            cache_dir: Some("/tmp/cache".to_string()),
            max_cache_size_bytes: Some(128 * 1024 * 1024),
        };

        let config: RuntimeConfig = js_config.into();

        assert_eq!(config.max_instances, 20);
        assert_eq!(config.min_instances, Some(5));
        assert_eq!(config.memory_limit_bytes, 64 * 1024 * 1024);
        assert_eq!(config.timeout_ms, 10000);
    }

    #[test]
    fn test_infer_capabilities() {
        let code = r#"
            const count = $state.get('count');
            $state.set('count', count + 1);
            $emit('updated', { count: count + 1 });
        "#;

        let caps = NexusRuntime::infer_capabilities(code.to_string());
        
        assert!(caps.contains(&"state:read".to_string()));
        assert!(caps.contains(&"state:write".to_string()));
        assert!(caps.contains(&"events:emit".to_string()));
    }
}
