"""
Marketplace router for panel browsing, publishing, and installation.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, desc
from typing import Optional
import uuid
import hashlib
from datetime import datetime

import database
import models
import schemas
from routers.auth import get_current_user
from nxml_validator import NXMLValidator

router = APIRouter(
    prefix="/marketplace",
    tags=["marketplace"]
)

validator = NXMLValidator()

# ============================================================================
# PANEL BROWSING
# ============================================================================

@router.get("/panels", response_model=schemas.PanelListResponse)
def get_panels(
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search in name, description, tags"),
    type: Optional[str] = Query(None, description="Filter by type (nexus, free, paid)"),
    sort: Optional[str] = Query("recent", description="Sort by: recent, popular, name"),
    limit: int = Query(50, le=100, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get marketplace panels with filtering and pagination.

    Returns published panels that match the specified filters.
    """

    # Build query - only show published panels
    query = db.query(models.MarketplacePanel).filter(
        models.MarketplacePanel.visibility == "published"
    )

    # Apply filters
    if category:
        query = query.filter(models.MarketplacePanel.category == category)

    if type:
        query = query.filter(models.MarketplacePanel.type == type)

    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                models.MarketplacePanel.name.ilike(search_pattern),
                models.MarketplacePanel.description.ilike(search_pattern),
                models.MarketplacePanel.tags.ilike(search_pattern)
            )
        )

    # Apply sorting
    if sort == "popular":
        query = query.order_by(desc(models.MarketplacePanel.install_count))
    elif sort == "name":
        query = query.order_by(models.MarketplacePanel.name)
    else:  # recent
        query = query.order_by(desc(models.MarketplacePanel.created_at))

    # Get total count before pagination
    total_count = query.count()

    # Apply pagination
    panels = query.offset(offset).limit(limit).all()

    return {
        "panels": panels,
        "count": total_count,
        "limit": limit,
        "offset": offset
    }


