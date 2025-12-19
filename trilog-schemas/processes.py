"""
TriLog Process definitions for Nexus Python modules.

These processes track multi-step workflows and state transitions.
"""

from trilog.dsl import Process


class PanelLifecycle(Process):
    """Panel lifecycle from creation to archival."""

    phases = [
        "draft",          # Initial creation
        "parsing",        # NXML parsing
        "validating",     # Semantic validation
        "initializing",   # State initialization
        "active",         # Running and accepting requests
        "suspended",      # Temporarily paused
        "archived",       # Permanently archived
        "error",          # Error state
    ]

    description = "Tracks a panel from creation through its entire lifecycle"


class HandlerExecution(Process):
    """Handler execution flow."""

    phases = [
        "requested",      # Execution requested
        "validating",     # Validating handler and capabilities
        "acquiring",      # Acquiring sandbox instance
        "executing",      # Running handler code
        "applying",       # Applying state changes
        "broadcasting",   # Broadcasting updates via WebSocket
        "completed",      # Successfully completed
        "failed",         # Failed with error
    ]

    description = "Tracks execution of a panel handler from request to completion"


class AISyncFlow(Process):
    """AI-assisted panel editing flow."""

    phases = [
        "user_request",       # User submits request
        "context_building",   # Building LLM context from NOG
        "llm_call",          # Calling LLM API
        "streaming",         # Streaming response
        "patch_parsing",     # Parsing response into patches
        "patch_validation",  # Validating patches
        "review",            # User review
        "apply",             # Applying approved patches
        "nog_update",        # Updating NOG graph
        "panel_update",      # Updating affected panels
        "completed",         # Successfully completed
        "rejected",          # User rejected
        "failed",            # Failed with error
    ]

    description = "Tracks AI-assisted editing from user request to applied changes"


class WorkspaceCreation(Process):
    """Workspace creation flow."""

    phases = [
        "init",              # Initialize workspace
        "git_init",          # Initialize Git repository
        "nog_init",          # Initialize NOG graph
        "database_create",   # Create database records
        "template_apply",    # Apply templates (if any)
        "ready",             # Workspace ready
        "failed",            # Creation failed
    ]

    description = "Tracks workspace creation from initialization to ready state"


class NOGSynchronization(Process):
    """NOG graph synchronization with Git."""

    phases = [
        "snapshot",          # Create graph snapshot
        "serialize",         # Serialize to JSON
        "git_add",           # Add to Git staging
        "git_commit",        # Commit changes
        "git_push",          # Push to remote (optional)
        "completed",         # Successfully synced
        "failed",            # Sync failed
    ]

    description = "Tracks NOG graph synchronization with Git repository"


class PatchApplication(Process):
    """Patch application to NOG graph."""

    phases = [
        "received",          # Patches received
        "validating",        # Validating patches
        "backup",            # Create graph backup
        "applying",          # Applying patches
        "verifying",         # Verifying consistency
        "broadcasting",      # Broadcasting updates
        "completed",         # Successfully applied
        "rolled_back",       # Rolled back due to error
        "failed",            # Application failed
    ]

    description = "Tracks application of NOG patches from validation to completion"


class SubscriptionManagement(Process):
    """Subscription tier changes and billing operations."""

    phases = [
        "trial",             # Trial period
        "active",            # Active subscription
        "upgrading",         # Upgrading tier
        "downgrading",       # Downgrading tier
        "renewal",           # Renewal processing
        "cancelled",         # Cancelled by user
        "expired",           # Expired due to non-payment
    ]

    description = "Tracks subscription lifecycle from trial to cancellation"


class UserOnboarding(Process):
    """New user onboarding flow."""

    phases = [
        "signup",            # User signs up
        "email_verification", # Email verification sent
        "profile_setup",     # Profile information setup
        "first_workspace",   # First workspace creation
        "complete",          # Onboarding completed
        "abandoned",         # User abandoned onboarding
    ]

    description = "Tracks user onboarding from signup to first workspace creation"


class UserAuthentication(Process):
    """User login and authentication flow."""

    phases = [
        "attempt",           # Login attempt
        "verify",            # Credential verification
        "success",           # Successfully authenticated
        "failure",           # Authentication failed
    ]

    description = "Tracks user authentication from attempt to success or failure"
