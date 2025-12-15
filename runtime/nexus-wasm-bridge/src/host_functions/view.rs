//! View manipulation host functions.
//!
//! These functions allow handlers to manipulate the UI imperatively.

use super::{HostResult, SharedContext};
use crate::context::{RuntimeValue, ViewCommand, ViewCommandType};
use crate::error::error_codes;
use std::collections::HashMap;

/// Send a view command
///
/// # Arguments
/// * `ctx` - The execution context
/// * `command` - The view command to execute
///
/// # Returns
/// * `Ok(())` - Success
/// * `Err(code)` - If permission denied or error
pub fn view_command(ctx: &SharedContext, command: ViewCommand) -> HostResult<()> {
    let mut context = ctx.lock();

    // Check capability
    let required = match &command.component_id {
        Some(id) => format!("view:update:{}", id),
        None => "view:update:*".to_string(),
    };

    if !context.has_capability(&required) && !context.has_capability("view:update:*") {
        return Err(error_codes::PERMISSION_DENIED);
    }

    // Record command
    context.add_view_command(command);

    Ok(())
}

/// Set a filter on a component
///
/// # Arguments
/// * `ctx` - The execution context
/// * `component_id` - The target component ID
/// * `value` - The filter value
///
/// # Returns
/// * `Ok(())` - Success
/// * `Err(code)` - If permission denied or error
pub fn view_set_filter(
    ctx: &SharedContext,
    component_id: &str,
    value: RuntimeValue,
) -> HostResult<()> {
    let command = ViewCommand {
        command_type: ViewCommandType::SetFilter,
        component_id: Some(component_id.to_string()),
        args: {
            let mut args = HashMap::new();
            args.insert("value".to_string(), value);
            args
        },
    };

    view_command(ctx, command)
}

/// Scroll to a position in a component
///
/// # Arguments
/// * `ctx` - The execution context
/// * `component_id` - The target component ID
/// * `position` - The scroll position
///
/// # Returns
/// * `Ok(())` - Success
/// * `Err(code)` - If permission denied or error
pub fn view_scroll_to(
    ctx: &SharedContext,
    component_id: &str,
    position: RuntimeValue,
) -> HostResult<()> {
    let command = ViewCommand {
        command_type: ViewCommandType::ScrollTo,
        component_id: Some(component_id.to_string()),
        args: {
            let mut args = HashMap::new();
            args.insert("position".to_string(), position);
            args
        },
    };

    view_command(ctx, command)
}

/// Focus a component
///
/// # Arguments
/// * `ctx` - The execution context
/// * `component_id` - The target component ID
///
/// # Returns
/// * `Ok(())` - Success
/// * `Err(code)` - If permission denied or error
pub fn view_focus(ctx: &SharedContext, component_id: &str) -> HostResult<()> {
    let command = ViewCommand {
        command_type: ViewCommandType::Focus,
        component_id: Some(component_id.to_string()),
        args: HashMap::new(),
    };

    view_command(ctx, command)
}

/// Send a custom view command
///
/// # Arguments
/// * `ctx` - The execution context
/// * `component_id` - The target component ID (optional)
/// * `command_name` - The custom command name
/// * `args` - Command arguments
///
/// # Returns
/// * `Ok(())` - Success
/// * `Err(code)` - If permission denied or error
pub fn view_custom(
    ctx: &SharedContext,
    component_id: Option<&str>,
    args: HashMap<String, RuntimeValue>,
) -> HostResult<()> {
    let command = ViewCommand {
        command_type: ViewCommandType::Custom,
        component_id: component_id.map(String::from),
        args,
    };

    view_command(ctx, command)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capability::CapabilityToken;
    use crate::context::{ExecutionContext, WasmContext};
    use parking_lot::Mutex;
    use std::sync::Arc;

    fn create_context_with_caps(caps: Vec<CapabilityToken>) -> SharedContext {
        let wasm_ctx = WasmContext::new("test-panel", "test-handler").with_capabilities(caps);
        Arc::new(Mutex::new(ExecutionContext::from_wasm_context(wasm_ctx)))
    }

    #[test]
    fn test_view_set_filter_with_permission() {
        let ctx = create_context_with_caps(vec![CapabilityToken::ViewUpdateAll]);

        let result = view_set_filter(&ctx, "logs", RuntimeValue::String("error".to_string()));
        assert!(result.is_ok());

        // Check command was recorded
        let context = ctx.lock();
        assert_eq!(context.view_commands.len(), 1);
        assert_eq!(
            context.view_commands[0].command_type,
            ViewCommandType::SetFilter
        );
        assert_eq!(
            context.view_commands[0].component_id,
            Some("logs".to_string())
        );
    }

    #[test]
    fn test_view_set_filter_without_permission() {
        let ctx = create_context_with_caps(vec![]); // No capabilities

        let result = view_set_filter(&ctx, "logs", RuntimeValue::String("error".to_string()));
        assert_eq!(result, Err(error_codes::PERMISSION_DENIED));
    }

    #[test]
    fn test_view_set_filter_specific_permission() {
        let ctx = create_context_with_caps(vec![CapabilityToken::ViewUpdate("logs".to_string())]);

        // Can update 'logs'
        assert!(view_set_filter(&ctx, "logs", RuntimeValue::Null).is_ok());

        // Cannot update other components
        assert_eq!(
            view_set_filter(&ctx, "other", RuntimeValue::Null),
            Err(error_codes::PERMISSION_DENIED)
        );
    }

    #[test]
    fn test_view_scroll_to() {
        let ctx = create_context_with_caps(vec![CapabilityToken::ViewUpdateAll]);

        let result = view_scroll_to(&ctx, "list", RuntimeValue::String("bottom".to_string()));
        assert!(result.is_ok());

        let context = ctx.lock();
        assert_eq!(
            context.view_commands[0].command_type,
            ViewCommandType::ScrollTo
        );
    }

    #[test]
    fn test_view_focus() {
        let ctx = create_context_with_caps(vec![CapabilityToken::ViewUpdateAll]);

        let result = view_focus(&ctx, "input");
        assert!(result.is_ok());

        let context = ctx.lock();
        assert_eq!(context.view_commands[0].command_type, ViewCommandType::Focus);
        assert_eq!(
            context.view_commands[0].component_id,
            Some("input".to_string())
        );
    }

    #[test]
    fn test_view_custom() {
        let ctx = create_context_with_caps(vec![CapabilityToken::ViewUpdateAll]);

        let mut args = HashMap::new();
        args.insert("action".to_string(), RuntimeValue::String("refresh".to_string()));

        let result = view_custom(&ctx, Some("chart"), args);
        assert!(result.is_ok());

        let context = ctx.lock();
        assert_eq!(
            context.view_commands[0].command_type,
            ViewCommandType::Custom
        );
    }

    #[test]
    fn test_multiple_view_commands() {
        let ctx = create_context_with_caps(vec![CapabilityToken::ViewUpdateAll]);

        view_focus(&ctx, "input1").unwrap();
        view_scroll_to(&ctx, "list", RuntimeValue::Number(0.0)).unwrap();
        view_set_filter(&ctx, "logs", RuntimeValue::Null).unwrap();

        let context = ctx.lock();
        assert_eq!(context.view_commands.len(), 3);
    }
}
