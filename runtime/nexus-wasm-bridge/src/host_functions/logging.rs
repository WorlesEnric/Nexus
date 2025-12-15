//! Logging host functions.
//!
//! These functions provide safe logging capabilities for handlers.
//! Logging is always allowed (no capability required) but output is captured
//! in the execution context.

use super::{HostResult, SharedContext};
use crate::context::LogLevel;

/// Log a message
///
/// Logging is always allowed and does not require any capabilities.
///
/// # Arguments
/// * `ctx` - The execution context
/// * `level` - The log level (0=debug, 1=info, 2=warn, 3=error)
/// * `message` - The message to log
///
/// # Returns
/// * `Ok(())` - Always succeeds
pub fn log(ctx: &SharedContext, level: i32, message: &str) -> HostResult<()> {
    let mut context = ctx.lock();
    
    // Convert level to enum
    let log_level = LogLevel::from(level);
    
    // Record the log message
    context.add_log(log_level, message.to_string());
    
    // Also log to tracing for debugging
    match log_level {
        LogLevel::Debug => tracing::debug!(
            panel_id = %context.panel_id,
            handler = %context.handler_name,
            "{}",
            message
        ),
        LogLevel::Info => tracing::info!(
            panel_id = %context.panel_id,
            handler = %context.handler_name,
            "{}",
            message
        ),
        LogLevel::Warn => tracing::warn!(
            panel_id = %context.panel_id,
            handler = %context.handler_name,
            "{}",
            message
        ),
        LogLevel::Error => tracing::error!(
            panel_id = %context.panel_id,
            handler = %context.handler_name,
            "{}",
            message
        ),
    }
    
    Ok(())
}

/// Log at debug level
pub fn log_debug(ctx: &SharedContext, message: &str) -> HostResult<()> {
    log(ctx, 0, message)
}

/// Log at info level
pub fn log_info(ctx: &SharedContext, message: &str) -> HostResult<()> {
    log(ctx, 1, message)
}

/// Log at warn level
pub fn log_warn(ctx: &SharedContext, message: &str) -> HostResult<()> {
    log(ctx, 2, message)
}

/// Log at error level
pub fn log_error(ctx: &SharedContext, message: &str) -> HostResult<()> {
    log(ctx, 3, message)
}

/// Get current timestamp in milliseconds
///
/// This is a utility function for handlers to get the current time.
/// It does not require any capabilities.
///
/// # Returns
/// * `Ok(timestamp)` - Current time in milliseconds since Unix epoch
pub fn now() -> HostResult<f64> {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| -1)?;
    
    Ok(duration.as_millis() as f64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::{ExecutionContext, WasmContext};
    use parking_lot::Mutex;
    use std::sync::Arc;

    fn create_context() -> SharedContext {
        let wasm_ctx = WasmContext::new("test-panel", "test-handler");
        Arc::new(Mutex::new(ExecutionContext::from_wasm_context(wasm_ctx)))
    }

    #[test]
    fn test_log() {
        let ctx = create_context();
        
        let result = log(&ctx, 1, "Test message");
        assert!(result.is_ok());
        
        let context = ctx.lock();
        assert_eq!(context.log_messages.len(), 1);
        assert_eq!(context.log_messages[0].message, "Test message");
        assert_eq!(context.log_messages[0].level, LogLevel::Info);
    }

    #[test]
    fn test_log_levels() {
        let ctx = create_context();
        
        log_debug(&ctx, "debug").unwrap();
        log_info(&ctx, "info").unwrap();
        log_warn(&ctx, "warn").unwrap();
        log_error(&ctx, "error").unwrap();
        
        let context = ctx.lock();
        assert_eq!(context.log_messages.len(), 4);
        assert_eq!(context.log_messages[0].level, LogLevel::Debug);
        assert_eq!(context.log_messages[1].level, LogLevel::Info);
        assert_eq!(context.log_messages[2].level, LogLevel::Warn);
        assert_eq!(context.log_messages[3].level, LogLevel::Error);
    }

    #[test]
    fn test_log_no_capabilities_required() {
        // Create context with no capabilities
        let wasm_ctx = WasmContext::new("test-panel", "test-handler");
        let ctx = Arc::new(Mutex::new(ExecutionContext::from_wasm_context(wasm_ctx)));
        
        // Logging should still work
        assert!(log(&ctx, 1, "Should work").is_ok());
    }

    #[test]
    fn test_now() {
        let timestamp = now().unwrap();
        
        // Should be a reasonable timestamp (after year 2020)
        assert!(timestamp > 1577836800000.0); // Jan 1, 2020
    }

    #[test]
    fn test_multiple_logs() {
        let ctx = create_context();
        
        for i in 0..100 {
            log(&ctx, 1, &format!("Message {}", i)).unwrap();
        }
        
        let context = ctx.lock();
        assert_eq!(context.log_messages.len(), 100);
    }
}
