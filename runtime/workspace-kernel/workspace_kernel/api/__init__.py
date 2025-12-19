"""
REST API endpoints.
"""

from .auth import router as auth_router
from .panels import router as panels_router
from .workspaces import router as workspaces_router
from .nog import router as nog_router

__all__ = ["auth_router", "panels_router", "workspaces_router", "nog_router"]
