"""
NOG (Nexus Object Graph) API endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from nexus_protocol.nog import NOGQuery

from ..database import get_db
from ..models import User, Workspace
from ..auth import get_current_active_user
from ..services import NOGService

router = APIRouter()
nog_service = NOGService()


class NOGQueryRequest(BaseModel):
    query: NOGQuery


@router.get("/{workspace_id}/graph")
async def get_nog_graph(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get NOG graph for workspace."""

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

    # Get graph
    graph_data = nog_service.serialize_graph(workspace_id)

    return graph_data


@router.post("/{workspace_id}/query")
async def query_nog_graph(
    workspace_id: str,
    request: NOGQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Query NOG graph."""

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

    # Execute query
    result = nog_service.query_graph(workspace_id, request.query)

    return result
