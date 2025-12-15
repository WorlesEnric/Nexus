//! WASM instance management.
//!
//! Each WasmInstance represents a single QuickJS runtime running in WasmEdge.

use super::compiler::CompiledHandler;
use crate::config::{ResourceLimits, RuntimeConfig};
use crate::context::{
    AsyncResult, ExecutionContext, ExecutionStatus, RuntimeValue, WasmContext, WasmResult,
};
use crate::error::{Result, RuntimeError, WasmError};
use crate::host_functions::{events, extension, logging, state, view, SharedContext};
use crate::metrics::ExecutionMetrics;
use parking_lot::Mutex;
use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;

/// Unique instance ID
pub type InstanceId = String;

/// WASM instance state
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstanceState {
    /// Instance is idle and available
    Idle,
    /// Instance is currently executing
    Executing,
    /// Instance is suspended waiting for async operation
    Suspended,
    /// Instance has terminated
    Terminated,
}

/// A single WASM instance
pub struct WasmInstance {
    /// Unique instance ID
    id: InstanceId,
    /// Instance state
    state: InstanceState,
    /// Configuration
    config: RuntimeConfig,
    /// Resource limits
    limits: ResourceLimits,
    /// Memory usage in bytes
    memory_used: u64,
    /// Peak memory in bytes
    memory_peak: u64,
    /// Creation time
    created_at: Instant,
    /// Execution count
    execution_count: u64,
    /// Current execution context (if executing or suspended)
    context: Option<SharedContext>,
    /// Suspension ID (if suspended)
    suspension_id: Option<String>,
}

impl WasmInstance {
    /// Create a new WASM instance
    pub fn new(config: &RuntimeConfig) -> Result<Self> {
        let id = Uuid::new_v4().to_string();

        Ok(Self {
            id,
            state: InstanceState::Idle,
            config: config.clone(),
            limits: ResourceLimits::default(),
            memory_used: 0,
            memory_peak: 0,
            created_at: Instant::now(),
            execution_count: 0,
            context: None,
            suspension_id: None,
        })
    }

    /// Get the instance ID
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Get the instance state
    pub fn state(&self) -> InstanceState {
        self.state
    }

    /// Get memory usage
    pub fn memory_used(&self) -> u64 {
        self.memory_used
    }

    /// Get peak memory
    pub fn memory_peak(&self) -> u64 {
        self.memory_peak
    }

    /// Get suspension ID (if suspended)
    pub fn suspension_id(&self) -> Option<&str> {
        self.suspension_id.as_deref()
    }

    /// Reset the instance for reuse
    pub fn reset(&mut self) -> Result<()> {
        if self.state == InstanceState::Terminated {
            return Err(RuntimeError::InvalidState(
                "Cannot reset terminated instance".into(),
            ));
        }

        self.state = InstanceState::Idle;
        self.context = None;
        self.suspension_id = None;
        self.memory_used = 0;

        Ok(())
    }

    /// Execute a compiled handler
    pub async fn execute(
        &mut self,
        compiled: &CompiledHandler,
        wasm_context: WasmContext,
    ) -> Result<WasmResult> {
        if self.state != InstanceState::Idle {
            return Err(RuntimeError::InvalidState(format!(
                "Instance not idle: {:?}",
                self.state
            )));
        }

        self.state = InstanceState::Executing;
        self.execution_count += 1;

        let start = Instant::now();

        // Create execution context
        let exec_context = ExecutionContext::from_wasm_context(wasm_context);
        let shared_context: SharedContext = Arc::new(Mutex::new(exec_context));
        self.context = Some(Arc::clone(&shared_context));

        // Execute the handler
        // In a real implementation, this would:
        // 1. Load the QuickJS WASM module
        // 2. Inject the handler bytecode
        // 3. Inject the context (state, args, scope)
        // 4. Execute and collect results
        let result = self.execute_internal(compiled, &shared_context).await;

        let duration = start.elapsed();
        let context = shared_context.lock();

        // Build result
        let wasm_result = match result {
            Ok(return_value) => {
                // Check for suspension
                if context.suspension.is_some() {
                    let suspension = context.suspension.as_ref().unwrap();
                    self.state = InstanceState::Suspended;
                    self.suspension_id = Some(suspension.id.clone());

                    WasmResult {
                        status: ExecutionStatus::Suspended,
                        return_value: None,
                        state_mutations: context.state_mutations.clone(),
                        events: context.events.clone(),
                        view_commands: context.view_commands.clone(),
                        suspension: Some(crate::context::SuspensionDetails {
                            suspension_id: suspension.id.clone(),
                            extension_name: suspension.extension_name.clone(),
                            method: suspension.method.clone(),
                            args: suspension.args.clone(),
                        }),
                        error: None,
                        metrics: ExecutionMetrics::new()
                            .with_duration(duration)
                            .with_memory(self.memory_used, self.memory_peak),
                    }
                } else {
                    self.state = InstanceState::Idle;

                    WasmResult {
                        status: ExecutionStatus::Success,
                        return_value,
                        state_mutations: context.state_mutations.clone(),
                        events: context.events.clone(),
                        view_commands: context.view_commands.clone(),
                        suspension: None,
                        error: None,
                        metrics: ExecutionMetrics::new()
                            .with_duration(duration)
                            .with_memory(self.memory_used, self.memory_peak),
                    }
                }
            }
            Err(e) => {
                self.state = InstanceState::Idle;

                WasmResult::error(
                    e.to_wasm_error(),
                    ExecutionMetrics::new()
                        .with_duration(duration)
                        .with_memory(self.memory_used, self.memory_peak),
                )
                .with_mutations(context.state_mutations.clone())
                .with_events(context.events.clone())
                .with_view_commands(context.view_commands.clone())
            }
        };

        Ok(wasm_result)
    }

