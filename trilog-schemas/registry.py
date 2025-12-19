"""
TriLog schema registry for Nexus Python.

This module exports the complete schema registry for use in all Nexus services.
This is the centralized system model that defines all entities and workflows
in the Nexus platform.
"""

from trilog.dsl import Registry
from .objects import (
    # User Management
    User,
    Subscription,
    TokenUsage,
    # HTTP & WebSocket
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


def create_nexus_registry() -> Registry:
    """Create and populate the Nexus TriLog registry.

    This registry defines the complete system model for the Nexus platform,
    including all objects (entities) and processes (workflows).

    Returns:
        Registry: The configured Nexus registry with all schemas
    """

    registry = Registry("nexus-python", "1.0.0")

    # Register User Management objects
    registry.register(User)
    registry.register(Subscription)
    registry.register(TokenUsage)

    # Register HTTP & WebSocket objects
    registry.register(APIRequest)
    registry.register(WebSocketConnection)

    # Register Workspace & Panel objects
    registry.register(Workspace)
    registry.register(Panel)
    registry.register(PanelTemplate)
    registry.register(Extension)

    # Register Runtime & Execution objects
    registry.register(NXMLParseJob)
    registry.register(SandboxExecution)
    registry.register(NOGQuery)
    registry.register(AIContextBuild)
    registry.register(AIPatchGeneration)

    # Register NOG & AI Workflow objects
    registry.register(NOGEntity)
    registry.register(AISyncPatch)

    # Register processes
    registry.register(PanelLifecycle)
    registry.register(HandlerExecution)
    registry.register(AISyncFlow)
    registry.register(WorkspaceCreation)
    registry.register(NOGSynchronization)
    registry.register(PatchApplication)
    registry.register(SubscriptionManagement)
    registry.register(UserOnboarding)
    registry.register(UserAuthentication)

    return registry


# Create global registry instance
nexus_registry = create_nexus_registry()


if __name__ == "__main__":
    # Export registry to JSON
    import json

    output_path = "nexus_trilog_registry.json"
    registry_data = nexus_registry.export()

    with open(output_path, "w") as f:
        json.dump(registry_data, f, indent=2)

    print(f"✅ Nexus TriLog registry exported to {output_path}")
    print(f"   Objects: {len(registry_data['objects'])}")
    print(f"   Processes: {len(registry_data['processes'])}")
