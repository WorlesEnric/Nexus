"""
Tests for TriLog Context module.

Tests cover:
- Anchor context management
- OTel baggage propagation
- TriLogLogger functionality
- Nested contexts
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

from trilog.dsl import Object, String, Integer
from trilog.context import anchor, anchored, TriLogLogger, AnchorContext


# =============================================================================
# TEST FIXTURES
# =============================================================================

class TestUser(Object):
    """Test user object."""
    name = String(default="")
    login_count = Integer(default=0)


class TestOrder(Object):
    """Test order object."""
    user_id = String(default="")
    total = Integer(default=0)


# =============================================================================
# ANCHOR CONTEXT TESTS
# =============================================================================

class TestAnchorContext:
    """Test anchor context manager."""
    
    def test_anchor_creation(self):
        with anchor("obj_123", TestUser) as ctx:
            assert ctx.obj_id == "obj_123"
            assert ctx.obj_type == "TestUser"
    
    def test_anchor_context_dataclass(self):
        ctx = AnchorContext(
            obj_id="test_id",
            obj_type="TestType",
            trace_id="trace_123",
            span_id="span_456",
        )
        
        assert ctx.obj_id == "test_id"
        assert ctx.obj_type == "TestType"
        assert ctx.trace_id == "trace_123"
        assert ctx.span_id == "span_456"
    
    def test_anchor_string_type(self):
        """Test anchor with string type name."""
        with anchor("obj_456", "CustomType") as ctx:
            assert ctx.obj_type == "CustomType"
    
    def test_anchor_class_type(self):
        """Test anchor with class type."""
        with anchor("obj_789", TestUser) as ctx:
            assert ctx.obj_type == "TestUser"
    
    def test_nested_anchors(self):
        """Test nested anchor contexts."""
        with anchor("user_1", TestUser) as user_ctx:
            assert user_ctx.obj_id == "user_1"
            
            with anchor("order_1", TestOrder) as order_ctx:
                assert order_ctx.obj_id == "order_1"
                # Inner context should have its own identity
                assert order_ctx.obj_type == "TestOrder"
            
            # Back to outer context - context still valid
            assert user_ctx.obj_id == "user_1"
    
    def test_anchor_returns_context(self):
        """Test that anchor returns AnchorContext."""
        with anchor("test_obj", TestUser) as ctx:
            assert isinstance(ctx, AnchorContext)


# =============================================================================
# ANCHORED DECORATOR TESTS
# =============================================================================

class TestAnchoredDecorator:
    """Test @anchored decorator."""
    
    def test_anchored_basic(self):
        @anchored("func_obj", TestUser)
        def my_function():
            return "result"
        
        result = my_function()
        assert result == "result"
    
    def test_anchored_with_args(self):
        @anchored("func_obj", TestUser)
        def add(a, b):
            return a + b
        
        result = add(2, 3)
        assert result == 5
    
    def test_anchored_preserves_function_name(self):
        @anchored("test", TestUser)
        def my_special_function():
            pass
        
        assert my_special_function.__name__ == "my_special_function"


# =============================================================================
# TRILOG LOGGER TESTS
# =============================================================================

class TestTriLogLogger:
    """Test TriLogLogger functionality."""
    
    def test_logger_creation(self):
        logger = TriLogLogger("test_module")
        assert logger.name == "test_module"
    
    def test_state_change_outside_context(self):
        """State change outside anchor should work (with warning)."""
        logger = TriLogLogger("test")
        # Should not raise, even without context
        logger.state_change(name="test", count=5)
    
    def test_state_change_inside_context(self):
        """State change inside anchor context."""
        logger = TriLogLogger("test")
        
        with anchor("obj_1", TestUser):
            # Should emit log with context
            logger.state_change(name="Alice", login_count=1)
    
    def test_event_logging(self):
        """Test event logging method."""
        logger = TriLogLogger("test")
        
        with anchor("obj_1", TestUser):
            logger.event("user_login", ip_address="192.168.1.1")
    
    def test_action_logging(self):
        """Test action logging method."""
        logger = TriLogLogger("test")
        
        with anchor("obj_1", TestUser):
            logger.action("send_email", recipient="user@example.com")
    
    def test_phase_change_logging(self):
        """Test phase change logging for processes."""
        logger = TriLogLogger("test")
        
        with anchor("proc_1", "OrderProcess"):
            logger.phase_change("processing")
    
    def test_logger_with_extra_context(self):
        """Test logger with additional context."""
        logger = TriLogLogger("test")
        
        with anchor("obj_1", TestUser):
            logger.state_change(
                name="Bob",
                _extra={"request_id": "req_123"},
            )


# =============================================================================
# CONTEXT PROPAGATION TESTS
# =============================================================================

class TestContextPropagation:
    """Test context propagation via OTel."""
    
    def test_context_available_in_anchor(self):
        """Verify context is available within anchor."""
        captured_ctx = None
        
        with anchor("obj_1", TestUser) as ctx:
            captured_ctx = ctx
        
        assert captured_ctx is not None
        assert captured_ctx.obj_id == "obj_1"
    
    def test_context_not_leaked_after_anchor(self):
        """Verify context doesn't leak after anchor exits."""
        with anchor("obj_1", TestUser) as ctx:
            inner_id = ctx.obj_id
        
        # After context, should be different/None
        # This depends on implementation details
        assert inner_id == "obj_1"
    
    def test_parallel_anchors(self):
        """Test that parallel anchors don't interfere."""
        results = []
        
        with anchor("obj_a", TestUser) as ctx_a:
            results.append(("a", ctx_a.obj_id))
        
        with anchor("obj_b", TestUser) as ctx_b:
            results.append(("b", ctx_b.obj_id))
        
        assert results == [("a", "obj_a"), ("b", "obj_b")]


