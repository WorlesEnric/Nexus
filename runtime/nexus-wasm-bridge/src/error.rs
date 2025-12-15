//! Error types for the WASM runtime.
//!
//! This module defines error codes, error details, and the main error type
//! used throughout the runtime.

use serde::{Deserialize, Serialize};

/// Error codes for categorizing errors
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    /// Handler exceeded time limit
    Timeout,
    /// Handler exceeded memory limit
    MemoryLimit,
    /// Handler attempted unauthorized operation
    PermissionDenied,
    /// Runtime error in handler code (e.g., null pointer, type error)
    ExecutionError,
    /// Handler code failed to compile
    CompilationError,
    /// Invalid handler structure or NXML
    InvalidHandler,
    /// Internal runtime error (bug)
    InternalError,
    /// Resource limit exceeded (host calls, mutations, etc.)
    ResourceLimit,
    /// WASM instance error
    WasmError,
    /// Serialization/deserialization error
    SerializationError,
    /// Invalid argument
    InvalidArgument,
    /// Extension not found
    ExtensionNotFound,
    /// Method not found
    MethodNotFound,
}

impl std::fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ErrorCode::Timeout => write!(f, "TIMEOUT"),
            ErrorCode::MemoryLimit => write!(f, "MEMORY_LIMIT"),
            ErrorCode::PermissionDenied => write!(f, "PERMISSION_DENIED"),
            ErrorCode::ExecutionError => write!(f, "EXECUTION_ERROR"),
            ErrorCode::CompilationError => write!(f, "COMPILATION_ERROR"),
            ErrorCode::InvalidHandler => write!(f, "INVALID_HANDLER"),
            ErrorCode::InternalError => write!(f, "INTERNAL_ERROR"),
            ErrorCode::ResourceLimit => write!(f, "RESOURCE_LIMIT"),
            ErrorCode::WasmError => write!(f, "WASM_ERROR"),
            ErrorCode::SerializationError => write!(f, "SERIALIZATION_ERROR"),
            ErrorCode::InvalidArgument => write!(f, "INVALID_ARGUMENT"),
            ErrorCode::ExtensionNotFound => write!(f, "EXTENSION_NOT_FOUND"),
            ErrorCode::MethodNotFound => write!(f, "METHOD_NOT_FOUND"),
        }
    }
}

/// Source location in handler code
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceLocation {
    /// Line number (1-indexed)
    pub line: u32,
    /// Column number (1-indexed)
    pub column: u32,
}

impl SourceLocation {
    /// Create a new source location
    pub fn new(line: u32, column: u32) -> Self {
        Self { line, column }
    }
}

/// Code snippet around error location
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeSnippet {
    /// The code snippet
    pub code: String,
    /// The line to highlight (1-indexed relative to snippet)
    pub highlight_line: u32,
}

/// Error details from WASM execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmError {
    /// Error code
    pub code: ErrorCode,

    /// Human-readable message
    pub message: String,

    /// JavaScript stack trace (source-mapped)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack: Option<String>,

    /// Source location
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<SourceLocation>,

    /// Handler code snippet around error
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<CodeSnippet>,

    /// Additional context for debugging
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
}

impl WasmError {
    /// Create a new WASM error
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            stack: None,
            location: None,
            snippet: None,
            context: None,
        }
    }

    /// Create a timeout error
    pub fn timeout(timeout_ms: u32) -> Self {
        Self::new(
            ErrorCode::Timeout,
            format!("Handler exceeded {}ms time limit", timeout_ms),
        )
    }

    /// Create a memory limit error
    pub fn memory_limit(limit_bytes: u64, used_bytes: u64) -> Self {
        Self::new(
            ErrorCode::MemoryLimit,
            format!(
                "Handler exceeded memory limit: {} bytes used, {} bytes allowed",
                used_bytes, limit_bytes
            ),
        )
    }

    /// Create a permission denied error
    pub fn permission_denied(capability: impl Into<String>, operation: impl Into<String>) -> Self {
        let cap = capability.into();
        let op = operation.into();
        Self::new(
            ErrorCode::PermissionDenied,
            format!("Permission denied: {} requires capability '{}'", op, cap),
        )
    }

    /// Create an execution error
    pub fn execution_error(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::ExecutionError, message)
    }

    /// Create a compilation error
    pub fn compilation_error(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::CompilationError, message)
    }

    /// Create an invalid handler error
    pub fn invalid_handler(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidHandler, message)
    }

    /// Create an internal error
    pub fn internal_error(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InternalError, message)
    }

    /// Create a resource limit error
    pub fn resource_limit(resource: impl Into<String>, limit: u32, used: u32) -> Self {
        Self::new(
            ErrorCode::ResourceLimit,
            format!(
                "Resource limit exceeded: {} (used: {}, limit: {})",
                resource.into(),
                used,
                limit
            ),
        )
    }

    /// Create an extension not found error
    pub fn extension_not_found(name: impl Into<String>) -> Self {
        Self::new(
            ErrorCode::ExtensionNotFound,
            format!("Extension '{}' not found", name.into()),
        )
    }

    /// Create a method not found error
    pub fn method_not_found(extension: impl Into<String>, method: impl Into<String>) -> Self {
        Self::new(
            ErrorCode::MethodNotFound,
            format!(
                "Method '{}' not found on extension '{}'",
                method.into(),
                extension.into()
            ),
        )
    }

    /// Add stack trace
    pub fn with_stack(mut self, stack: impl Into<String>) -> Self {
        self.stack = Some(stack.into());
        self
    }

    /// Add source location
    pub fn with_location(mut self, line: u32, column: u32) -> Self {
        self.location = Some(SourceLocation::new(line, column));
        self
    }

    /// Add code snippet
    pub fn with_snippet(mut self, code: impl Into<String>, highlight_line: u32) -> Self {
        self.snippet = Some(CodeSnippet {
            code: code.into(),
            highlight_line,
        });
        self
    }

    /// Add context
    pub fn with_context(mut self, context: serde_json::Value) -> Self {
        self.context = Some(context);
        self
    }
}

