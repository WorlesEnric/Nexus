"""
TriLog Object definitions for Nexus Python modules.

These objects track the state and lifecycle of entities in the Nexus system.
Consolidated from multiple sources to provide a unified system model.
"""

from trilog.dsl import Object, Integer, Float, String, Boolean, List, Dict, Timestamp, Reference


# =============================================================================
# USER MANAGEMENT OBJECTS
# =============================================================================

class User(Object):
    """User account in the Nexus system."""

    # Identity
    email = String(required=True)
    username = String(required=True)
    full_name = String(default="")

    # Authentication
    is_active = Boolean(default=True)
    is_verified = Boolean(default=False)
    last_login = Timestamp()
    created_at = Timestamp()

    # Subscription reference
    subscription_id = Reference("Subscription")
    subscription_tier = String(default="free")  # free, pro, enterprise

    # Resource quotas (denormalized for quick access)
    tokens_used = Integer(default=0)
    tokens_limit = Integer(default=10000)
    max_panels = Integer(default=3)
    storage_quota_mb = Integer(default=500)

    # Usage tracking
    workspace_count = Integer(default=0)
    panel_count = Integer(default=0)
    storage_used_mb = Float(default=0.0)


class Subscription(Object):
    """User subscription managing resource quotas and billing."""

    # Owner
    user_id = Reference("User", required=True)

    # Tier and status
    tier = String(default="free")  # free, starter, pro, team, enterprise
    status = String(default="active")  # active, cancelled, expired, trial

    # Resource allocations
    token_budget = Integer(default=10000)
    max_panels = Integer(default=3)
    storage_quota_mb = Integer(default=500)

    # Billing
    billing_cycle = String(default="monthly")  # monthly, yearly
    price_cents = Integer(default=0)
    next_billing_date = Timestamp()

    # Trial info
    is_trial = Boolean(default=True)
    trial_ends_at = Timestamp()

    # Usage tracking
    current_period_start = Timestamp()
    tokens_used_this_period = Integer(default=0)


class TokenUsage(Object):
    """Tracks token consumption for AI operations."""

    # Context
    user_id = Reference("User", required=True)
    workspace_id = Reference("Workspace")
    panel_id = Reference("Panel")

    # Usage details
    operation_type = String(default="inference")  # inference, embedding, sync
    model_used = String(default="")
    input_tokens = Integer(default=0)
    output_tokens = Integer(default=0)
    nexus_tokens = Integer(default=0)  # Unified cost

    # Timing
    timestamp = Timestamp()
    duration_ms = Integer(default=0)


# =============================================================================
# HTTP & WEBSOCKET TRACKING
# =============================================================================

class APIRequest(Object):
    """An HTTP API request to the backend."""

    # Request info
    method = String(required=True)  # GET, POST, etc.
    path = String(required=True)  # /auth/login, etc.

    # Response
    status_code = Integer(default=0)
    duration_ms = Integer(default=0)

    # Context
    user_id = Reference("User")  # May be null for unauthenticated requests
    service_name = String(default="")  # graphstudio-backend, workspace-kernel, etc.


class WebSocketConnection(Object):
    """A WebSocket connection from frontend to workspace-kernel."""

    # Connection info
    panel_id = String(required=True)
    workspace_id = Reference("Workspace")
    is_connected = Boolean(default=False)

    # Timestamps
    connected_at = Timestamp()
    disconnected_at = Timestamp()

    # Status
    last_error = String(default="")
    reconnect_attempts = Integer(default=0)
    message_count = Integer(default=0)


# =============================================================================
# WORKSPACE AND PANEL OBJECTS
# =============================================================================

class Workspace(Object):
    """Workspace container for panels."""

    # Identity
    workspace_name = String(required=True)
    owner_id = Reference("User", required=True)

    # Status
    status = String(default="active")  # active, suspended, archived
    is_public = Boolean(default=False)
    is_active = Boolean(default=True)
    created_at = Timestamp()
    last_accessed_at = Timestamp()

    # Metadata
    panel_count = Integer(default=0)
    nog_entity_count = Integer(default=0)
    nog_relationship_count = Integer(default=0)

    # Git
    git_repo_path = String()
    git_branch = String(default="main")
    last_commit_hash = String()
    last_commit_at = Timestamp()
    has_uncommitted_changes = Boolean(default=False)

    # Resources
    storage_bytes = Integer(default=0)
    storage_used_mb = Float(default=0.0)
    cpu_usage_percent = Float(default=0.0)
    memory_usage_mb = Integer(default=0)

    # Sharing
    is_shared = Boolean(default=False)
    shared_with = List(default=[])  # List of user IDs


