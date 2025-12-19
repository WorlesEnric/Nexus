"""
Snapshot API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from datetime import datetime

from ..database import get_db
from ..models.schemas import (
    CreateSnapshotRequest,
    SnapshotResponse
)
from ..models.panel_state import PanelState, StateSnapshot
from ..services.git_service import git_service

router = APIRouter()


def get_user_id_from_token(authorization: Optional[str] = Header(None)) -> str:
    """Extract user ID from JWT token (simplified)"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    # TODO: Implement proper JWT validation
    # For now, return a dummy user_id
    return "user_123"


@router.post("/{workspace_id}", response_model=SnapshotResponse)
async def create_snapshot(
    workspace_id: str,
    request: CreateSnapshotRequest,
    user_id: str = Depends(get_user_id_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Create workspace snapshot (all panels)"""

    # Get all panel states for this workspace
    query = select(PanelState).where(
        PanelState.workspace_id == workspace_id,
        PanelState.user_id == user_id
    )
    result = await db.execute(query)
    panel_states = result.scalars().all()

    if not panel_states:
        raise HTTPException(status_code=404, detail="No panel states found in workspace")

    # Prepare snapshot data
    snapshot_data = {}
    for panel in panel_states:
        snapshot_data[panel.panel_id] = {
            "$state": panel.state_data.get("$state", {}),
            "$computed": panel.state_data.get("$computed", {}),
            "version": panel.version,
            "updated_at": panel.updated_at.isoformat()
        }

    # Save to Git
    try:
        git_commit_hash = await git_service.save_snapshot(
            workspace_id,
            snapshot_data,
            request.description
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save Git snapshot: {str(e)}")

    # Create database record
    snapshot = StateSnapshot(
        user_id=user_id,
        workspace_id=workspace_id,
        snapshot_data=snapshot_data,
        description=request.description,
        git_commit_hash=git_commit_hash,
        panel_count=len(panel_states)
    )

    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)

    return SnapshotResponse(
        id=snapshot.id,
        workspace_id=workspace_id,
        description=snapshot.description,
        git_commit_hash=git_commit_hash,
        panel_count=snapshot.panel_count,
        created_at=snapshot.created_at.isoformat()
    )


@router.get("/{workspace_id}")
async def list_snapshots(
    workspace_id: str,
    limit: int = 50,
    user_id: str = Depends(get_user_id_from_token),
    db: AsyncSession = Depends(get_db)
):
    """List all snapshots for workspace"""

    query = select(StateSnapshot).where(
        StateSnapshot.workspace_id == workspace_id,
        StateSnapshot.user_id == user_id
    ).order_by(StateSnapshot.created_at.desc()).limit(limit)

    result = await db.execute(query)
    snapshots = result.scalars().all()

    return {
        "workspace_id": workspace_id,
        "total": len(snapshots),
        "snapshots": [
            {
                "id": s.id,
                "description": s.description,
                "git_commit_hash": s.git_commit_hash,
                "panel_count": s.panel_count,
                "created_at": s.created_at.isoformat()
            }
            for s in snapshots
        ]
    }


@router.get("/{workspace_id}/commits")
async def get_git_history(
    workspace_id: str,
    limit: int = 50,
    user_id: str = Depends(get_user_id_from_token)
):
    """Get Git commit history for workspace"""

    commits = await git_service.get_commit_history(workspace_id, limit)

    return {
        "workspace_id": workspace_id,
        "commits": commits
    }


@router.post("/{workspace_id}/restore")
async def restore_snapshot(
    workspace_id: str,
    snapshot_id: Optional[str] = None,
    git_commit_hash: Optional[str] = None,
    user_id: str = Depends(get_user_id_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Restore workspace from snapshot"""

    if not snapshot_id and not git_commit_hash:
        raise HTTPException(
            status_code=400,
            detail="Either snapshot_id or git_commit_hash must be provided"
        )

    # Load snapshot data
    if snapshot_id:
        query = select(StateSnapshot).where(
            StateSnapshot.id == snapshot_id,
            StateSnapshot.user_id == user_id
        )
        result = await db.execute(query)
        snapshot = result.scalar_one_or_none()

        if not snapshot:
            raise HTTPException(status_code=404, detail="Snapshot not found")

        snapshot_data = snapshot.snapshot_data
        commit_hash = snapshot.git_commit_hash
    else:
        # Load from Git directly
        try:
            snapshot_data = await git_service.load_snapshot(workspace_id, git_commit_hash)
            commit_hash = git_commit_hash
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to load snapshot from Git: {str(e)}"
            )

    if not snapshot_data:
        raise HTTPException(status_code=404, detail="Snapshot data not found")

    # Restore each panel state
    restored_panels = []
    for panel_id, panel_data in snapshot_data.items():
        # Get existing panel state
        query = select(PanelState).where(
            PanelState.workspace_id == workspace_id,
            PanelState.panel_id == panel_id,
            PanelState.user_id == user_id
        )
        result = await db.execute(query)
        panel_state = result.scalar_one_or_none()

        if panel_state:
            # Update existing state
            panel_state.state_data = {
                "$state": panel_data.get("$state", {}),
                "$computed": panel_data.get("$computed", {})
            }
            panel_state.version += 1
            panel_state.updated_at = datetime.utcnow()
            restored_panels.append(panel_id)
        else:
            # Skip panels that don't exist (they may have been deleted)
            continue

    await db.commit()

    return {
        "success": True,
        "workspace_id": workspace_id,
        "commit_hash": commit_hash,
        "restored_panels": restored_panels,
        "restored_count": len(restored_panels)
    }


@router.get("/{workspace_id}/{snapshot_id}")
async def get_snapshot(
    workspace_id: str,
    snapshot_id: str,
    user_id: str = Depends(get_user_id_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Get snapshot details"""

    query = select(StateSnapshot).where(
        StateSnapshot.id == snapshot_id,
        StateSnapshot.workspace_id == workspace_id,
        StateSnapshot.user_id == user_id
    )
    result = await db.execute(query)
    snapshot = result.scalar_one_or_none()

    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    return {
        "id": snapshot.id,
        "workspace_id": snapshot.workspace_id,
        "description": snapshot.description,
        "git_commit_hash": snapshot.git_commit_hash,
        "panel_count": snapshot.panel_count,
        "created_at": snapshot.created_at.isoformat(),
        "snapshot_data": snapshot.snapshot_data
    }
