//! # Nexus WASM Bridge
//!
//! This library provides secure, isolated execution of JavaScript handler code
//! using WasmEdge and QuickJS. It exposes a Node.js N-API interface for the
//! Nexus Reactor to invoke handlers.
//!
//! ## Architecture
//!
//! ```text
//! Node.js (NexusReactor)
//!     │
//!     │ N-API FFI
//!     ▼
//! Rust Bridge (this crate)
//!     │
//!     │ WASM Invocation
//!     ▼
//! QuickJS in WasmEdge
//! ```
//!
//! ## Features
//!
//! - **True Isolation**: Each handler runs in a separate WASM instance
//! - **Capability-Based Security**: Handlers must declare required capabilities
//! - **Suspend/Resume**: Async operations via Asyncify
//! - **Instance Pooling**: Efficient resource management
//! - **Compilation Caching**: Persistent bytecode cache

#![deny(missing_docs)]
#![deny(unsafe_op_in_unsafe_fn)]

pub mod capability;
pub mod config;
pub mod context;
pub mod engine;
pub mod error;
pub mod host_functions;
pub mod metrics;
pub mod napi;

// Re-export commonly used types
pub use capability::{Capability, CapabilityToken};
pub use config::RuntimeConfig;
pub use context::{ExecutionContext, SuspensionDetails, WasmContext, WasmResult};
pub use engine::{WasmInstance, WasmRuntime};
pub use error::{ErrorCode, WasmError};
pub use metrics::ExecutionMetrics;

/// The embedded QuickJS wrapper script that injects $state, $args, etc.
pub const QUICKJS_WRAPPER: &str = include_str!("quickjs_wrapper.js");

/// Library version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert_eq!(VERSION, "1.0.0");
    }

    #[test]
    fn test_quickjs_wrapper_loaded() {
        assert!(!QUICKJS_WRAPPER.is_empty());
        assert!(QUICKJS_WRAPPER.contains("$state"));
        assert!(QUICKJS_WRAPPER.contains("$emit"));
    }
}
