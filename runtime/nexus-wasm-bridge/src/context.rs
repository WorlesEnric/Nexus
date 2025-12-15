//! Execution context types for WASM handler execution.
//!
//! This module defines the context passed to handlers and the results
//! returned from execution, including state mutations, events, and
//! suspension details for async operations.

use crate::capability::CapabilityToken;
use crate::error::WasmError;
use crate::metrics::ExecutionMetrics;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Runtime value types (must be serializable)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum RuntimeValue {
    /// Null value
    Null,
    /// Boolean value
    Bool(bool),
    /// Numeric value (f64 for JS compatibility)
    Number(f64),
    /// String value
    String(String),
    /// Array of values
    Array(Vec<RuntimeValue>),
    /// Object/map of values
    Object(HashMap<String, RuntimeValue>),
}

impl RuntimeValue {
    /// Check if value is null
    pub fn is_null(&self) -> bool {
        matches!(self, RuntimeValue::Null)
    }

    /// Get as boolean
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            RuntimeValue::Bool(b) => Some(*b),
            _ => None,
        }
    }

    /// Get as number
    pub fn as_number(&self) -> Option<f64> {
        match self {
            RuntimeValue::Number(n) => Some(*n),
            _ => None,
        }
    }

    /// Get as string
    pub fn as_str(&self) -> Option<&str> {
        match self {
            RuntimeValue::String(s) => Some(s),
            _ => None,
        }
    }

    /// Get as array
    pub fn as_array(&self) -> Option<&Vec<RuntimeValue>> {
        match self {
            RuntimeValue::Array(arr) => Some(arr),
            _ => None,
        }
    }

    /// Get as object
    pub fn as_object(&self) -> Option<&HashMap<String, RuntimeValue>> {
        match self {
            RuntimeValue::Object(obj) => Some(obj),
            _ => None,
        }
    }
}

impl From<bool> for RuntimeValue {
    fn from(b: bool) -> Self {
        RuntimeValue::Bool(b)
    }
}

impl From<f64> for RuntimeValue {
    fn from(n: f64) -> Self {
        RuntimeValue::Number(n)
    }
}

impl From<i64> for RuntimeValue {
    fn from(n: i64) -> Self {
        RuntimeValue::Number(n as f64)
    }
}

impl From<String> for RuntimeValue {
    fn from(s: String) -> Self {
        RuntimeValue::String(s)
    }
}

impl From<&str> for RuntimeValue {
    fn from(s: &str) -> Self {
        RuntimeValue::String(s.to_string())
    }
}

impl<T: Into<RuntimeValue>> From<Vec<T>> for RuntimeValue {
    fn from(v: Vec<T>) -> Self {
        RuntimeValue::Array(v.into_iter().map(Into::into).collect())
    }
}

impl Default for RuntimeValue {
    fn default() -> Self {
        RuntimeValue::Null
    }
}

/// Execution context passed to WASM handler
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmContext {
    /// Panel ID for logging and metrics
    pub panel_id: String,

    /// Tool or lifecycle handler name
    pub handler_name: String,

    /// Snapshot of current state
    pub state_snapshot: HashMap<String, RuntimeValue>,

    /// Tool arguments (empty for lifecycle handlers)
    pub args: HashMap<String, RuntimeValue>,

    /// Capability tokens granted to this handler
    pub capabilities: Vec<CapabilityToken>,

    /// Scope variables (from If/Iterate context)
    pub scope: HashMap<String, RuntimeValue>,

    /// Extension registry (name -> available methods)
    pub extension_registry: HashMap<String, Vec<String>>,
}

impl WasmContext {
    /// Create a new WASM context
    pub fn new(panel_id: impl Into<String>, handler_name: impl Into<String>) -> Self {
        Self {
            panel_id: panel_id.into(),
            handler_name: handler_name.into(),
            state_snapshot: HashMap::new(),
            args: HashMap::new(),
            capabilities: Vec::new(),
            scope: HashMap::new(),
            extension_registry: HashMap::new(),
        }
    }

