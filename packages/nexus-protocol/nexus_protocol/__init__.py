"""
Nexus Protocol - Type definitions for NXML AST and NOG graph.

This package provides Pydantic models for:
- NXML Abstract Syntax Tree (AST)
- NOG (Nexus Object Graph) entities and relationships
- WebSocket protocol messages
- Validation schemas
"""

from .ast import (
    NexusPanelAST,
    PanelMeta,
    DataAST,
    LogicAST,
    ViewAST,
    StateNode,
    ComputedNode,
    ToolNode,
    HandlerNode,
    LifecycleNode,
    ViewNode,
    NXMLPrimitiveType,
)

from .nog import (
    NOGEntity,
    NOGRelationship,
    EntityType,
    RelationType,
    NOGPatch,
    PatchOperation,
)

from .messages import (
    ClientMessage,
    ServerMessage,
    ExecuteHandlerMessage,
    StateUpdateMessage,
    NOGUpdateMessage,
)

__all__ = [
    # AST types
    "NexusPanelAST",
    "PanelMeta",
    "DataAST",
    "LogicAST",
    "ViewAST",
    "StateNode",
    "ComputedNode",
    "ToolNode",
    "HandlerNode",
    "LifecycleNode",
    "ViewNode",
    "NXMLPrimitiveType",
    # NOG types
    "NOGEntity",
    "NOGRelationship",
    "EntityType",
    "RelationType",
    "NOGPatch",
    "PatchOperation",
    # Message types
    "ClientMessage",
    "ServerMessage",
    "ExecuteHandlerMessage",
    "StateUpdateMessage",
    "NOGUpdateMessage",
]

__version__ = "1.0.0"
