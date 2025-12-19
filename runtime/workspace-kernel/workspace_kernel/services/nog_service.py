"""
NOG service - Graph operations.
"""

import sys
import time
from pathlib import Path
from typing import Dict, Optional
from nexus_core.nog import NOGGraph, NOGSerializer
from nexus_protocol.nog import NOGEntity, NOGRelationship, NOGQuery, EntityType, RelationType

# TriLog imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent))
from trilog_setup import get_logger
from trilog_schemas import NOGQuery as NOGQuerySchema, NOGEntity as NOGEntitySchema
from trilog.context import anchor

trilog_logger = get_logger("workspace_kernel.nog_service")


class NOGService:
    """Service for managing NOG graphs."""

    def __init__(self):
        # In-memory cache of workspace graphs
        # In production, this would be backed by Redis or similar
        self._graphs: Dict[str, NOGGraph] = {}

    def get_graph(self, workspace_id: str, workspace_name: str = "Workspace") -> NOGGraph:
        """
        Get or create NOG graph for workspace.

        Args:
            workspace_id: Workspace ID
            workspace_name: Workspace name

        Returns:
            NOG graph
        """
        if workspace_id not in self._graphs:
            self._graphs[workspace_id] = NOGGraph(workspace_id, workspace_name)
        return self._graphs[workspace_id]

    def add_entity(
        self, workspace_id: str, entity: NOGEntity
    ) -> None:
        """Add entity to workspace graph."""
        graph = self.get_graph(workspace_id)
        graph.add_entity(entity)

        # TriLog: Track NOG entity addition
        entity_id = f"nog_entity_{entity.id}_{int(time.time() * 1000)}"
        with anchor(entity_id, NOGEntitySchema):
            trilog_logger.event("nog_entity_added",
                workspace_id=workspace_id,
                entity_type=str(entity.entity_type),
                entity_name=entity.name
            )
            trilog_logger.state_change(
                workspace_id=workspace_id,
                entity_type=str(entity.entity_type),
                name=entity.name,
                version=1
            )

    def add_relationship(
        self, workspace_id: str, relationship: NOGRelationship
    ) -> None:
        """Add relationship to workspace graph."""
        graph = self.get_graph(workspace_id)
        graph.add_relationship(relationship)

    def query_graph(self, workspace_id: str, query: NOGQuery) -> Dict:
        """
        Query workspace graph.

        Args:
            workspace_id: Workspace ID
            query: NOG query

        Returns:
            Query result
        """
        from nexus_core.nog import NOGQueryEngine

        start_time = time.time()
        graph = self.get_graph(workspace_id)
        engine = NOGQueryEngine(graph)
        result = engine.execute(query)
        duration_ms = int((time.time() - start_time) * 1000)

        # TriLog: Track NOG query
        query_id = f"nog_query_{workspace_id}_{int(time.time() * 1000000)}"
        with anchor(query_id, NOGQuerySchema):
            trilog_logger.event("nog_query_executed",
                workspace_id=workspace_id,
                query_type=str(query.query_type) if hasattr(query, 'query_type') else "unknown"
            )
            trilog_logger.state_change(
                workspace_id=workspace_id,
                query_type=str(query.query_type) if hasattr(query, 'query_type') else "unknown",
                graph_size=len(graph.entities) if hasattr(graph, 'entities') else 0,
                result_count=len(result.get('entities', [])) if isinstance(result, dict) else 0,
                query_duration_ms=duration_ms
            )

        return result.to_dict()

    def serialize_graph(self, workspace_id: str) -> Dict:
        """
        Serialize workspace graph to JSON.

        Args:
            workspace_id: Workspace ID

        Returns:
            JSON representation
        """
        if workspace_id not in self._graphs:
            return {"entities": [], "relationships": []}

        graph = self._graphs[workspace_id]
        return NOGSerializer.serialize(graph)

    def save_graph_to_file(self, workspace_id: str, file_path: str) -> None:
        """
        Save graph to file.

        Args:
            workspace_id: Workspace ID
            file_path: Output file path
        """
        if workspace_id in self._graphs:
            graph = self._graphs[workspace_id]
            NOGSerializer.to_file(graph, file_path)

    def load_graph_from_file(self, workspace_id: str, file_path: str) -> None:
        """
        Load graph from file.

        Args:
            workspace_id: Workspace ID
            file_path: Input file path
        """
        graph = NOGSerializer.from_file(file_path)
        self._graphs[workspace_id] = graph

    def clear_workspace_state(self, workspace_id: str) -> bool:
        """
        Clear NOG state for a workspace (multi-tenant safe).

        This removes the in-memory graph for the workspace.
        Used when deactivating a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            True if cleared, False if workspace not found
        """
        if workspace_id in self._graphs:
            del self._graphs[workspace_id]
            trilog_logger.event("nog_state_cleared",
                workspace_id=workspace_id
            )
            return True
        return False