    /// Set state snapshot
    pub fn with_state(mut self, state: HashMap<String, RuntimeValue>) -> Self {
        self.state_snapshot = state;
        self
    }

    /// Set arguments
    pub fn with_args(mut self, args: HashMap<String, RuntimeValue>) -> Self {
        self.args = args;
        self
    }

    /// Set capabilities
    pub fn with_capabilities(mut self, caps: Vec<CapabilityToken>) -> Self {
        self.capabilities = caps;
        self
    }

    /// Set scope
    pub fn with_scope(mut self, scope: HashMap<String, RuntimeValue>) -> Self {
        self.scope = scope;
        self
    }

    /// Set extension registry
    pub fn with_extensions(mut self, ext: HashMap<String, Vec<String>>) -> Self {
        self.extension_registry = ext;
        self
    }
}

/// Execution status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExecutionStatus {
    /// Handler completed successfully
    Success,
    /// Handler encountered an error
    Error,
    /// Handler suspended waiting for async operation
    Suspended,
}

/// Result returned from WASM handler execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmResult {
    /// Execution status
    pub status: ExecutionStatus,

    /// Return value from handler (if status === 'success')
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_value: Option<RuntimeValue>,

    /// State mutations to apply IMMEDIATELY
    pub state_mutations: Vec<StateMutation>,

    /// Events to emit IMMEDIATELY
    pub events: Vec<EmittedEvent>,

    /// View commands to execute IMMEDIATELY
    pub view_commands: Vec<ViewCommand>,

    /// Suspension details (if status === 'suspended')
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suspension: Option<SuspensionDetails>,

    /// Error details (if status === 'error')
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<WasmError>,

    /// Execution metrics
    pub metrics: ExecutionMetrics,
}

impl WasmResult {
    /// Create a success result
    pub fn success(return_value: Option<RuntimeValue>, metrics: ExecutionMetrics) -> Self {
        Self {
            status: ExecutionStatus::Success,
            return_value,
            state_mutations: Vec::new(),
            events: Vec::new(),
            view_commands: Vec::new(),
            suspension: None,
            error: None,
            metrics,
        }
    }

    /// Create an error result
    pub fn error(error: WasmError, metrics: ExecutionMetrics) -> Self {
        Self {
            status: ExecutionStatus::Error,
            return_value: None,
            state_mutations: Vec::new(),
            events: Vec::new(),
            view_commands: Vec::new(),
            suspension: None,
            error: Some(error),
            metrics,
        }
    }

    /// Create a suspended result
    pub fn suspended(suspension: SuspensionDetails, metrics: ExecutionMetrics) -> Self {
        Self {
            status: ExecutionStatus::Suspended,
            return_value: None,
            state_mutations: Vec::new(),
            events: Vec::new(),
            view_commands: Vec::new(),
            suspension: Some(suspension),
            error: None,
            metrics,
        }
    }

    /// Add state mutations
    pub fn with_mutations(mut self, mutations: Vec<StateMutation>) -> Self {
        self.state_mutations = mutations;
        self
    }

    /// Add events
    pub fn with_events(mut self, events: Vec<EmittedEvent>) -> Self {
        self.events = events;
        self
    }

    /// Add view commands
    pub fn with_view_commands(mut self, commands: Vec<ViewCommand>) -> Self {
        self.view_commands = commands;
        self
    }
}

/// State mutation record
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateMutation {
    /// State key to mutate
    pub key: String,

    /// New value
    pub value: RuntimeValue,

    /// Operation type
    pub operation: MutationOperation,
}

impl StateMutation {
    /// Create a set mutation
    pub fn set(key: impl Into<String>, value: RuntimeValue) -> Self {
        Self {
            key: key.into(),
            value,
            operation: MutationOperation::Set,
        }
    }

    /// Create a delete mutation
    pub fn delete(key: impl Into<String>) -> Self {
        Self {
            key: key.into(),
            value: RuntimeValue::Null,
            operation: MutationOperation::Delete,
        }
    }
}

