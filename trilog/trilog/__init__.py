"""
TriLog - Model-Driven Observability System

A schema-first, OTel-native system for creating Digital Twins
of your runtime environment.

Example usage:

    from trilog.dsl import Object, Process, Integer, Float, String
    from trilog.context import anchor
    from trilog.engine import Reconstructor

    # Define your schema
    class ShoppingCart(Object):
        item_count = Integer(default=0)
        total_value = Float(default=0.0)

    # Use in your code
    with anchor("cart_123", ShoppingCart):
        logger.info("Item added", extra={"cart.item_count": 5})

    # Reconstruct state
    twin = reconstructor.reconstruct("cart_123", target_time)
"""

__version__ = "1.1.0"
__author__ = "TriLog Team"

from trilog.dsl import (
    Object,
    Process,
    Integer,
    Float,
    String,
    Boolean,
    List,
    Dict,
    Timestamp,
    Registry,
)

from trilog.context import (
    anchor,
    get_current_anchor,
    TriLogLogger,
)

from trilog.engine import (
    Reconstructor,
    TimelineQuery,
)

__all__ = [
    # Version
    "__version__",
    # DSL
    "Object",
    "Process",
    "Integer",
    "Float",
    "String",
    "Boolean",
    "List",
    "Dict",
    "Timestamp",
    "Registry",
    # Context
    "anchor",
    "get_current_anchor",
    "TriLogLogger",
    # Engine
    "Reconstructor",
    "TimelineQuery",
]