impl std::fmt::Display for WasmError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)?;
        if let Some(loc) = &self.location {
            write!(f, " at line {}:{}", loc.line, loc.column)?;
        }
        Ok(())
    }
}

impl std::error::Error for WasmError {}

/// Main error type for the runtime
#[derive(Debug, thiserror::Error)]
pub enum RuntimeError {
    /// WASM execution error
    #[error("WASM error: {0}")]
    Wasm(#[from] WasmError),

    /// Configuration error
    #[error("Configuration error: {0}")]
    Config(#[from] crate::config::ConfigError),

    /// IO error
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// Serialization error
    #[error("Serialization error: {0}")]
    Serialization(String),

    /// Pool error
    #[error("Pool error: {0}")]
    Pool(String),

    /// Instance error
    #[error("Instance error: {0}")]
    Instance(String),

    /// Compilation error
    #[error("Compilation error: {0}")]
    Compilation(String),

    /// Invalid state
    #[error("Invalid state: {0}")]
    InvalidState(String),

    /// Suspension error
    #[error("Suspension error: {0}")]
    Suspension(String),

    /// General error
    #[error("{0}")]
    General(String),
}

impl RuntimeError {
    /// Convert to WasmError for returning to JavaScript
    pub fn to_wasm_error(&self) -> WasmError {
        match self {
            RuntimeError::Wasm(e) => e.clone(),
            RuntimeError::Config(e) => WasmError::new(ErrorCode::InvalidArgument, e.to_string()),
            RuntimeError::Io(e) => WasmError::new(ErrorCode::InternalError, e.to_string()),
            RuntimeError::Serialization(msg) => {
                WasmError::new(ErrorCode::SerializationError, msg.clone())
            }
            RuntimeError::Pool(msg) => WasmError::new(ErrorCode::InternalError, msg.clone()),
            RuntimeError::Instance(msg) => WasmError::new(ErrorCode::WasmError, msg.clone()),
            RuntimeError::Compilation(msg) => {
                WasmError::new(ErrorCode::CompilationError, msg.clone())
            }
            RuntimeError::InvalidState(msg) => {
                WasmError::new(ErrorCode::InternalError, msg.clone())
            }
            RuntimeError::Suspension(msg) => WasmError::new(ErrorCode::InternalError, msg.clone()),
            RuntimeError::General(msg) => WasmError::new(ErrorCode::InternalError, msg.clone()),
        }
    }
}

impl From<String> for RuntimeError {
    fn from(s: String) -> Self {
        RuntimeError::General(s)
    }
}

impl From<&str> for RuntimeError {
    fn from(s: &str) -> Self {
        RuntimeError::General(s.to_string())
    }
}

impl From<serde_json::Error> for RuntimeError {
    fn from(e: serde_json::Error) -> Self {
        RuntimeError::Serialization(e.to_string())
    }
}

/// Result type alias for runtime operations
pub type Result<T> = std::result::Result<T, RuntimeError>;

/// Error code constant for host functions returning error codes
pub mod error_codes {
    /// Success
    pub const SUCCESS: i32 = 0;
    /// Permission denied
    pub const PERMISSION_DENIED: i32 = -1;
    /// Resource limit exceeded
    pub const RESOURCE_LIMIT: i32 = -2;
    /// Invalid argument
    pub const INVALID_ARGUMENT: i32 = -3;
    /// Not found
    pub const NOT_FOUND: i32 = -4;
    /// Internal error
    pub const INTERNAL_ERROR: i32 = -5;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_code_display() {
        assert_eq!(ErrorCode::Timeout.to_string(), "TIMEOUT");
        assert_eq!(ErrorCode::PermissionDenied.to_string(), "PERMISSION_DENIED");
    }

    #[test]
    fn test_wasm_error_creation() {
        let err = WasmError::timeout(5000);
        assert_eq!(err.code, ErrorCode::Timeout);
        assert!(err.message.contains("5000"));
    }

    #[test]
    fn test_wasm_error_with_location() {
        let err = WasmError::execution_error("test error").with_location(10, 5);
        assert!(err.location.is_some());
        let loc = err.location.unwrap();
        assert_eq!(loc.line, 10);
        assert_eq!(loc.column, 5);
    }

    #[test]
    fn test_wasm_error_serialization() {
        let err = WasmError::permission_denied("state:write:secret", "write state.secret");
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("PERMISSION_DENIED"));
    }

    #[test]
    fn test_runtime_error_conversion() {
        let wasm_err = WasmError::timeout(1000);
        let runtime_err = RuntimeError::Wasm(wasm_err);
        let converted = runtime_err.to_wasm_error();
        assert_eq!(converted.code, ErrorCode::Timeout);
    }
}