/// Mutation operation type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MutationOperation {
    /// Set a value
    Set,
    /// Delete a value
    Delete,
}

/// Event emission record
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmittedEvent {
    /// Event name
    pub name: String,

    /// Event payload
    pub payload: RuntimeValue,
}

impl EmittedEvent {
    /// Create a new event
    pub fn new(name: impl Into<String>, payload: RuntimeValue) -> Self {
        Self {
            name: name.into(),
            payload,
        }
    }
}

/// View command record
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewCommand {
    /// Command type
    #[serde(rename = "type")]
    pub command_type: ViewCommandType,

    /// Target component ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component_id: Option<String>,

    /// Command arguments
    pub args: HashMap<String, RuntimeValue>,
}

impl ViewCommand {
    /// Create a setFilter command
    pub fn set_filter(component_id: impl Into<String>, value: RuntimeValue) -> Self {
        let mut args = HashMap::new();
        args.insert("value".to_string(), value);
        Self {
            command_type: ViewCommandType::SetFilter,
            component_id: Some(component_id.into()),
            args,
        }
    }

    /// Create a scrollTo command
    pub fn scroll_to(component_id: impl Into<String>, position: RuntimeValue) -> Self {
        let mut args = HashMap::new();
        args.insert("position".to_string(), position);
        Self {
            command_type: ViewCommandType::ScrollTo,
            component_id: Some(component_id.into()),
            args,
        }
    }

    /// Create a focus command
    pub fn focus(component_id: impl Into<String>) -> Self {
        Self {
            command_type: ViewCommandType::Focus,
            component_id: Some(component_id.into()),
            args: HashMap::new(),
        }
    }
}

/// View command types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ViewCommandType {
    /// Set filter on a component
    SetFilter,
    /// Scroll to a position
    ScrollTo,
    /// Focus a component
    Focus,
    /// Custom command
    Custom,
}

/// Suspension details for async operations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuspensionDetails {
    /// Unique suspension ID for resuming
    pub suspension_id: String,

    /// Extension name (e.g., 'http')
    pub extension_name: String,

    /// Method name (e.g., 'get')
    pub method: String,

    /// Method arguments
    pub args: Vec<RuntimeValue>,
}

impl SuspensionDetails {
    /// Create new suspension details
    pub fn new(
        suspension_id: impl Into<String>,
        extension_name: impl Into<String>,
        method: impl Into<String>,
        args: Vec<RuntimeValue>,
    ) -> Self {
        Self {
            suspension_id: suspension_id.into(),
            extension_name: extension_name.into(),
            method: method.into(),
            args,
        }
    }
}

/// Result from async operation for resumption
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AsyncResult {
    /// Whether the operation succeeded
    pub success: bool,

    /// Result value (if success)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<RuntimeValue>,

    /// Error message (if failure)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl AsyncResult {
    /// Create a success result
    pub fn success(value: RuntimeValue) -> Self {
        Self {
            success: true,
            value: Some(value),
            error: None,
        }
    }

    /// Create an error result
    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            value: None,
            error: Some(message.into()),
        }
    }
}

/// Internal execution context used during handler execution
#[derive(Debug)]
pub struct ExecutionContext {
    /// Panel ID
    pub panel_id: String,

    /// Handler name
    pub handler_name: String,

    /// State snapshot (read from this)
    pub state_snapshot: HashMap<String, RuntimeValue>,

    /// Arguments
    pub args: HashMap<String, RuntimeValue>,

    /// Scope variables
    pub scope: HashMap<String, RuntimeValue>,

    /// Capabilities
    pub capabilities: Vec<CapabilityToken>,

    /// Extension registry
    pub extension_registry: HashMap<String, Vec<String>>,

    /// Collected state mutations
    pub state_mutations: Vec<StateMutation>,

    /// Collected events
    pub events: Vec<EmittedEvent>,

    /// Collected view commands
    pub view_commands: Vec<ViewCommand>,

    /// Log messages
    pub log_messages: Vec<LogMessage>,

    /// Host function call count
    pub host_call_count: u32,