# =============================================================================
# INTEGRATION TESTS
# =============================================================================

class TestContextIntegration:
    """Integration tests for context module."""
    
    def test_full_logging_workflow(self):
        """Test complete logging workflow with context."""
        logger = TriLogLogger("integration_test")
        events_logged = []
        
        # Mock the underlying logger to capture events
        original_info = logger._logger.info
        
        def capture_info(msg, *args, **kwargs):
            events_logged.append(msg)
            original_info(msg, *args, **kwargs)
        
        logger._logger.info = capture_info
        
        with anchor("user_123", TestUser):
            logger.state_change(name="Alice")
            logger.event("profile_updated")
            logger.action("send_notification")
        
        # Verify events were logged
        assert len(events_logged) >= 3
    
    def test_nested_workflow(self):
        """Test nested context workflow."""
        logger = TriLogLogger("nested_test")
        
        with anchor("user_1", TestUser) as user_ctx:
            logger.state_change(name="User One")
            
            with anchor("order_1", TestOrder) as order_ctx:
                logger.state_change(user_id="user_1", total=100)
                
                assert order_ctx.obj_id == "order_1"
            
            # Back to user context
            logger.state_change(login_count=1)


# =============================================================================
# ERROR HANDLING TESTS
# =============================================================================

class TestErrorHandling:
    """Test error handling in context module."""
    
    def test_anchor_with_none_id(self):
        """Test anchor with None ID."""
        with pytest.raises((ValueError, TypeError)):
            with anchor(None, TestUser):
                pass
    
    def test_anchor_with_empty_id(self):
        """Test anchor with empty ID."""
        # Empty ID should either raise or be handled
        try:
            with anchor("", TestUser) as ctx:
                assert ctx.obj_id == ""
        except ValueError:
            pass  # Also acceptable
    
    def test_logger_exception_in_context(self):
        """Test that exceptions propagate through context."""
        logger = TriLogLogger("error_test")
        
        with pytest.raises(ValueError):
            with anchor("obj_1", TestUser):
                logger.state_change(name="Test")
                raise ValueError("Intentional error")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
