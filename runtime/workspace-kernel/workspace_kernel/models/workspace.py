"""
Workspace model.
"""

from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class Workspace(Base):
    """Workspace container for panels."""

    __tablename__ = "workspaces"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)

    # Status
    status = Column(String, default="active")  # active, suspended, archived
    is_public = Column(Boolean, default=False)

    # Metadata
    description = Column(Text)
    panel_count = Column(Integer, default=0)
    nog_entity_count = Column(Integer, default=0)
    nog_relationship_count = Column(Integer, default=0)

    # Git
    git_repo_path = Column(String)
    git_branch = Column(String, default="main")
    last_commit_hash = Column(String)
    last_commit_at = Column(DateTime)

    # Resources
    storage_bytes = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    owner = relationship("User", back_populates="workspaces")
    panels = relationship("Panel", back_populates="workspace")
