"""
Panel service - Panel lifecycle management.
"""

from typing import Optional, Dict, Any, Set
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import hashlib
import uuid
import asyncio
import logging

from nexus_core.parser import parse_nxml
from nexus_core.sandbox import SandboxExecutor, ExecutionContext
from nexus_protocol.ast import NexusPanelAST

from ..models import Panel, Workspace
from .nog_service import NOGService

# Track active panel execution tasks for cleanup
# Key: (workspace_id, panel_id)
# Value: Set of asyncio.Task handles
_active_panel_tasks: Dict[tuple, Set[asyncio.Task]] = {}
_tasks_lock = asyncio.Lock()

logger = logging.getLogger(__name__)


class PanelService:
    """Service for managing panels."""

    def __init__(self):
        self.executor = SandboxExecutor()
        self.nog_service = NOGService()

    async def create_panel(
        self,
        db: AsyncSession,
        workspace_id: str,
        user_id: str,
        name: str,
        nxml_source: str,
        panel_type: str = "custom",
    ) -> Panel:
        """
        Create a new panel.

        Args:
            db: Database session
            workspace_id: Workspace ID
            user_id: User ID
            name: Panel name
            nxml_source: NXML source code
            panel_type: Panel type

        Returns:
            Created panel
        """
        # Verify workspace exists and user has access
        result = await db.execute(
            select(Workspace).where(
                Workspace.id == workspace_id, Workspace.owner_id == user_id
            )
        )
        workspace = result.scalar_one_or_none()
        if not workspace:
            raise ValueError("Workspace not found or access denied")

        # Parse NXML
        try:
            ast = parse_nxml(nxml_source)
        except Exception as e:
            raise ValueError(f"NXML parsing failed: {str(e)}")

        # Generate panel ID and hash
        panel_id = str(uuid.uuid4())
        nxml_hash = hashlib.sha256(nxml_source.encode()).hexdigest()

        # Create panel
        panel = Panel(
            id=panel_id,
            workspace_id=workspace_id,
            name=name,
            panel_type=panel_type,
            nxml_source=nxml_source,
            nxml_hash=nxml_hash,
            nxml_size_bytes=len(nxml_source),
            ast_node_count=len(ast.data.states)
            + len(ast.data.computed)
            + len(ast.logic.tools),
            state_variable_count=len(ast.data.states),
            computed_variable_count=len(ast.data.computed),
            tool_count=len(ast.logic.tools),
            state="active",
        )

        db.add(panel)

        # Update workspace panel count
        workspace.panel_count += 1

        await db.commit()
        await db.refresh(panel)

        # Add to NOG graph (in background)
        # TODO: Add panel entity to NOG

        return panel

    async def get_panel(
        self, db: AsyncSession, panel_id: str, user_id: str
    ) -> Optional[Panel]:
        """
        Get panel by ID.

        Args:
            db: Database session
            panel_id: Panel ID
            user_id: User ID

        Returns:
            Panel or None
        """
        result = await db.execute(
            select(Panel)
            .join(Workspace)
            .where(Panel.id == panel_id, Workspace.owner_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_panel_ast(self, db: AsyncSession, panel_id: str, user_id: str) -> Dict[str, Any]:
        """
        Get panel AST as JSON.

        Args:
            db: Database session
            panel_id: Panel ID
            user_id: User ID

        Returns:
            JSON AST
        """
        panel = await self.get_panel(db, panel_id, user_id)
        if not panel:
            raise ValueError("Panel not found")

        # Parse NXML (uses cache)
        ast = parse_nxml(panel.nxml_source)

        # Convert to JSON
        return ast.to_json_dict()

    async def execute_handler(
        self,
        db: AsyncSession,
        panel_id: str,
        user_id: str,
        handler_name: str,
        args: Dict[str, Any],
        current_state: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Execute a panel handler.

        Args:
            db: Database session
            panel_id: Panel ID
            user_id: User ID
            handler_name: Handler name
            args: Handler arguments
            current_state: Current panel state

        Returns:
            Execution result
        """
        # Get panel
        panel = await self.get_panel(db, panel_id, user_id)
        if not panel:
            raise ValueError("Panel not found")

        # Parse NXML
        ast = parse_nxml(panel.nxml_source)

        # Find handler
        handler_node = None
        capabilities = set()

        # Check tools
        for tool in ast.logic.tools:
            if tool.name == handler_name:
                handler_node = tool.handler
                capabilities = set(tool.handler.capabilities)
                break

        # Check lifecycles
        if not handler_node:
            for lifecycle in ast.logic.lifecycles:
                if lifecycle.event == handler_name:
                    handler_node = lifecycle.handler
                    capabilities = set(lifecycle.handler.capabilities)
                    break

        if not handler_node:
            raise ValueError(f"Handler not found: {handler_name}")

        # Create execution context
        context = ExecutionContext(
            panel_id=panel_id,
            workspace_id=panel.workspace_id,
            handler_name=handler_name,
            state=current_state,
            args=args,
            capabilities=capabilities,
        )

        # Create task for handler execution and track it
        async def execute_with_tracking():
            return await self.executor.execute(handler_node.code, context)

        task = asyncio.create_task(execute_with_tracking())

        # Register task for tracking
        key = (panel.workspace_id, panel_id)
        async with _tasks_lock:
            if key not in _active_panel_tasks:
                _active_panel_tasks[key] = set()
            _active_panel_tasks[key].add(task)

        try:
            # Execute and wait for result
            result = await task
        finally:
            # Unregister task
            async with _tasks_lock:
                if key in _active_panel_tasks:
                    _active_panel_tasks[key].discard(task)
                    if not _active_panel_tasks[key]:
                        del _active_panel_tasks[key]

        # Update metrics
        panel.handler_execution_count += 1
        panel.total_execution_time_ms += int(result.execution_time_ms)
        if not result.success:
            panel.error_count += 1

        await db.commit()

        return {
            "success": result.success,
            "return_value": result.return_value,
            "state_changes": result.state_changes,
            "error": result.error,
            "execution_time_ms": result.execution_time_ms,
        }

    async def delete_panel(self, db: AsyncSession, panel_id: str, user_id: str) -> bool:
        """
        Delete a panel.

        Args:
            db: Database session
            panel_id: Panel ID
            user_id: User ID

        Returns:
            True if deleted, False if not found
        """
        panel = await self.get_panel(db, panel_id, user_id)
        if not panel:
            return False

        # Update workspace panel count
        workspace = panel.workspace
        workspace.panel_count -= 1

        await db.delete(panel)
        await db.commit()

        return True

    @staticmethod
    async def stop_workspace_panels(workspace_id: str) -> int:
        """
        Stop all active panel executions for a workspace (multi-tenant safe).

        Args:
            workspace_id: Workspace ID

        Returns:
            Number of tasks stopped
        """
        stopped_count = 0

        async with _tasks_lock:
            # Find all tasks for this workspace
            keys_to_remove = []
            for key, tasks in list(_active_panel_tasks.items()):
                ws_id, panel_id = key
                if ws_id == workspace_id:
                    # Cancel all tasks for this panel
                    tasks_copy = list(tasks)
                    for task in tasks_copy:
                        if not task.done():
                            task.cancel()
                            stopped_count += 1
                    keys_to_remove.append(key)

        # Wait for cancellation with timeout (outside lock)
        for key in keys_to_remove:
            ws_id, panel_id = key
            if key in _active_panel_tasks:
                tasks_copy = list(_active_panel_tasks[key])
                if tasks_copy:
                    try:
                        await asyncio.wait(tasks_copy, timeout=2.0)
                    except Exception as e:
                        logger.error(f"Error waiting for task cancellation: {e}")

        # Clean up task registry
        async with _tasks_lock:
            for key in keys_to_remove:
                _active_panel_tasks.pop(key, None)

        logger.info(f"Stopped {stopped_count} panel tasks for workspace {workspace_id}")
        return stopped_count
