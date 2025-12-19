"""
Core state management logic
"""

from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
import hashlib
import json

from ..models.panel_state import PanelState, StateHistory
from ..services.redis_service import redis_service


class StateManager:
    """Core state management logic"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.redis = redis_service

    async def get_state(
        self,
        workspace_id: str,
        panel_id: str,
        user_id: str,
        version: Optional[int] = None
    ) -> Optional[Dict[str, Any]]:
        """Get panel state (cache-first)"""

        # Try cache first (only for latest version)
        if version is None:
            cached = await self.redis.get_state(workspace_id, panel_id)
            if cached:
                return cached

        # Fallback to database
        query = select(PanelState).where(
            PanelState.workspace_id == workspace_id,
            PanelState.panel_id == panel_id,
            PanelState.user_id == user_id
        )
        result = await self.db.execute(query)
        panel_state = result.scalar_one_or_none()

        if not panel_state:
            return None

        # If specific version requested, get from history
        if version and version != panel_state.version:
            return await self._get_state_at_version(panel_state, version)

        # Update last accessed time
        panel_state.last_accessed_at = datetime.utcnow()
        await self.db.commit()

        # Prepare state data
        state_data = {
            "$state": panel_state.state_data.get("$state", {}),
            "$computed": panel_state.state_data.get("$computed", {}),
            "_meta": {
                "version": panel_state.version,
                "updated_at": panel_state.updated_at.isoformat()
            }
        }

        # Update cache
        await self.redis.set_state(workspace_id, panel_id, state_data)

        return state_data

    async def create_state(
        self,
        workspace_id: str,
        panel_id: str,
        user_id: str,
        initial_state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create initial panel state"""

        # Calculate checksum
        state_json = json.dumps(initial_state, sort_keys=True)
        checksum = hashlib.sha256(state_json.encode()).hexdigest()

        # Create panel state
        panel_state = PanelState(
            user_id=user_id,
            workspace_id=workspace_id,
            panel_id=panel_id,
            state_data=initial_state,
            version=1,
            checksum=checksum,
            state_size_bytes=len(state_json),
            state_variable_count=len(initial_state.get("$state", {}))
        )

        self.db.add(panel_state)

        # Record history
        history = StateHistory(
            panel_state_id=panel_state.id,
            user_id=user_id,
            workspace_id=workspace_id,
            panel_id=panel_id,
            change_type="created",
            new_version=1,
            triggered_by="system",
            snapshot=initial_state
        )
        self.db.add(history)

        await self.db.commit()
        await self.db.refresh(panel_state)

        # Update cache
        await self.redis.set_state(workspace_id, panel_id, {
            "$state": initial_state.get("$state", {}),
            "$computed": initial_state.get("$computed", {}),
            "_meta": {
                "version": panel_state.version,
                "updated_at": panel_state.updated_at.isoformat()
            }
        })

        return {
            "success": True,
            "version": panel_state.version,
            "updated_at": panel_state.updated_at
        }

    async def update_state(
        self,
        workspace_id: str,
        panel_id: str,
        user_id: str,
        new_state: Dict[str, Any],
        version: int,
        triggered_by: str,
        trigger_source: Optional[str] = None
    ) -> Dict[str, Any]:
        """Update panel state with optimistic locking"""

        # Get current state
        query = select(PanelState).where(
            PanelState.workspace_id == workspace_id,
            PanelState.panel_id == panel_id,
            PanelState.user_id == user_id
        )
        result = await self.db.execute(query)
        panel_state = result.scalar_one_or_none()

        if not panel_state:
            raise ValueError(f"Panel state not found: {panel_id}")

        # Check version (optimistic lock)
        if panel_state.version != version:
            raise ValueError(
                f"Version conflict: expected {version}, got {panel_state.version}"
            )

        # Calculate checksum
        state_json = json.dumps(new_state, sort_keys=True)
        checksum = hashlib.sha256(state_json.encode()).hexdigest()

        # Update database
        panel_state.state_data = new_state
        panel_state.version += 1
        panel_state.checksum = checksum
        panel_state.state_size_bytes = len(state_json)
        panel_state.updated_at = datetime.utcnow()

        # Record history
        history = StateHistory(
            panel_state_id=panel_state.id,
            user_id=user_id,
            workspace_id=workspace_id,
            panel_id=panel_id,
            change_type="updated",
            previous_version=version,
            new_version=panel_state.version,
            triggered_by=triggered_by,
            trigger_source=trigger_source
        )
        self.db.add(history)

        await self.db.commit()

        # Update cache
        await self.redis.set_state(workspace_id, panel_id, {
            "$state": new_state.get("$state", {}),
            "$computed": new_state.get("$computed", {}),
            "_meta": {
                "version": panel_state.version,
                "updated_at": panel_state.updated_at.isoformat()
            }
        })

        # Publish update to subscribers
        await self.redis.publish_update(
            workspace_id,
            panel_id,
            [],  # Empty patch for full update
            panel_state.version
        )

        return {
            "success": True,
            "version": panel_state.version,
            "updated_at": panel_state.updated_at
        }

    async def delete_state(
        self,
        workspace_id: str,
        panel_id: str,
        user_id: str
    ):
        """Delete panel state"""

        query = select(PanelState).where(
            PanelState.workspace_id == workspace_id,
            PanelState.panel_id == panel_id,
            PanelState.user_id == user_id
        )
        result = await self.db.execute(query)
        panel_state = result.scalar_one_or_none()

        if panel_state:
            # Record deletion in history
            history = StateHistory(
                panel_state_id=panel_state.id,
                user_id=user_id,
                workspace_id=workspace_id,
                panel_id=panel_id,
                change_type="deleted",
                previous_version=panel_state.version,
                triggered_by="user"
            )
            self.db.add(history)

            # Delete from database
            await self.db.delete(panel_state)
            await self.db.commit()

            # Invalidate cache
            await self.redis.invalidate_state(workspace_id, panel_id)

    async def _get_state_at_version(
        self,
        panel_state: PanelState,
        target_version: int
    ) -> Optional[Dict[str, Any]]:
        """Get state at a specific version from history"""
        # TODO: Implement state reconstruction from history
        # For now, return None if not current version
        return None

    async def get_history(
        self,
        workspace_id: str,
        panel_id: str,
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get state change history"""

        # First get panel_state_id
        query = select(PanelState).where(
            PanelState.workspace_id == workspace_id,
            PanelState.panel_id == panel_id,
            PanelState.user_id == user_id
        )
        result = await self.db.execute(query)
        panel_state = result.scalar_one_or_none()

        if not panel_state:
            return []

        # Get history
        history_query = select(StateHistory).where(
            StateHistory.panel_state_id == panel_state.id
        ).order_by(StateHistory.occurred_at.desc()).limit(limit).offset(offset)

        result = await self.db.execute(history_query)
        history_entries = result.scalars().all()

        return [
            {
                "id": entry.id,
                "change_type": entry.change_type,
                "patch": entry.patch,
                "version": entry.new_version,
                "triggered_by": entry.triggered_by,
                "trigger_source": entry.trigger_source,
                "occurred_at": entry.occurred_at.isoformat()
            }
            for entry in history_entries
        ]
