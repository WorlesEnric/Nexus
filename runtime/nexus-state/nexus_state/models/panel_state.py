"""
Database models for panel state management
"""

from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Index, BigInteger, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
import uuid

from ..database import Base


class PanelState(Base):
    """Current state of a panel (single source of truth)"""

    __tablename__ = "panel_states"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Identity (composite key)
    user_id = Column(String(255), nullable=False, index=True)
    workspace_id = Column(String(255), nullable=False, index=True)
    panel_id = Column(String(255), nullable=False, index=True)

    # State data
    state_data = Column(JSONB, nullable=False)
    state_schema_version = Column(String(50), default="1.0.0")

    # Versioning (optimistic locking)
    version = Column(Integer, nullable=False, default=1)
    checksum = Column(String(64))  # SHA-256 of state_data

    # Metadata
    state_size_bytes = Column(Integer)
    state_variable_count = Column(Integer)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_accessed_at = Column(DateTime, default=datetime.utcnow)

    # Indexes
    __table_args__ = (
        Index('idx_user_workspace_panel', 'user_id', 'workspace_id', 'panel_id', unique=True),
        Index('idx_workspace_panels', 'workspace_id', 'panel_id'),
        Index('idx_updated_at', 'updated_at'),
        Index('idx_state_data_gin', 'state_data', postgresql_using='gin'),
    )


class StateHistory(Base):
    """Append-only log of all state changes (audit trail, time-travel)"""

    __tablename__ = "state_history"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    # Reference to panel
    panel_state_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(String(255), nullable=False)
    workspace_id = Column(String(255), nullable=False, index=True)
    panel_id = Column(String(255), nullable=False, index=True)

    # Change tracking
    change_type = Column(String(50), nullable=False)  # created, updated, deleted, reverted
    patch = Column(JSONB)  # JSON Patch format (RFC 6902)
    previous_version = Column(Integer)
    new_version = Column(Integer)

    # Context
    triggered_by = Column(String(255))  # user, ai, system
    trigger_source = Column(String(255))  # handler_name, ai_suggestion, etc.

    # Snapshot (optional - only for major changes)
    snapshot = Column(JSONB)  # Full state snapshot

    # Metadata
    change_size_bytes = Column(Integer)

    # Timestamp
    occurred_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Indexes
    __table_args__ = (
        Index('idx_panel_history', 'panel_state_id', 'occurred_at'),
        Index('idx_workspace_history', 'workspace_id', 'occurred_at'),
    )


class StateSnapshot(Base):
    """Periodic workspace-wide state snapshots (fast restoration, Git sync)"""

    __tablename__ = "state_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Scope
    workspace_id = Column(String(255), nullable=False, index=True)
    snapshot_type = Column(String(50), nullable=False)  # manual, auto, pre_ai_edit

    # Snapshot data
    snapshot_data = Column(JSONB, nullable=False)  # Map of panel_id → state_data
    panel_count = Column(Integer)
    total_size_bytes = Column(Integer)

    # Git integration
    git_commit_hash = Column(String(64), index=True)
    git_branch = Column(String(255), default="main")

    # Metadata
    description = Column(Text)
    created_by = Column(String(255))

    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Indexes
    __table_args__ = (
        Index('idx_workspace_snapshots', 'workspace_id', 'created_at'),
    )
