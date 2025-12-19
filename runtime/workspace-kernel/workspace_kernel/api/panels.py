"""
Panel API endpoints.
"""

import sys
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Dict, Any

from ..database import get_db
from ..models import User
from ..auth import get_current_active_user
from ..services import PanelService

# TriLog imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent))
from trilog_setup import get_logger
from trilog_schemas import Panel, PanelLifecycle
from trilog.context import anchor

router = APIRouter()
panel_service = PanelService()
trilog_logger = get_logger("workspace_kernel.panels")


class CreatePanelRequest(BaseModel):
    workspace_id: str
    name: str
    nxml_source: str
    panel_type: str = "custom"


class PanelResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    panel_type: str
    state: str
    nxml_hash: str
    created_at: str

    class Config:
        from_attributes = True


class ExecuteHandlerRequest(BaseModel):
    handler_name: str
    args: Dict[str, Any] = {}
    current_state: Dict[str, Any] = {}


@router.post("/", response_model=PanelResponse, status_code=status.HTTP_201_CREATED)
async def create_panel(
    request: CreatePanelRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new panel."""
    try:
        panel = await panel_service.create_panel(
            db=db,
            workspace_id=request.workspace_id,
            user_id=current_user.id,
            name=request.name,
            nxml_source=request.nxml_source,
            panel_type=request.panel_type,
        )

        # TriLog: Track panel creation
        with anchor(panel.id, Panel):
            trilog_logger.event("panel_created",
                panel_name=request.name,
                panel_type=request.panel_type,
                workspace_id=request.workspace_id,
                user_id=current_user.id
            )
            trilog_logger.state_change(
                panel_name=request.name,
                workspace_id=request.workspace_id,
                panel_type=request.panel_type,
                state="draft",
                is_running=False,
                nxml_hash=panel.nxml_hash,
                nxml_size_bytes=len(request.nxml_source)
            )

        return PanelResponse(
            id=panel.id,
            workspace_id=panel.workspace_id,
            name=panel.name,
            panel_type=panel.panel_type,
            state=panel.state,
            nxml_hash=panel.nxml_hash,
            created_at=panel.created_at.isoformat(),
        )
    except ValueError as e:
        trilog_logger.error("panel_creation_failed", error=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{panel_id}", response_model=PanelResponse)
async def get_panel(
    panel_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get panel by ID."""
    panel = await panel_service.get_panel(db, panel_id, current_user.id)

    if not panel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Panel not found")

    return PanelResponse(
        id=panel.id,
        workspace_id=panel.workspace_id,
        name=panel.name,
        panel_type=panel.panel_type,
        state=panel.state,
        nxml_hash=panel.nxml_hash,
        created_at=panel.created_at.isoformat(),
    )


@router.get("/{panel_id}/ast")
async def get_panel_ast(
    panel_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get panel AST as JSON (for React frontend)."""
    try:
        ast_json = await panel_service.get_panel_ast(db, panel_id, current_user.id)
        return ast_json
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/{panel_id}/execute")
async def execute_handler(
    panel_id: str,
    request: ExecuteHandlerRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Execute a panel handler."""
    try:
        # TriLog: Track handler execution
        with anchor(panel_id, Panel):
            trilog_logger.event("handler_execution_started",
                handler_name=request.handler_name,
                panel_id=panel_id,
                user_id=current_user.id
            )

            result = await panel_service.execute_handler(
                db=db,
                panel_id=panel_id,
                user_id=current_user.id,
                handler_name=request.handler_name,
                args=request.args,
                current_state=request.current_state,
            )

            trilog_logger.event("handler_execution_completed",
                handler_name=request.handler_name,
                panel_id=panel_id
            )
            trilog_logger.state_change(
                handler_execution_count=1  # increment would happen in service
            )

            return result
    except ValueError as e:
        with anchor(panel_id, Panel):
            trilog_logger.error("handler_execution_failed",
                handler_name=request.handler_name,
                error=str(e)
            )
            trilog_logger.state_change(error_count=1)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{panel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_panel(
    panel_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete a panel."""
    deleted = await panel_service.delete_panel(db, panel_id, current_user.id)

    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Panel not found")

    # TriLog: Track panel deletion
    with anchor(panel_id, Panel):
        trilog_logger.event("panel_deleted",
            panel_id=panel_id,
            user_id=current_user.id
        )
        trilog_logger.state_change(
            state="archived"
        )
