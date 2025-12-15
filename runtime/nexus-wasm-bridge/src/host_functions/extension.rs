//! Extension call host functions.
//!
//! These functions handle async extension calls using the suspend/resume mechanism.

use super::{HostResult, SharedContext};
use crate::context::{RuntimeValue, SuspensionDetails, SuspensionState};
use crate::error::error_codes;
use uuid::Uuid;

/// Suspend execution for an async extension call
///
/// This function is called when a handler uses `await $ext.name.method()`.
/// It creates a suspension state and signals that the WASM execution should pause.
///
/// # Arguments
/// * `ctx` - The execution context
/// * `ext_name` - The extension name (e.g., "http")
/// * `method` - The method name (e.g., "get")
/// * `args` - The method arguments
///
/// # Returns
/// * `Ok(details)` - Suspension details for the JavaScript side to process
/// * `Err(code)` - If permission denied or extension not found
pub fn ext_suspend(
    ctx: &SharedContext,
    ext_name: &str,
    method: &str,
    args: Vec<RuntimeValue>,
) -> HostResult<SuspensionDetails> {
    let mut context = ctx.lock();

    // Check if extension is registered
    if !context.extension_registry.contains_key(ext_name) {
        return Err(error_codes::NOT_FOUND);
    }

    // Check if method exists on extension
    let methods = context.extension_registry.get(ext_name).unwrap();
    if !methods.iter().any(|m| m == method) {
        return Err(error_codes::NOT_FOUND);
    }

    // Check capability
    let required = format!("ext:{}", ext_name);
    if !context.has_capability(&required) && !context.has_capability("ext:*") {
        return Err(error_codes::PERMISSION_DENIED);
    }

    // Generate suspension ID
    let suspension_id = Uuid::new_v4().to_string();

    // Store suspension state
    context.suspension = Some(SuspensionState {
        id: suspension_id.clone(),
        extension_name: ext_name.to_string(),
        method: method.to_string(),
        args: args.clone(),
    });

    // Return suspension details
    Ok(SuspensionDetails {
        suspension_id,
        extension_name: ext_name.to_string(),
        method: method.to_string(),
        args,
    })
}

/// Check if an extension is available
///
/// # Arguments
/// * `ctx` - The execution context
/// * `ext_name` - The extension name to check
///
/// # Returns
/// * `Ok(true)` - Extension is available
/// * `Ok(false)` - Extension is not available
pub fn ext_exists(ctx: &SharedContext, ext_name: &str) -> HostResult<bool> {
    let context = ctx.lock();
    Ok(context.extension_registry.contains_key(ext_name))
}

/// Get available methods on an extension
///
/// # Arguments
/// * `ctx` - The execution context
/// * `ext_name` - The extension name
///
/// # Returns
/// * `Ok(methods)` - List of available methods
/// * `Err(code)` - If extension not found
pub fn ext_methods(ctx: &SharedContext, ext_name: &str) -> HostResult<Vec<String>> {
    let context = ctx.lock();

    match context.extension_registry.get(ext_name) {
        Some(methods) => Ok(methods.clone()),
        None => Err(error_codes::NOT_FOUND),
    }
}

/// Get all registered extensions
///
/// # Arguments
/// * `ctx` - The execution context
///
/// # Returns
/// * `Ok(extensions)` - List of extension names
pub fn ext_list(ctx: &SharedContext) -> HostResult<Vec<String>> {
    let context = ctx.lock();
    Ok(context.extension_registry.keys().cloned().collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capability::CapabilityToken;
    use crate::context::{ExecutionContext, WasmContext};
    use parking_lot::Mutex;
    use std::collections::HashMap;
    use std::sync::Arc;

    fn create_context_with_extensions() -> SharedContext {
        let mut extensions = HashMap::new();
        extensions.insert(
            "http".to_string(),
            vec!["get".to_string(), "post".to_string()],
        );
        extensions.insert("storage".to_string(), vec!["read".to_string(), "write".to_string()]);

        let wasm_ctx = WasmContext::new("test-panel", "test-handler")
            .with_extensions(extensions)
            .with_capabilities(vec![CapabilityToken::ExtensionAll]);

        Arc::new(Mutex::new(ExecutionContext::from_wasm_context(wasm_ctx)))
    }

    #[test]
    fn test_ext_suspend() {
        let ctx = create_context_with_extensions();

        let result = ext_suspend(
            &ctx,
            "http",
            "get",
            vec![RuntimeValue::String("https://api.example.com".to_string())],
        );

        assert!(result.is_ok());
        let details = result.unwrap();
        assert_eq!(details.extension_name, "http");
        assert_eq!(details.method, "get");
        assert!(!details.suspension_id.is_empty());
    }

    #[test]
    fn test_ext_suspend_unknown_extension() {
        let ctx = create_context_with_extensions();

        let result = ext_suspend(&ctx, "unknown", "method", vec![]);
        assert_eq!(result, Err(error_codes::NOT_FOUND));
    }

    #[test]
    fn test_ext_suspend_unknown_method() {
        let ctx = create_context_with_extensions();

        let result = ext_suspend(&ctx, "http", "delete", vec![]); // 'delete' not registered
        assert_eq!(result, Err(error_codes::NOT_FOUND));
    }

    #[test]
    fn test_ext_suspend_without_permission() {
        let mut extensions = HashMap::new();
        extensions.insert("http".to_string(), vec!["get".to_string()]);

        let wasm_ctx = WasmContext::new("test-panel", "test-handler")
            .with_extensions(extensions)
            .with_capabilities(vec![]); // No capabilities

        let ctx = Arc::new(Mutex::new(ExecutionContext::from_wasm_context(wasm_ctx)));

        let result = ext_suspend(&ctx, "http", "get", vec![]);
        assert_eq!(result, Err(error_codes::PERMISSION_DENIED));
    }

    #[test]
    fn test_ext_exists() {
        let ctx = create_context_with_extensions();

        assert_eq!(ext_exists(&ctx, "http"), Ok(true));
        assert_eq!(ext_exists(&ctx, "unknown"), Ok(false));
    }

    #[test]
    fn test_ext_methods() {
        let ctx = create_context_with_extensions();

        let methods = ext_methods(&ctx, "http").unwrap();
        assert!(methods.contains(&"get".to_string()));
        assert!(methods.contains(&"post".to_string()));
    }

    #[test]
    fn test_ext_methods_unknown_extension() {
        let ctx = create_context_with_extensions();

        let result = ext_methods(&ctx, "unknown");
        assert_eq!(result, Err(error_codes::NOT_FOUND));
    }

    #[test]
    fn test_ext_list() {
        let ctx = create_context_with_extensions();

        let extensions = ext_list(&ctx).unwrap();
        assert!(extensions.contains(&"http".to_string()));
        assert!(extensions.contains(&"storage".to_string()));
    }

    #[test]
    fn test_suspension_state_recorded() {
        let ctx = create_context_with_extensions();

        ext_suspend(&ctx, "http", "get", vec![RuntimeValue::String("url".to_string())]).unwrap();

        let context = ctx.lock();
        assert!(context.suspension.is_some());
        let suspension = context.suspension.as_ref().unwrap();
        assert_eq!(suspension.extension_name, "http");
        assert_eq!(suspension.method, "get");
    }
}
