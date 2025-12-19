"""
TriLog Context Anchoring

The "Anchor" is the mechanism that ties all logs within a scope
to a specific TriLog Object. It uses OpenTelemetry Baggage for
context propagation, ensuring that even nested function calls
inherit the object ID.
"""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Iterator, Optional, Type, Union
from uuid import uuid4

from opentelemetry import baggage, context, trace
from opentelemetry.baggage import get_baggage, set_baggage
from opentelemetry.context import Context

from trilog.dsl.base import Object


# Context variable to track the current anchor
_current_anchor: ContextVar[Optional['AnchorContext']] = ContextVar(
    'trilog_anchor', default=None
)


@dataclass
class AnchorContext:
    """
    Represents an active anchor context.
    
    Attributes:
        obj_id: The object ID this anchor is tied to
        obj_type: The Object class type
        created_at: When this anchor was created
        parent: The parent anchor context (for nested anchors)
        metadata: Additional metadata for this anchor
    """
    obj_id: str
    obj_type: Optional[Type[Object]]
    created_at: datetime
    parent: Optional[AnchorContext] = None
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
    
    @property
    def type_name(self) -> str:
        """Get the type name string"""
        if self.obj_type is not None:
            return self.obj_type.__trilog_type__
        return "unknown"
    
    @property
    def otel_prefix(self) -> str:
        """Get the OTel attribute prefix"""
        if self.obj_type is not None:
            return self.obj_type.get_otel_prefix()
        return "trilog"
    
    def to_baggage(self) -> Dict[str, str]:
        """Convert anchor to OTel baggage entries"""
        return {
            "trilog.obj.id": self.obj_id,
            "trilog.obj.type": self.type_name,
            "trilog.anchor.created_at": self.created_at.isoformat(),
        }


@contextmanager
def anchor(
    obj_id: Union[str, Object],
    obj_type: Optional[Type[Object]] = None,
    **metadata
) -> Iterator[AnchorContext]:
    """
    Context manager that "anchors" the current execution to a specific object.
    
    All logs and telemetry emitted within this context will automatically
    be associated with the specified object ID. This uses OpenTelemetry
    baggage for context propagation.
    
    Args:
        obj_id: The object ID to anchor to, or an Object instance
        obj_type: The Object class type (inferred from obj_id if it's an Object)
        **metadata: Additional metadata to attach to the anchor
    
    Yields:
        AnchorContext: The active anchor context
    
    Example:
        with anchor("cart_123", ShoppingCart):
            # All logs here belong to cart_123
            logger.info("Item added")
            
            # Nested anchors are supported
            with anchor("user_456", User):
                # This log belongs to user_456
                logger.info("User action")
    """
    # Extract obj_id and type from Object instance
    if isinstance(obj_id, Object):
        actual_id = obj_id.__trilog_id__
        actual_type = type(obj_id)
    else:
        actual_id = str(obj_id)
        actual_type = obj_type
    
    # Get the parent anchor (if any)
    parent = _current_anchor.get()
    
    # Create the new anchor context
    anchor_ctx = AnchorContext(
        obj_id=actual_id,
        obj_type=actual_type,
        created_at=datetime.utcnow(),
        parent=parent,
        metadata=metadata,
    )
    
    # Set up OTel baggage
    ctx = context.get_current()
    for key, value in anchor_ctx.to_baggage().items():
        ctx = set_baggage(key, value, ctx)
    
    # Attach the new context
    token = context.attach(ctx)
    anchor_token = _current_anchor.set(anchor_ctx)
    
    try:
        yield anchor_ctx
    finally:
        # Restore the previous context
        _current_anchor.reset(anchor_token)
        context.detach(token)


def get_current_anchor() -> Optional[AnchorContext]:
    """
    Get the current anchor context.
    
    Returns:
        The active AnchorContext, or None if not anchored
    """
    return _current_anchor.get()


def get_current_obj_id() -> Optional[str]:
    """
    Get the current object ID from baggage.
    
    This works even if called from code that doesn't have
    direct access to the AnchorContext.
    
    Returns:
        The current object ID, or None if not anchored
    """
    return get_baggage("trilog.obj.id")


def get_current_obj_type() -> Optional[str]:
    """
    Get the current object type from baggage.
    
    Returns:
        The current object type name, or None if not anchored
    """
    return get_baggage("trilog.obj.type")


class AnchorStack:
    """
    Utility for tracking nested anchor contexts.
    
    Useful for debugging and understanding the anchor hierarchy.
    """
    
    @staticmethod
    def get_stack() -> list[AnchorContext]:
        """Get the full stack of anchor contexts"""
        stack = []
        current = _current_anchor.get()
        while current is not None:
            stack.append(current)
            current = current.parent
        return list(reversed(stack))
    
    @staticmethod
    def get_depth() -> int:
        """Get the current anchor depth"""
        return len(AnchorStack.get_stack())
    
    @staticmethod
    def get_root() -> Optional[AnchorContext]:
        """Get the root anchor context"""
        stack = AnchorStack.get_stack()
        return stack[0] if stack else None


# Decorator version of anchor
def anchored(
    obj_id_param: str = "obj_id",
    obj_type: Optional[Type[Object]] = None,
):
    """
    Decorator that anchors a function to an object.
    
    The object ID is extracted from a function parameter.
    
    Args:
        obj_id_param: Name of the parameter containing the object ID
        obj_type: The Object class type
    
    Example:
        @anchored("cart_id", ShoppingCart)
        def add_item(cart_id: str, item: Item):
            # All logs here are anchored to cart_id
            logger.info("Adding item")
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            # Try to get obj_id from kwargs
            obj_id = kwargs.get(obj_id_param)
            
            # If not in kwargs, try positional args
            if obj_id is None:
                import inspect
                sig = inspect.signature(func)
                params = list(sig.parameters.keys())
                if obj_id_param in params:
                    idx = params.index(obj_id_param)
                    if idx < len(args):
                        obj_id = args[idx]
            
            if obj_id is None:
                raise ValueError(f"Could not find {obj_id_param} in function arguments")
            
            with anchor(obj_id, obj_type):
                return func(*args, **kwargs)
        
        return wrapper
    return decorator