@router.get("/panels/{panel_id}", response_model=schemas.MarketplacePanelResponse)
def get_panel(
    panel_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get detailed panel information including NXML source.

    Only returns published panels unless the requesting user is the author.
    """
    panel = db.query(models.MarketplacePanel).filter(
        models.MarketplacePanel.id == panel_id
    ).first()

    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")

    # Check visibility - only author can see non-published panels
    if panel.visibility != "published" and panel.author_id != current_user.id:
        raise HTTPException(status_code=404, detail="Panel not found")

    return panel


@router.get("/categories", response_model=schemas.CategoryListResponse)
def get_categories(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get available categories with panel counts.

    Returns dynamically calculated categories based on published panels.
    """

    # Query to count panels per category
    category_counts = db.query(
        models.MarketplacePanel.category,
        func.count(models.MarketplacePanel.id).label('count')
    ).filter(
        models.MarketplacePanel.visibility == "published"
    ).group_by(
        models.MarketplacePanel.category
    ).all()

    # Format response
    categories = []
    for cat_name, count in category_counts:
        categories.append({
            "name": cat_name.title(),
            "slug": cat_name,
            "count": count
        })

    # Sort by name
    categories.sort(key=lambda x: x['name'])

    return {"categories": categories}


# ============================================================================
# PANEL PUBLISHING
# ============================================================================

@router.post("/panels", status_code=status.HTTP_201_CREATED, response_model=schemas.ActionResponse)
def publish_panel(
    panel_data: schemas.PublishPanelRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Publish a new panel to the marketplace.

    Validates NXML before creating the panel. Sets panel type to "nexus" for
    official nexus-team publisher, "free" for all other users.
    """

    # Validate NXML
    is_valid, error = validator.validate(panel_data.nxml_source)
    if not is_valid:
        raise HTTPException(status_code=400, detail=f"Invalid NXML: {error}")

    # Generate ID and hash
    panel_id = str(uuid.uuid4())
    nxml_hash = hashlib.sha256(panel_data.nxml_source.encode()).hexdigest()

    # Determine panel type based on author
    panel_type = "nexus" if current_user.username == "nexus-team" else "free"

    # Create panel
    panel = models.MarketplacePanel(
        id=panel_id,
        author_id=current_user.id,
        name=panel_data.name,
        description=panel_data.description,
        category=panel_data.category,
        icon=panel_data.icon,
        accent_color=panel_data.accent_color,
        nxml_source=panel_data.nxml_source,
        nxml_hash=nxml_hash,
        tags=",".join(panel_data.tags) if panel_data.tags else "",
        type=panel_type,
        visibility="published",
        published_at=datetime.utcnow()
    )

    db.add(panel)
    db.commit()
    db.refresh(panel)

    return {
        "message": "Panel published successfully",
        "panel": panel
    }


@router.patch("/panels/{panel_id}", response_model=schemas.ActionResponse)
def update_panel(
    panel_id: str,
    panel_data: schemas.UpdatePanelRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Update an existing panel.

    Only the panel author can update their panels.
    """

    # Get panel
    panel = db.query(models.MarketplacePanel).filter(
        models.MarketplacePanel.id == panel_id
    ).first()

    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")

    # Check ownership
    if panel.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the author can update this panel")

    # Update fields
    if panel_data.name is not None:
        panel.name = panel_data.name
    if panel_data.description is not None:
        panel.description = panel_data.description
    if panel_data.category is not None:
        panel.category = panel_data.category
    if panel_data.icon is not None:
        panel.icon = panel_data.icon
    if panel_data.accent_color is not None:
        panel.accent_color = panel_data.accent_color
    if panel_data.visibility is not None:
        panel.visibility = panel_data.visibility
    if panel_data.tags is not None:
        panel.tags = ",".join(panel_data.tags)

    # Update NXML if provided
    if panel_data.nxml_source is not None:
        # Validate new NXML
        is_valid, error = validator.validate(panel_data.nxml_source)
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid NXML: {error}")

        panel.nxml_source = panel_data.nxml_source
        panel.nxml_hash = hashlib.sha256(panel_data.nxml_source.encode()).hexdigest()

    panel.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(panel)

    return {
        "message": "Panel updated successfully",
        "panel": panel
    }


@router.delete("/panels/{panel_id}")
def delete_panel(
    panel_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Delete a panel from the marketplace.

    Only the panel author can delete their panels.
    """

    panel = db.query(models.MarketplacePanel).filter(
        models.MarketplacePanel.id == panel_id
    ).first()

    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")

    # Check ownership
    if panel.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the author can delete this panel")

    db.delete(panel)
    db.commit()

    return {"message": "Panel deleted successfully"}


@router.get("/my-published", response_model=schemas.PublishedPanelsResponse)
def get_my_published_panels(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get current user's published panels.

    Returns all panels authored by the current user, regardless of visibility.
    """

    panels = db.query(models.MarketplacePanel).filter(
        models.MarketplacePanel.author_id == current_user.id
    ).order_by(desc(models.MarketplacePanel.created_at)).all()

    return {"panels": panels}


# ============================================================================
# PANEL INSTALLATION
# ============================================================================

@router.post("/panels/{panel_id}/install", response_model=schemas.ActionResponse)
def install_panel(
    panel_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Install a panel for the current user.

    Creates an installation record and increments the panel's install metrics.
    Prevents duplicate installations and reactivates soft-deleted installations.
    """

    # Get panel
    panel = db.query(models.MarketplacePanel).filter(
        models.MarketplacePanel.id == panel_id,
        models.MarketplacePanel.visibility == "published"
    ).first()

    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")

    # Check if already installed
    existing = db.query(models.PanelInstallation).filter(
        models.PanelInstallation.user_id == current_user.id,
        models.PanelInstallation.panel_id == panel_id
    ).first()

    if existing:
        if existing.is_active:
            return {
                "message": "Panel already installed",
                "installation": existing
            }
        else:
            # Reactivate soft-deleted installation
            existing.is_active = True
            db.commit()
            db.refresh(existing)
            return {
                "message": "Panel reactivated",
                "installation": existing
            }

    # Create new installation
    installation = models.PanelInstallation(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        panel_id=panel_id,
        version=panel.version,
        is_active=True
    )

    db.add(installation)

    # Update panel metrics
    panel.install_count += 1
    panel.download_count += 1

    db.commit()
    db.refresh(installation)

    return {
        "message": "Panel installed successfully",
        "installation": installation
    }


@router.post("/panels/{panel_id}/uninstall")
def uninstall_panel(
    panel_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Uninstall a panel (soft delete).

    Sets the installation's is_active flag to False instead of deleting the record.
    """

    installation = db.query(models.PanelInstallation).filter(
        models.PanelInstallation.user_id == current_user.id,
        models.PanelInstallation.panel_id == panel_id
    ).first()

    if not installation:
        raise HTTPException(status_code=404, detail="Panel not installed")

    # Soft delete
    installation.is_active = False
    db.commit()

    return {"message": "Panel uninstalled successfully"}


@router.get("/my-panels", response_model=schemas.InstallationListResponse)
def get_my_panels(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get user's installed panels.

    Returns only active installations (is_active=True).
    """

    installations = db.query(models.PanelInstallation).filter(
        models.PanelInstallation.user_id == current_user.id,
        models.PanelInstallation.is_active == True
    ).all()

    return {"installations": installations}


@router.get("/panels/{panel_id}/nxml")
def get_panel_nxml(
    panel_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get NXML source for an installed panel.

    Only returns NXML if the user has installed this panel.
    This allows the frontend to create a runtime panel instance in the workspace.
    """

    # Check if user has installed this panel
    installation = db.query(models.PanelInstallation).filter(
        models.PanelInstallation.user_id == current_user.id,
        models.PanelInstallation.panel_id == panel_id,
        models.PanelInstallation.is_active == True
    ).first()

    if not installation:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Panel not installed or access denied"
        )

    # Get panel
    panel = db.query(models.MarketplacePanel).filter(
        models.MarketplacePanel.id == panel_id
    ).first()

    if not panel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Panel not found"
        )

    return {
        "panel_id": panel.id,
        "name": panel.name,
        "nxml_source": panel.nxml_source,
        "nxml_hash": panel.nxml_hash,
        "version": panel.version
    }
