"""
Panel service - Panel lifecycle management.
"""

from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import hashlib
import uuid

from nexus_core.parser import parse_nxml
from nexus_core.sandbox import SandboxExecutor, ExecutionContext
from nexus_protocol.ast import NexusPanelAST

from ..models import Panel, Workspace
from .nog_service import NOGService


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

        # Execute
        result = await self.executor.execute(handler_node.code, context)

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
