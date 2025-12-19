"""
TriLog schemas for Nexus Python modules.

This package defines all Objects and Processes for model-driven observability
using the TriLog system.

This is the centralized schema directory for the entire Nexus system,
providing a unified system modeling layer shared across all services.
"""

from .objects import (
    # User Management
    User,
    Subscription,
    TokenUsage,
    # HTTP & WebSocket Tracking
    APIRequest,
    WebSocketConnection,
    # Workspace & Panels
    Workspace,
    Panel,
    PanelTemplate,
    Extension,
    # Runtime & Execution
    NXMLParseJob,
    SandboxExecution,
    NOGQuery,
    AIContextBuild,
    AIPatchGeneration,
    # NOG & AI Workflow
    NOGEntity,
    AISyncPatch,
)

from .processes import (
    PanelLifecycle,
    HandlerExecution,
    AISyncFlow,
    WorkspaceCreation,
    NOGSynchronization,
    PatchApplication,
    SubscriptionManagement,
    UserOnboarding,
    UserAuthentication,
)

from .registry import create_nexus_registry, nexus_registry

__all__ = [
    # Objects - User Management
    "User",
    "Subscription",
    "TokenUsage",
    # Objects - HTTP & WebSocket
    "APIRequest",
    "WebSocketConnection",
    # Objects - Workspace & Panels
    "Workspace",
    "Panel",
    "PanelTemplate",
    "Extension",
    # Objects - Runtime & Execution
    "NXMLParseJob",
    "SandboxExecution",
    "NOGQuery",
    "AIContextBuild",
    "AIPatchGeneration",
    # Objects - NOG & AI Workflow
    "NOGEntity",
    "AISyncPatch",
    # Processes
    "PanelLifecycle",
    "HandlerExecution",
    "AISyncFlow",
    "WorkspaceCreation",
    "NOGSynchronization",
    "PatchApplication",
    "SubscriptionManagement",
    "UserOnboarding",
    "UserAuthentication",
    # Registry
    "create_nexus_registry",
    "nexus_registry",
]
