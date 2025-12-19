"""
Pydantic schemas for request/response validation
"""

from datetime import datetime
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field


# === State Schemas ===

class StateData(BaseModel):
    """Panel state data structure"""
    state: Dict[str, Any] = Field(default_factory=dict, alias="$state")
    computed: Dict[str, Any] = Field(default_factory=dict, alias="$computed")

    class Config:
        populate_by_name = True


class UpdateStateRequest(BaseModel):
    """Request to update panel state"""
    state: Dict[str, Any]
    version: int
    triggered_by: str = "user"
    trigger_source: Optional[str] = None


class PatchOperation(BaseModel):
    """JSON Patch operation (RFC 6902)"""
    op: str  # add, remove, replace, move, copy, test
    path: str
    value: Optional[Any] = None
    from_: Optional[str] = Field(None, alias="from")


class PatchStateRequest(BaseModel):
    """Request to patch panel state"""
    patches: List[PatchOperation]
    version: int
    triggered_by: str = "user"
    trigger_source: Optional[str] = None


class StateResponse(BaseModel):
    """Response with panel state"""
    panel_id: str
    workspace_id: str
    state: Dict[str, Any]
    version: int
    updated_at: datetime
    history: Optional[List[Dict[str, Any]]] = None


class StateUpdateResponse(BaseModel):
    """Response after state update"""
    success: bool
    version: int
    updated_at: datetime


# === History Schemas ===

class StateHistoryEntry(BaseModel):
    """Single state history entry"""
    id: int
    change_type: str
    patch: Optional[List[Dict[str, Any]]]
    version: int
    triggered_by: str
    trigger_source: Optional[str]
    occurred_at: datetime


class StateHistoryResponse(BaseModel):
    """Response with state history"""
    panel_id: str
    total_changes: int
    history: List[StateHistoryEntry]


# === Snapshot Schemas ===

class CreateSnapshotRequest(BaseModel):
    """Request to create state snapshot"""
    snapshot_type: str = "manual"
    description: Optional[str] = None
    commit_to_git: bool = True


class SnapshotResponse(BaseModel):
    """Response with snapshot info"""
    snapshot_id: str
    workspace_id: str
    panel_count: int
    total_size_bytes: int
    git_commit_hash: Optional[str]
    created_at: datetime


class WorkspaceSnapshotResponse(BaseModel):
    """Response with workspace state snapshot"""
    workspace_id: str
    panels: Dict[str, Dict[str, Any]]  # panel_id → state_data
    total_panels: int
    snapshot_at: datetime
    git_commit: Optional[str]


# === Revert Schemas ===

class RevertStateRequest(BaseModel):
    """Request to revert state to a specific version"""
    target_version: int
    create_snapshot: bool = True


class RevertStateResponse(BaseModel):
    """Response after state revert"""
    success: bool
    version: int  # New version after revert
    reverted_to: int
    snapshot_id: Optional[str]
    updated_at: datetime
