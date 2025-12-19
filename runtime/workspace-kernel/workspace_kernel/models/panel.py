"""
Panel model.
"""

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class Panel(Base):
    """Panel instance in a workspace."""

    __tablename__ = "panels"

    id = Column(String, primary_key=True)
    workspace_id = Column(String, ForeignKey("workspaces.id"), nullable=False)

    # Identity
    name = Column(String, nullable=False)
    panel_type = Column(String, nullable=False)  # custom, flowchart, etc.

    # Lifecycle
    state = Column(String, default="draft")  # draft, active, suspended, archived
    is_running = Column(Boolean, default=False)

    # NXML
    nxml_source = Column(Text, nullable=False)
    nxml_hash = Column(String, index=True)
    nxml_size_bytes = Column(Integer, default=0)
    ast_node_count = Column(Integer, default=0)

    # State
    state_variable_count = Column(Integer, default=0)
    computed_variable_count = Column(Integer, default=0)
    tool_count = Column(Integer, default=0)

    # Execution metrics
    handler_execution_count = Column(Integer, default=0)
    total_execution_time_ms = Column(Integer, default=0)
    error_count = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    workspace = relationship("Workspace", back_populates="panels")
