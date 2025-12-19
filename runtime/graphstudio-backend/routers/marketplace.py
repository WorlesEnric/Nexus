from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import database
from routers.auth import get_current_user
import models

router = APIRouter(
    prefix="/marketplace",
    tags=["marketplace"]
)

@router.get("/panels")
def get_panels(
    category: str = Query(None),
    search: str = Query(None),
    type: str = Query(None),
    sort: str = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get available marketplace panels.

    Note: This is a placeholder endpoint. Full marketplace functionality
    will be implemented in a future version.
    """
    # Return empty list for now - marketplace feature to be implemented
    return {
        "panels": [],
        "count": 0,
        "message": "Marketplace feature coming soon! You can create panels directly in the workspace."
    }

@router.get("/categories")
def get_categories(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get available panel categories"""
    return {
        "categories": [
            {"name": "Data Visualization", "slug": "data-viz", "count": 0},
            {"name": "Analytics", "slug": "analytics", "count": 0},
            {"name": "Utilities", "slug": "utilities", "count": 0},
        ]
    }

@router.get("/my-panels")
def get_my_panels(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get user's installed panels"""
    return {
        "installations": []
    }

@router.get("/my-published")
def get_my_published_panels(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get user's published panels"""
    return {
        "panels": []
    }

@router.post("/panels/{panel_id}/install")
def install_panel(
    panel_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Install a panel"""
    raise HTTPException(status_code=404, detail="Panel not found")

@router.post("/panels/{panel_id}/uninstall")
def uninstall_panel(
    panel_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Uninstall a panel"""
    raise HTTPException(status_code=404, detail="Panel not found")

@router.get("/panels/{panel_id}")
def get_panel(
    panel_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get panel details"""
    raise HTTPException(status_code=404, detail="Panel not found")