    /// Resume a suspended handler
    pub async fn resume(&mut self, result: AsyncResult) -> Result<WasmResult> {
        if self.state != InstanceState::Suspended {
            return Err(RuntimeError::InvalidState(format!(
                "Instance not suspended: {:?}",
                self.state
            )));
        }

        self.state = InstanceState::Executing;
        self.suspension_id = None;

        let start = Instant::now();

        // Resume execution with the async result
        // In a real implementation, this would:
        // 1. Inject the async result into the WASM memory
        // 2. Call asyncify_start_rewind to restore the stack
        // 3. Continue execution
        let execution_result = self.resume_internal(result).await;

        let duration = start.elapsed();
        let context = self
            .context
            .as_ref()
            .ok_or_else(|| RuntimeError::InvalidState("No context".into()))?;
        let context = context.lock();

        let wasm_result = match execution_result {
            Ok(return_value) => {
                // Check for another suspension
                if context.suspension.is_some() {
                    let suspension = context.suspension.as_ref().unwrap();
                    self.state = InstanceState::Suspended;
                    self.suspension_id = Some(suspension.id.clone());

                    WasmResult {
                        status: ExecutionStatus::Suspended,
                        return_value: None,
                        state_mutations: context.state_mutations.clone(),
                        events: context.events.clone(),
                        view_commands: context.view_commands.clone(),
                        suspension: Some(crate::context::SuspensionDetails {
                            suspension_id: suspension.id.clone(),
                            extension_name: suspension.extension_name.clone(),
                            method: suspension.method.clone(),
                            args: suspension.args.clone(),
                        }),
                        error: None,
                        metrics: ExecutionMetrics::new().with_duration(duration),
                    }
                } else {
                    self.state = InstanceState::Idle;
                    self.context = None;

                    WasmResult {
                        status: ExecutionStatus::Success,
                        return_value,
                        state_mutations: context.state_mutations.clone(),
                        events: context.events.clone(),
                        view_commands: context.view_commands.clone(),
                        suspension: None,
                        error: None,
                        metrics: ExecutionMetrics::new().with_duration(duration),
                    }
                }
            }
            Err(e) => {
                self.state = InstanceState::Idle;
                self.context = None;

                WasmResult::error(e.to_wasm_error(), ExecutionMetrics::new().with_duration(duration))
            }
        };

        Ok(wasm_result)
    }

    /// Terminate the instance
    pub fn terminate(&mut self) {
        self.state = InstanceState::Terminated;
        self.context = None;
        self.suspension_id = None;
    }

    /// Internal execution (simulated)
    ///
    /// In a real implementation, this would interface with WasmEdge
    async fn execute_internal(
        &mut self,
        _compiled: &CompiledHandler,
        _context: &SharedContext,
    ) -> Result<Option<RuntimeValue>> {
        // Simulated execution
        // In real implementation:
        // 1. Create WasmEdge VM
        // 2. Load QuickJS module
        // 3. Register host functions
        // 4. Inject context
        // 5. Execute bytecode
        // 6. Return result

        // Simulate some memory usage
        self.memory_used = 1024 * 1024; // 1MB
        self.memory_peak = 1024 * 1024;

        Ok(None)
    }

    /// Internal resume (simulated)
    async fn resume_internal(&mut self, _result: AsyncResult) -> Result<Option<RuntimeValue>> {
        // Simulated resume
        // In real implementation:
        // 1. Inject result into WASM memory
        // 2. Call asyncify_start_rewind
        // 3. Continue execution
        Ok(None)
    }
}

impl Drop for WasmInstance {
    fn drop(&mut self) {
        if self.state != InstanceState::Terminated {
            self.terminate();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_instance_creation() {
        let config = RuntimeConfig::default();
        let instance = WasmInstance::new(&config).unwrap();

        assert_eq!(instance.state(), InstanceState::Idle);
        assert!(!instance.id().is_empty());
    }

    #[test]
    fn test_instance_reset() {
        let config = RuntimeConfig::default();
        let mut instance = WasmInstance::new(&config).unwrap();

        instance.reset().unwrap();
        assert_eq!(instance.state(), InstanceState::Idle);
    }

    #[test]
    fn test_instance_terminate() {
        let config = RuntimeConfig::default();
        let mut instance = WasmInstance::new(&config).unwrap();

        instance.terminate();
        assert_eq!(instance.state(), InstanceState::Terminated);
    }

    #[test]
    fn test_cannot_reset_terminated() {
        let config = RuntimeConfig::default();
        let mut instance = WasmInstance::new(&config).unwrap();

        instance.terminate();
        assert!(instance.reset().is_err());
    }
}
