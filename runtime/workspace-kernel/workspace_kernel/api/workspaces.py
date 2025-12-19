"""
Workspace API endpoints.
"""

import sys
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import uuid

from ..database import get_db
from ..models import User, Workspace
from ..auth import get_current_active_user
from ..services import GitService

# TriLog imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent))
from trilog_setup import get_logger
from trilog_schemas import Workspace as WorkspaceSchema, WorkspaceCreation
from trilog.context import anchor

router = APIRouter()
git_service = GitService()
trilog_logger = get_logger("workspace_kernel.workspaces")


class CreateWorkspaceRequest(BaseModel):
    name: str
    description: str = ""
    is_public: bool = False


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    description: str
    status: str
    is_public: bool
    panel_count: int
    created_at: str

    class Config:
        from_attributes = True


@router.post("/", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    request: CreateWorkspaceRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new workspace."""

    workspace_id = str(uuid.uuid4())

    # Initialize Git repository
    git_service.init_workspace_repo(workspace_id)

    # Create workspace
    workspace = Workspace(
        id=workspace_id,
        name=request.name,
        description=request.description,
        owner_id=current_user.id,
        is_public=request.is_public,
        git_repo_path=str(git_service.get_workspace_path(workspace_id)),
    )

    db.add(workspace)
    await db.commit()
    await db.refresh(workspace)

    # TriLog: Track workspace creation
    with anchor(workspace_id, WorkspaceSchema):
        trilog_logger.event("workspace_created",
            workspace_name=request.name,
            owner_id=current_user.id,
            is_public=request.is_public
        )
        trilog_logger.state_change(
            workspace_name=request.name,
            owner_id=current_user.id,
            status="active",
            is_active=True,
            panel_count=0,
            git_branch="main",
            git_repo_path=str(git_service.get_workspace_path(workspace_id))
        )

    return WorkspaceResponse(
        id=workspace.id,
        name=workspace.name,
        description=workspace.description or "",
        status=workspace.status,
        is_public=workspace.is_public,
        panel_count=workspace.panel_count,
        created_at=workspace.created_at.isoformat(),
    )


@router.get("/", response_model=list[WorkspaceResponse])
async def list_workspaces(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List user's workspaces."""

    result = await db.execute(
        select(Workspace).where(Workspace.owner_id == current_user.id)
    )
    workspaces = result.scalars().all()

    return [
        WorkspaceResponse(
            id=ws.id,
            name=ws.name,
            description=ws.description or "",
            status=ws.status,
            is_public=ws.is_public,
            panel_count=ws.panel_count,
            created_at=ws.created_at.isoformat(),
        )
        for ws in workspaces
    ]


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get workspace by ID."""

    result = await db.execute(
        select(Workspace).where(
            Workspace.id == workspace_id, Workspace.owner_id == current_user.id
        )
    )
    workspace = result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    return WorkspaceResponse(
        id=workspace.id,
        name=workspace.name,
        description=workspace.description or "",
        status=workspace.status,
        is_public=workspace.is_public,
        panel_count=workspace.panel_count,
        created_at=workspace.created_at.isoformat(),
    )


@router.post("/{workspace_id}/activate")
async def activate_workspace(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Activate workspace (load panels into runtime)."""

    # Verify access
    result = await db.execute(
        select(Workspace).where(
            Workspace.id == workspace_id, Workspace.owner_id == current_user.id
        )
    )
    workspace = result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    # Update workspace status to active
    workspace.status = "active"
    await db.commit()

    # TriLog: Track workspace activation
    with anchor(workspace_id, WorkspaceSchema):
        trilog_logger.event("workspace_activated",
            workspace_name=workspace.name,
            user_id=current_user.id
        )

    return {
        "status": "active",
        "message": "Workspace activated successfully",
        "workspace_id": workspace_id
    }


@router.get("/{workspace_id}/commits")
async def get_workspace_commits(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get workspace commit history."""

    # Verify access
    result = await db.execute(
        select(Workspace).where(
            Workspace.id == workspace_id, Workspace.owner_id == current_user.id
        )
    )
    workspace = result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    commits = git_service.get_commit_history(workspace_id)
    return {"commits": commits}
