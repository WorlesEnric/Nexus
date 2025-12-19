"""
TriLog Context Management

This module provides utilities for managing OpenTelemetry context
and baggage propagation. The key concept is "anchoring" - associating
all logs within a scope with a specific object ID.

Example:
    from trilog.context import anchor, TriLogLogger

    logger = TriLogLogger(__name__)

    with anchor("cart_123", ShoppingCart):
        # All logs automatically inherit cart_123 as their object ID
        logger.state_change(item_count=5)
        logger.event("item_added", item_id="SKU-001")
"""

from trilog.context.anchor import (
    anchor,
    get_current_anchor,
    AnchorContext,
)

from trilog.context.propagation import (
    TriLogLogger,
    setup_otel,
    get_tracer,
    get_meter,
)

__all__ = [
    # Anchor
    "anchor",
    "get_current_anchor",
    "AnchorContext",
    # Propagation
    "TriLogLogger",
    "setup_otel",
    "get_tracer",
    "get_meter",
]