class Panel(Object):
    """Panel instance in a workspace."""

    # Identity
    panel_name = String(required=True)
    workspace_id = Reference("Workspace", required=True)
    panel_type = String(required=True)  # custom, flowchart, code_editor, etc.
    template_id = Reference("PanelTemplate")

    # Lifecycle
    state = String(default="draft")  # draft, active, suspended, archived
    is_running = Boolean(default=False)
    version = Integer(default=1)

    # NXML
    nxml_hash = String()
    nxml_size_bytes = Integer(default=0)
    ast_node_count = Integer(default=0)

    # State
    state_variable_count = Integer(default=0)
    computed_variable_count = Integer(default=0)
    tool_count = Integer(default=0)

    # Execution
    handler_execution_count = Integer(default=0)
    total_execution_time_ms = Integer(default=0)
    error_count = Integer(default=0)

    # Resources
    memory_usage_mb = Integer(default=0)
    cpu_time_ms = Integer(default=0)

    # Timestamps
    created_at = Timestamp()
    updated_at = Timestamp()
    started_at = Timestamp()

    # MCP bridge
    registered_tools = List(default=[])  # Tool names exposed to NexusOS


class PanelTemplate(Object):
    """A reusable panel template for the marketplace."""

    # Basic info
    name = String(required=True)
    description = String(default="")
    panel_type = String(required=True)

    # Author
    author_id = Reference("User", required=True)

    # Definition
    nxml_definition = String(default="")  # Full NXML content
    nxml_hash = String(default="")
    version = String(default="1.0.0")

    # Marketplace
    marketplace_status = String(default="private")  # private, pending_review, published, deprecated
    price_type = String(default="nexus")  # nexus (free), free, paid
    price_cents = Integer(default=0)

    # Stats
    install_count = Integer(default=0)
    rating_sum = Float(default=0.0)
    rating_count = Integer(default=0)

    # Timestamps
    created_at = Timestamp()
    published_at = Timestamp()
    updated_at = Timestamp()


class Extension(Object):
    """An extension for custom integrations (LLM services, data sources, etc)."""

    # Basic info
    name = String(required=True)
    description = String(default="")
    extension_type = String(default="custom")  # llm_service, data_source, storage, notification, custom

    # Owner
    owner_id = Reference("User", required=True)

    # Configuration
    endpoint = String(default="")
    auth_type = String(default="none")  # none, api_key, oauth, custom
    auth_config = Dict(default={})  # Encrypted config

    # Status
    is_active = Boolean(default=True)
    is_verified = Boolean(default=False)
    last_health_check = Timestamp()
    health_status = String(default="unknown")

    # Usage
    request_count = Integer(default=0)
    error_count = Integer(default=0)


# =============================================================================
# RUNTIME & EXECUTION OBJECTS
# =============================================================================

class NXMLParseJob(Object):
    """Tracks NXML parsing operations."""

    # Context
    panel_id = Reference("Panel", required=True)
    workspace_id = Reference("Workspace", required=True)

    # Input
    nxml_hash = String(required=True)
    source_length = Integer(default=0)

    # Parsing metrics
    token_count = Integer(default=0)
    ast_node_count = Integer(default=0)
    parse_duration_ms = Integer(default=0)

    # Cache status
    cache_hit = Boolean(default=False)
    cached_from = String(default="")

    # Validation
    has_errors = Boolean(default=False)
    error_count = Integer(default=0)
    warning_count = Integer(default=0)

    # Result
    success = Boolean(default=True)


