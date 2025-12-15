//! Event emission host functions.
//!
//! These functions allow handlers to emit events that propagate to the host system.

use super::{HostResult, SharedContext};
use crate::context::{EmittedEvent, RuntimeValue};
use crate::error::error_codes;

/// Emit an event
///
/// # Arguments
/// * `ctx` - The execution context
/// * `event_name` - The name of the event to emit
/// * `payload` - The event payload
///
/// # Returns
/// * `Ok(())` - Success
/// * `Err(code)` - If permission denied or error
pub fn emit_event(ctx: &SharedContext, event_name: &str, payload: RuntimeValue) -> HostResult<()> {
    let mut context = ctx.lock();

    // Check capability
    let required = format!("events:emit:{}", event_name);
    if !context.has_capability(&required) && !context.has_capability("events:emit:*") {
        return Err(error_codes::PERMISSION_DENIED);
    }

    // Record event
    context.add_event(EmittedEvent {
        name: event_name.to_string(),
        payload,
    });

    Ok(())
}

/// Emit a toast notification (convenience function)
///
/// # Arguments
/// * `ctx` - The execution context
/// * `message` - The toast message
/// * `toast_type` - The toast type (success, error, warning, info)
///
/// # Returns
/// * `Ok(())` - Success
/// * `Err(code)` - If permission denied or error
pub fn emit_toast(
    ctx: &SharedContext,
    message: &str,
    toast_type: Option<&str>,
) -> HostResult<()> {
    let mut payload = std::collections::HashMap::new();
    payload.insert(
        "message".to_string(),
        RuntimeValue::String(message.to_string()),
    );
    payload.insert(
        "type".to_string(),
        RuntimeValue::String(toast_type.unwrap_or("info").to_string()),
    );

    emit_event(ctx, "toast", RuntimeValue::Object(payload))
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
    fn test_emit_event_with_permission() {
        let ctx = create_context_with_caps(vec![CapabilityToken::EventsEmitAll]);

        let result = emit_event(
            &ctx,
            "custom_event",
            RuntimeValue::String("test payload".to_string()),
        );
        assert!(result.is_ok());

        // Check event was recorded
        let context = ctx.lock();
        assert_eq!(context.events.len(), 1);
        assert_eq!(context.events[0].name, "custom_event");
    }

    #[test]
    fn test_emit_event_without_permission() {
        let ctx = create_context_with_caps(vec![]); // No capabilities

        let result = emit_event(&ctx, "custom_event", RuntimeValue::Null);
        assert_eq!(result, Err(error_codes::PERMISSION_DENIED));
    }

    #[test]
    fn test_emit_event_specific_permission() {
        let ctx =
            create_context_with_caps(vec![CapabilityToken::EventsEmit("toast".to_string())]);

        // Can emit 'toast'
        assert!(emit_event(&ctx, "toast", RuntimeValue::Null).is_ok());

        // Cannot emit other events
        assert_eq!(
            emit_event(&ctx, "other", RuntimeValue::Null),
            Err(error_codes::PERMISSION_DENIED)
        );
    }

    #[test]
    fn test_emit_toast() {
        let ctx = create_context_with_caps(vec![CapabilityToken::EventsEmit("toast".to_string())]);

        let result = emit_toast(&ctx, "Hello World", Some("success"));
        assert!(result.is_ok());

        let context = ctx.lock();
        assert_eq!(context.events.len(), 1);
        assert_eq!(context.events[0].name, "toast");

        if let RuntimeValue::Object(payload) = &context.events[0].payload {
            assert_eq!(
                payload.get("message"),
                Some(&RuntimeValue::String("Hello World".to_string()))
            );
            assert_eq!(
                payload.get("type"),
                Some(&RuntimeValue::String("success".to_string()))
            );
        } else {
            panic!("Expected object payload");
        }
    }

    #[test]
    fn test_emit_multiple_events() {
        let ctx = create_context_with_caps(vec![CapabilityToken::EventsEmitAll]);

        emit_event(&ctx, "event1", RuntimeValue::Number(1.0)).unwrap();
        emit_event(&ctx, "event2", RuntimeValue::Number(2.0)).unwrap();
        emit_event(&ctx, "event3", RuntimeValue::Number(3.0)).unwrap();

        let context = ctx.lock();
        assert_eq!(context.events.len(), 3);
    }
}
