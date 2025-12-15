//! State access host functions.
//!
//! These functions provide read/write access to the panel's reactive state.

use super::{HostResult, SharedContext};
use crate::context::{MutationOperation, RuntimeValue, StateMutation};
use crate::error::error_codes;

/// Get a state value
///
/// # Arguments
/// * `ctx` - The execution context
/// * `key` - The state key to read
///
/// # Returns
/// * `Ok(Some(value))` - The value if found
/// * `Ok(None)` - If the key doesn't exist
/// * `Err(code)` - If permission denied or error
pub fn state_get(ctx: &SharedContext, key: &str) -> HostResult<Option<RuntimeValue>> {
    let context = ctx.lock();

    // Check capability
    let required = format!("state:read:{}", key);
    if !context.has_capability(&required) && !context.has_capability("state:read:*") {
        return Err(error_codes::PERMISSION_DENIED);
    }

    // Get from snapshot
    Ok(context.state_snapshot.get(key).cloned())
}

/// Set a state value
///
/// # Arguments
/// * `ctx` - The execution context
/// * `key` - The state key to write
/// * `value` - The value to set
///
/// # Returns
/// * `Ok(())` - Success
/// * `Err(code)` - If permission denied or error
pub fn state_set(ctx: &SharedContext, key: &str, value: RuntimeValue) -> HostResult<()> {
    let mut context = ctx.lock();

    // Check capability
    let required = format!("state:write:{}", key);
    if !context.has_capability(&required) && !context.has_capability("state:write:*") {
        return Err(error_codes::PERMISSION_DENIED);
    }

    // Record mutation
    context.add_mutation(StateMutation {
        key: key.to_string(),
        value,
        operation: MutationOperation::Set,
    });

    Ok(())
}

/// Delete a state value
///
/// # Arguments
/// * `ctx` - The execution context
/// * `key` - The state key to delete
///
/// # Returns
/// * `Ok(())` - Success
/// * `Err(code)` - If permission denied or error
pub fn state_delete(ctx: &SharedContext, key: &str) -> HostResult<()> {
    let mut context = ctx.lock();

    // Check capability
    let required = format!("state:write:{}", key);
    if !context.has_capability(&required) && !context.has_capability("state:write:*") {
        return Err(error_codes::PERMISSION_DENIED);
    }

    // Record deletion mutation
    context.add_mutation(StateMutation {
        key: key.to_string(),
        value: RuntimeValue::Null,
        operation: MutationOperation::Delete,
    });

    Ok(())
}

/// Check if a state key exists
///
/// # Arguments
/// * `ctx` - The execution context
/// * `key` - The state key to check
///
/// # Returns
/// * `Ok(true)` - Key exists
/// * `Ok(false)` - Key doesn't exist
/// * `Err(code)` - If permission denied
pub fn state_has(ctx: &SharedContext, key: &str) -> HostResult<bool> {
    let context = ctx.lock();

    // Check capability (reading requires read permission)
    let required = format!("state:read:{}", key);
    if !context.has_capability(&required) && !context.has_capability("state:read:*") {
        return Err(error_codes::PERMISSION_DENIED);
    }

    Ok(context.state_snapshot.contains_key(key))
}

/// Get all state keys
///
/// # Arguments
/// * `ctx` - The execution context
///
/// # Returns
/// * `Ok(keys)` - List of all state keys
/// * `Err(code)` - If permission denied
pub fn state_keys(ctx: &SharedContext) -> HostResult<Vec<String>> {
    let context = ctx.lock();

    // Requires state:read:* capability
    if !context.has_capability("state:read:*") {
        return Err(error_codes::PERMISSION_DENIED);
    }

    Ok(context.state_snapshot.keys().cloned().collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capability::CapabilityToken;
    use crate::context::{ExecutionContext, WasmContext};
    use parking_lot::Mutex;
    use std::collections::HashMap;
    use std::sync::Arc;

    fn create_context_with_caps(caps: Vec<CapabilityToken>) -> SharedContext {
        let mut state = HashMap::new();
        state.insert("count".to_string(), RuntimeValue::Number(42.0));
        state.insert("name".to_string(), RuntimeValue::String("test".to_string()));

        let wasm_ctx = WasmContext::new("test-panel", "test-handler")
            .with_state(state)
            .with_capabilities(caps);

        Arc::new(Mutex::new(ExecutionContext::from_wasm_context(wasm_ctx)))
    }

    #[test]
    fn test_state_get_with_permission() {
        let ctx = create_context_with_caps(vec![CapabilityToken::StateReadAll]);

        let result = state_get(&ctx, "count");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), Some(RuntimeValue::Number(42.0)));
    }

    #[test]
    fn test_state_get_without_permission() {
        let ctx = create_context_with_caps(vec![]); // No capabilities

        let result = state_get(&ctx, "count");
        assert_eq!(result, Err(error_codes::PERMISSION_DENIED));
    }

    #[test]
    fn test_state_get_specific_permission() {
        let ctx = create_context_with_caps(vec![CapabilityToken::StateRead("count".to_string())]);

        // Can read 'count'
        assert!(state_get(&ctx, "count").is_ok());

        // Cannot read 'name'
        assert_eq!(state_get(&ctx, "name"), Err(error_codes::PERMISSION_DENIED));
    }

    #[test]
    fn test_state_set_with_permission() {
        let ctx = create_context_with_caps(vec![CapabilityToken::StateWriteAll]);

        let result = state_set(&ctx, "count", RuntimeValue::Number(100.0));
        assert!(result.is_ok());

        // Check mutation was recorded
        let context = ctx.lock();
        assert_eq!(context.state_mutations.len(), 1);
        assert_eq!(context.state_mutations[0].key, "count");
    }

    #[test]
    fn test_state_set_without_permission() {
        let ctx = create_context_with_caps(vec![CapabilityToken::StateReadAll]); // Only read

        let result = state_set(&ctx, "count", RuntimeValue::Number(100.0));
        assert_eq!(result, Err(error_codes::PERMISSION_DENIED));
    }

    #[test]
    fn test_state_delete() {
        let ctx = create_context_with_caps(vec![CapabilityToken::StateWriteAll]);

        let result = state_delete(&ctx, "count");
        assert!(result.is_ok());

        // Check mutation was recorded
        let context = ctx.lock();
        assert_eq!(context.state_mutations.len(), 1);
        assert_eq!(context.state_mutations[0].operation, MutationOperation::Delete);
    }

    #[test]
    fn test_state_has() {
        let ctx = create_context_with_caps(vec![CapabilityToken::StateReadAll]);

        assert_eq!(state_has(&ctx, "count"), Ok(true));
        assert_eq!(state_has(&ctx, "nonexistent"), Ok(false));
    }

    #[test]
    fn test_state_keys() {
        let ctx = create_context_with_caps(vec![CapabilityToken::StateReadAll]);

        let keys = state_keys(&ctx).unwrap();
        assert!(keys.contains(&"count".to_string()));
        assert!(keys.contains(&"name".to_string()));
    }

    #[test]
    fn test_state_keys_without_permission() {
        let ctx = create_context_with_caps(vec![CapabilityToken::StateRead("count".to_string())]);

        // Specific capability doesn't grant keys access
        assert_eq!(state_keys(&ctx), Err(error_codes::PERMISSION_DENIED));
    }
}