class SandboxExecution(Object):
    """Tracks handler execution in Wasmtime sandbox."""

    # Context
    panel_id = Reference("Panel", required=True)
    workspace_id = Reference("Workspace", required=True)
    handler_name = String(required=True)

    # Execution context
    instance_id = String(required=True)
    context_size_bytes = Integer(default=0)

    # Resource usage
    memory_used_bytes = Integer(default=0)
    memory_limit_bytes = Integer(default=134217728)  # 128MB
    cpu_time_ms = Integer(default=0)
    execution_duration_ms = Integer(default=0)
    timeout_ms = Integer(default=5000)

    # Host function calls
    host_call_count = Integer(default=0)

    # Capabilities
    capabilities_required = List(default=[])
    capabilities_granted = List(default=[])

    # Status
    success = Boolean(default=True)
    error_message = String(default="")
    error_type = String(default="")  # timeout, memory_limit, capability_denied, runtime_error

    # State changes
    state_mutations_count = Integer(default=0)


class NOGQuery(Object):
    """Tracks NOG graph query operations."""

    # Context
    workspace_id = Reference("Workspace", required=True)

    # Query details
    query_type = String(required=True)  # get_entity, get_subgraph, find_path, search
    entity_id = String()
    source_id = String()
    target_id = String()

    # Filters
    entity_types = List(default=[])
    relation_types = List(default=[])
    depth = Integer(default=2)

    # Performance
    graph_size = Integer(default=0)
    result_count = Integer(default=0)
    query_duration_ms = Integer(default=0)

    # Source
    requested_by = String(default="")  # service name or user_id


class AIContextBuild(Object):
    """Tracks AI context building from NOG graph."""

    # Context
    workspace_id = Reference("Workspace", required=True)
    panel_id = Reference("Panel")
    user_request = String()

    # Context composition
    entities_included = Integer(default=0)
    relationships_included = Integer(default=0)
    context_tokens = Integer(default=0)
    context_documents = Integer(default=0)

    # Pruning
    initial_entities = Integer(default=0)
    pruned_entities = Integer(default=0)
    pruning_strategy = String(default="relevance")

    # Timing
    build_duration_ms = Integer(default=0)


class AIPatchGeneration(Object):
    """Tracks AI patch generation from LLM responses."""

    # Context
    workspace_id = Reference("Workspace", required=True)
    panel_id = Reference("Panel")
    ai_context_build_id = Reference("AIContextBuild")

    # LLM details
    model_name = String()
    model_provider = String()  # openai, anthropic, etc.

    # Request
    user_request = String()
    context_tokens = Integer(default=0)

    # Response
    response_tokens = Integer(default=0)
    time_to_first_byte_ms = Integer(default=0)
    total_duration_ms = Integer(default=0)

    # Patches
    patch_count = Integer(default=0)
    entity_creates = Integer(default=0)
    entity_updates = Integer(default=0)
    entity_deletes = Integer(default=0)
    relationship_creates = Integer(default=0)

    # Status
    success = Boolean(default=True)
    error_message = String(default="")

    # Review
    patches_approved = Integer(default=0)
    patches_rejected = Integer(default=0)


# =============================================================================
# NOG & AI WORKFLOW OBJECTS
# =============================================================================

class NOGEntity(Object):
    """An entity in the Nexus Object Graph (NOG).

    NOG is the semantic layer that maintains relationships
    between data across all panels in a workspace.
    """

    workspace_id = Reference("Workspace", required=True)

    # Entity info
    entity_type = String(required=True)  # e.g., "function", "variable", "concept"
    name = String(required=True)

    # Semantic content
    description = String(default="")
    properties = Dict(default={})

    # Source tracking
    source_panel_id = Reference("Panel")
    source_location = String(default="")  # e.g., "line:42"

    # Relationships
    related_entities = List(default=[])  # List of entity IDs

    # Versioning
    version = Integer(default=1)
    created_at = Timestamp()
    updated_at = Timestamp()


class AISyncPatch(Object):
    """A patch generated by AI sync operations.

    When NOG changes, NexusOS generates patches for affected
    panels that must be reviewed before application.
    """

    workspace_id = Reference("Workspace", required=True)
    target_panel_id = Reference("Panel", required=True)

    # Source of change
    source_panel_id = Reference("Panel")
    triggering_event = String(default="")

    # Patch content
    patch_type = String(default="modify")  # create, modify, delete
    patch_content = String(default="")  # JSON diff or NXML fragment

    # Status
    status = String(default="pending")  # pending, processing, review, applied, rejected

    # Review
    created_at = Timestamp()
    reviewed_at = Timestamp()
    reviewed_by = Reference("User")
    rejection_reason = String(default="")

    # Application
    applied_at = Timestamp()
    rollback_available = Boolean(default=True)
