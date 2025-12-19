from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional, List

# Token schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# User schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: str
    is_active: bool
    created_at: datetime
    subscription: Optional["Subscription"] = None

    class Config:
        from_attributes = True

# Subscription schemas
class SubscriptionBase(BaseModel):
    plan_name: str

class Subscription(SubscriptionBase):
    id: str
    user_id: str
    is_active: bool
    start_date: datetime
    end_date: Optional[datetime] = None

    class Config:
        from_attributes = True

# Update forward references
User.model_rebuild()

# ============================================================================
# Marketplace Panel Schemas
# ============================================================================

class PanelAuthor(BaseModel):
    """Author information for marketplace panels."""
    id: str
    full_name: Optional[str] = None
    email: str
    username: Optional[str] = None

    class Config:
        from_attributes = True


class PublishPanelRequest(BaseModel):
    """Request schema for publishing a new panel."""
    name: str = Field(..., min_length=1, max_length=100, description="Panel name")
    description: str = Field(..., min_length=1, max_length=1000, description="Panel description")
    category: str = Field(..., min_length=1, max_length=50, description="Panel category")
    icon: str = Field(default="📦", max_length=10, description="Panel icon (emoji or identifier)")
    accent_color: str = Field(default="#8B5CF6", max_length=20, description="Accent color (hex)")
    nxml_source: str = Field(..., min_length=1, description="NXML source code")
    tags: Optional[List[str]] = Field(default=[], description="Panel tags for search")


class UpdatePanelRequest(BaseModel):
    """Request schema for updating an existing panel."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, min_length=1, max_length=1000)
    category: Optional[str] = Field(None, min_length=1, max_length=50)
    icon: Optional[str] = Field(None, max_length=10)
    accent_color: Optional[str] = Field(None, max_length=20)
    nxml_source: Optional[str] = Field(None, min_length=1)
    tags: Optional[List[str]] = None
    visibility: Optional[str] = Field(None, pattern="^(draft|published|unlisted|deprecated)$")


class MarketplacePanelResponse(BaseModel):
    """Response schema for marketplace panel details."""
    id: str
    name: str
    description: str
    category: str
    icon: str
    accent_color: str
    nxml_source: str
    nxml_hash: str
    author_id: str
    author: PanelAuthor
    visibility: str
    type: str
    tags: str
    version: str
    install_count: int
    download_count: int
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MarketplacePanelListResponse(BaseModel):
    """Response schema for panel list (without NXML source for performance)."""
    id: str
    name: str
    description: str
    category: str
    icon: str
    accent_color: str
    nxml_hash: str
    author_id: str
    author: PanelAuthor
    visibility: str
    type: str
    tags: str
    version: str
    install_count: int
    download_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PanelInstallationResponse(BaseModel):
    """Response schema for panel installation."""
    id: str
    user_id: str
    panel_id: str
    panel: MarketplacePanelListResponse
    installed_at: datetime
    version: str
    is_active: bool

    class Config:
        from_attributes = True


class CategoryResponse(BaseModel):
    """Response schema for category information."""
    name: str = Field(..., description="Display name of category")
    slug: str = Field(..., description="URL-friendly slug")
    count: int = Field(..., description="Number of panels in category")


class PanelListResponse(BaseModel):
    """Response schema for paginated panel list."""
    panels: List[MarketplacePanelListResponse]
    count: int
    limit: int
    offset: int


class CategoryListResponse(BaseModel):
    """Response schema for category list."""
    categories: List[CategoryResponse]


class InstallationListResponse(BaseModel):
    """Response schema for user's installations."""
    installations: List[PanelInstallationResponse]


class PublishedPanelsResponse(BaseModel):
    """Response schema for user's published panels."""
    panels: List[MarketplacePanelResponse]


class ActionResponse(BaseModel):
    """Generic response for actions (install, uninstall, publish, etc.)."""
    message: str
    panel: Optional[MarketplacePanelResponse] = None
    installation: Optional[PanelInstallationResponse] = None