    /// Current suspension state
    pub suspension: Option<SuspensionState>,
}

impl ExecutionContext {
    /// Create from WASM context
    pub fn from_wasm_context(ctx: WasmContext) -> Self {
        Self {
            panel_id: ctx.panel_id,
            handler_name: ctx.handler_name,
            state_snapshot: ctx.state_snapshot,
            args: ctx.args,
            scope: ctx.scope,
            capabilities: ctx.capabilities,
            extension_registry: ctx.extension_registry,
            state_mutations: Vec::new(),
            events: Vec::new(),
            view_commands: Vec::new(),
            log_messages: Vec::new(),
            host_call_count: 0,
            suspension: None,
        }
    }

    /// Check if a capability is granted
    pub fn has_capability(&self, cap: &str) -> bool {
        self.capabilities.iter().any(|c| c.matches(cap))
    }

    /// Increment host call counter
    pub fn increment_host_calls(&mut self) -> u32 {
        self.host_call_count += 1;
        self.host_call_count
    }

    /// Add a state mutation
    pub fn add_mutation(&mut self, mutation: StateMutation) {
        self.state_mutations.push(mutation);
    }

    /// Add an event
    pub fn add_event(&mut self, event: EmittedEvent) {
        self.events.push(event);
    }

    /// Add a view command
    pub fn add_view_command(&mut self, command: ViewCommand) {
        self.view_commands.push(command);
    }

    /// Add a log message
    pub fn add_log(&mut self, level: LogLevel, message: String) {
        self.log_messages.push(LogMessage { level, message });
    }
}

/// Suspension state for async operations
#[derive(Debug)]
pub struct SuspensionState {
    /// Suspension ID
    pub id: String,

    /// Extension name
    pub extension_name: String,

    /// Method name
    pub method: String,

    /// Arguments
    pub args: Vec<RuntimeValue>,
}

/// Log message
#[derive(Debug, Clone)]
pub struct LogMessage {
    /// Log level
    pub level: LogLevel,

    /// Message content
    pub message: String,
}

/// Log levels
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    /// Debug level
    Debug = 0,
    /// Info level
    Info = 1,
    /// Warning level
    Warn = 2,
    /// Error level
    Error = 3,
}

impl From<i32> for LogLevel {
    fn from(level: i32) -> Self {
        match level {
            0 => LogLevel::Debug,
            1 => LogLevel::Info,
            2 => LogLevel::Warn,
            3 => LogLevel::Error,
            _ => LogLevel::Info,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_runtime_value_conversions() {
        let v: RuntimeValue = true.into();
        assert_eq!(v.as_bool(), Some(true));

        let v: RuntimeValue = 42.0.into();
        assert_eq!(v.as_number(), Some(42.0));

        let v: RuntimeValue = "hello".into();
        assert_eq!(v.as_str(), Some("hello"));
    }

    #[test]
    fn test_wasm_context_builder() {
        let ctx = WasmContext::new("panel-1", "increment")
            .with_capabilities(vec![CapabilityToken::StateReadAll]);

        assert_eq!(ctx.panel_id, "panel-1");
        assert_eq!(ctx.handler_name, "increment");
        assert!(!ctx.capabilities.is_empty());
    }

    #[test]
    fn test_wasm_result_success() {
        let result = WasmResult::success(
            Some(RuntimeValue::Number(42.0)),
            ExecutionMetrics::default(),
        );
        assert_eq!(result.status, ExecutionStatus::Success);
        assert!(result.error.is_none());
    }

    #[test]
    fn test_state_mutation() {
        let mutation = StateMutation::set("count", RuntimeValue::Number(5.0));
        assert_eq!(mutation.key, "count");
        assert_eq!(mutation.operation, MutationOperation::Set);
    }

    #[test]
    fn test_async_result() {
        let success = AsyncResult::success(RuntimeValue::String("ok".into()));
        assert!(success.success);
        assert!(success.error.is_none());

        let error = AsyncResult::error("failed");
        assert!(!error.success);
        assert_eq!(error.error, Some("failed".into()));
    }
}
