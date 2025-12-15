//! Host functions exposed to WASM handlers.
//!
//! These functions are called from within the QuickJS environment running in WASM
//! and provide access to state, events, view manipulation, and extensions.

pub mod events;
pub mod extension;
pub mod logging;
pub mod state;
pub mod view;

use crate::context::ExecutionContext;
use crate::error::error_codes;
use parking_lot::Mutex;
use std::sync::Arc;

/// Shared execution context for host functions
pub type SharedContext = Arc<Mutex<ExecutionContext>>;

/// Host function registry
pub struct HostFunctions {
    /// Shared execution context
    context: SharedContext,
    /// Maximum host calls limit
    max_host_calls: u32,
}

impl HostFunctions {
    /// Create a new host function registry
    pub fn new(context: SharedContext, max_host_calls: u32) -> Self {
        Self {
            context,
            max_host_calls,
        }
    }

    /// Check and increment host call count
    pub fn check_host_call_limit(&self) -> Result<(), i32> {
        let mut ctx = self.context.lock();
        let count = ctx.increment_host_calls();
        if count > self.max_host_calls {
            Err(error_codes::RESOURCE_LIMIT)
        } else {
            Ok(())
        }
    }

    /// Get the execution context
    pub fn context(&self) -> SharedContext {
        Arc::clone(&self.context)
    }
}

/// Trait for host function implementations
pub trait HostFunction {
    /// The function name (e.g., "__nexus_state_get")
    fn name(&self) -> &'static str;

    /// The function signature description
    fn signature(&self) -> &'static str;
}

/// Result type for host functions
pub type HostResult<T> = std::result::Result<T, i32>;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::{ExecutionContext, WasmContext};

    fn create_test_context() -> SharedContext {
        let wasm_ctx = WasmContext::new("test-panel", "test-handler");
        Arc::new(Mutex::new(ExecutionContext::from_wasm_context(wasm_ctx)))
    }

    #[test]
    fn test_host_functions_creation() {
        let ctx = create_test_context();
        let host = HostFunctions::new(ctx, 100);
        assert!(host.check_host_call_limit().is_ok());
    }

    #[test]
    fn test_host_call_limit() {
        let ctx = create_test_context();
        let host = HostFunctions::new(ctx, 2);

        assert!(host.check_host_call_limit().is_ok()); // 1
        assert!(host.check_host_call_limit().is_ok()); // 2
        assert!(host.check_host_call_limit().is_err()); // 3 - exceeds limit
    }
}
