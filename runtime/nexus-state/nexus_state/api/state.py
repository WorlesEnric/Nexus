"""
State API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from ..database import get_db
from ..models.schemas import (
    UpdateStateRequest,
    StateResponse,
    StateUpdateResponse,
    StateHistoryResponse
)
from ..core.state_manager import StateManager
from ..services.redis_service import redis_service

router = APIRouter()


def get_user_id_from_token(authorization: Optional[str] = Header(None)) -> str:
    """Extract user ID from JWT token (simplified)"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    # TODO: Implement proper JWT validation
    # For now, return a dummy user_id
    return "user_123"


@router.get("/{workspace_id}/{panel_id}", response_model=StateResponse)
async def get_state(
    workspace_id: str,
    panel_id: str,
    version: Optional[int] = None,
    include_history: bool = False,
    user_id: str = Depends(get_user_id_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Get panel state"""
    manager = StateManager(db)

    state = await manager.get_state(workspace_id, panel_id, user_id, version)

    if not state:
        raise HTTPException(status_code=404, detail="Panel state not found")

    history = None
    if include_history:
        history = await manager.get_history(workspace_id, panel_id, user_id, limit=50)

    return StateResponse(
        panel_id=panel_id,
        workspace_id=workspace_id,
        state=state,
        version=state.get("_meta", {}).get("version", 1),
        updated_at=state.get("_meta", {}).get("updated_at", ""),
        history=history
    )


@router.put("/{workspace_id}/{panel_id}", response_model=StateUpdateResponse)
async def update_state(
    workspace_id: str,
    panel_id: str,
    request: UpdateStateRequest,
    user_id: str = Depends(get_user_id_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Update panel state (full replace)"""
    manager = StateManager(db)

    try:
        result = await manager.update_state(
            workspace_id,
            panel_id,
            user_id,
            request.state,
            request.version,
            request.triggered_by,
            request.trigger_source
        )

        return StateUpdateResponse(**result)
    except ValueError as e:
        if "not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        elif "conflict" in str(e).lower():
            raise HTTPException(status_code=409, detail=str(e))
        else:
            raise HTTPException(status_code=400, detail=str(e))


@router.post("/{workspace_id}/{panel_id}", status_code=status.HTTP_201_CREATED)
async def create_state(
    workspace_id: str,
    panel_id: str,
    initial_state: dict,
    user_id: str = Depends(get_user_id_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Create initial panel state"""
    manager = StateManager(db)

    result = await manager.create_state(
        workspace_id,
        panel_id,
        user_id,
        initial_state
    )

    return result


@router.delete("/{workspace_id}/{panel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_state(
    workspace_id: str,
    panel_id: str,
    user_id: str = Depends(get_user_id_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Delete panel state"""
    manager = StateManager(db)
    await manager.delete_state(workspace_id, panel_id, user_id)


@router.get("/{workspace_id}/{panel_id}/history", response_model=StateHistoryResponse)
async def get_state_history(
    workspace_id: str,
    panel_id: str,
    limit: int = 50,
    offset: int = 0,
    user_id: str = Depends(get_user_id_from_token),
    db: AsyncSession = Depends(get_db)
):
    """Get state change history"""
    manager = StateManager(db)

    history = await manager.get_history(workspace_id, panel_id, user_id, limit, offset)

    return StateHistoryResponse(
        panel_id=panel_id,
        total_changes=len(history),
        history=history
    )


@router.get("/health")
async def health():
    """Health check for state service"""
    redis_ok = await redis_service.health_check()
    return {
        "status": "healthy" if redis_ok else "degraded",
        "cache": "connected" if redis_ok else "disconnected"
    }
