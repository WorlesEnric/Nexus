from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, nullable=True, index=True)  # Optional, used by workspace-kernel
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)

    # Status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)

    # Subscription
    subscription_tier = Column(String, default="free")
    tokens_used = Column(Integer, default=0)
    tokens_limit = Column(Integer, default=10000)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime)

    # Relationships
    subscription = relationship("Subscription", back_populates="user", uselist=False)
    published_panels = relationship("MarketplacePanel", back_populates="author", cascade="all, delete-orphan")
    panel_installations = relationship("PanelInstallation", back_populates="user", cascade="all, delete-orphan")

class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"))
    plan_name = Column(String, default="free") # free, pro, enterprise
    is_active = Column(Boolean, default=True)
    start_date = Column(DateTime, default=datetime.utcnow)
    end_date = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="subscription")

class MarketplacePanel(Base):
    """Marketplace panel definitions that users can browse and install."""
    __tablename__ = "marketplace_panels"

    # Primary Identity
    id = Column(String, primary_key=True, index=True)
    author_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    # Panel Metadata
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=False)
    category = Column(String, nullable=False, index=True)
    icon = Column(String, default="📦")
    accent_color = Column(String, default="#8B5CF6")

    # NXML Source
    nxml_source = Column(Text, nullable=False)
    nxml_hash = Column(String, nullable=False)

    # Publishing Status
    visibility = Column(String, default="published")  # draft, published, unlisted, deprecated
    type = Column(String, default="free")  # nexus (official), free, paid (future)

    # Tags & Search
    tags = Column(String, default="")  # Comma-separated tags

    # Version (MVP: single version only)
    version = Column(String, default="1.0.0")

    # Metrics
    install_count = Column(Integer, default=0)
    download_count = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = Column(DateTime, nullable=True)

    # Relationships
    author = relationship("User", back_populates="published_panels")
    installations = relationship("PanelInstallation", back_populates="panel", cascade="all, delete-orphan")

class PanelInstallation(Base):
    """Tracks which users have installed which marketplace panels."""
    __tablename__ = "panel_installations"

    # Composite Identity
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    panel_id = Column(String, ForeignKey("marketplace_panels.id"), nullable=False, index=True)

    # Installation Details
    installed_at = Column(DateTime, default=datetime.utcnow)
    version = Column(String, nullable=False)  # Version at time of installation
    is_active = Column(Boolean, default=True)  # Can be toggled on/off

    # Relationships
    user = relationship("User", back_populates="panel_installations")
    panel = relationship("MarketplacePanel", back_populates="installations")

    # Unique constraint: one installation per user per panel
    __table_args__ = (
        UniqueConstraint('user_id', 'panel_id', name='uq_user_panel_installation'),
        Index('idx_user_panel', 'user_id', 'panel_id'),  # Composite index for queries
    )
