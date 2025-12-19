"""
NOG Query Engine - Advanced graph queries.
"""

from typing import List, Optional, Dict, Any
from nexus_protocol.nog import (
    NOGQuery,
    NOGQueryResult,
    NOGEntity,
    NOGRelationship,
    EntityType,
    RelationType,
)
from .graph import NOGGraph
import time


class NOGQueryEngine:
    """
    Advanced query engine for NOG graphs.

    Provides high-level query operations beyond basic graph operations.
    """

    def __init__(self, graph: NOGGraph):
        self.graph = graph

    def execute(self, query: NOGQuery) -> NOGQueryResult:
        """
        Execute a NOG query.

        Args:
            query: NOG query

        Returns:
            Query result with entities, relationships, and metadata
        """
        start_time = time.time()

        try:
            if query.query_type == "get_entity":
                result = self._query_get_entity(query)
            elif query.query_type == "get_subgraph":
                result = self._query_get_subgraph(query)
            elif query.query_type == "find_path":
                result = self._query_find_path(query)
            elif query.query_type == "search":
                result = self._query_search(query)
            else:
                return NOGQueryResult(
                    success=False,
                    query_type=query.query_type,
                    error=f"Unknown query type: {query.query_type}",
                )

            execution_time_ms = (time.time() - start_time) * 1000

            return NOGQueryResult(
                success=True,
                query_type=query.query_type,
                entities=result.get("entities", []),
                relationships=result.get("relationships", []),
                path=result.get("path"),
                result_count=len(result.get("entities", [])),
                execution_time_ms=execution_time_ms,
            )

        except Exception as e:
            execution_time_ms = (time.time() - start_time) * 1000
            return NOGQueryResult(
                success=False,
                query_type=query.query_type,
                error=str(e),
                execution_time_ms=execution_time_ms,
            )

    def _query_get_entity(self, query: NOGQuery) -> Dict[str, Any]:
        """Get single entity."""
        if not query.entity_id:
            raise ValueError("entity_id required for get_entity query")

        entity = self.graph.get_entity(query.entity_id)
        if not entity:
            return {"entities": [], "relationships": []}

        # Get relationships
        relationships = []
        if query.include_properties:
            relationships = self.graph.get_relationships(source_id=query.entity_id)
            relationships.extend(
                self.graph.get_relationships(target_id=query.entity_id)
            )

        return {"entities": [entity], "relationships": relationships}

    def _query_get_subgraph(self, query: NOGQuery) -> Dict[str, Any]:
        """Get subgraph around entity."""
        if not query.entity_id:
            raise ValueError("entity_id required for get_subgraph query")

        subgraph = self.graph.get_subgraph(
            entity_id=query.entity_id,
            depth=query.depth,
            relation_types=query.relation_types,
        )

        return {
            "entities": list(subgraph._entities.values()),
            "relationships": list(subgraph._relationships.values()),
        }

    def _query_find_path(self, query: NOGQuery) -> Dict[str, Any]:
        """Find path between entities."""
        if not query.source_id or not query.target_id:
            raise ValueError("source_id and target_id required for find_path query")

        path = self.graph.find_path(query.source_id, query.target_id)

        if not path:
            return {"entities": [], "relationships": [], "path": None}

        # Get entities along path
        entities = [
            self.graph.get_entity(entity_id)
            for entity_id in path
            if self.graph.get_entity(entity_id)
        ]

        # Get relationships between consecutive entities in path
        relationships = []
        for i in range(len(path) - 1):
            rels = self.graph.get_relationships(
                source_id=path[i], target_id=path[i + 1]
            )
            relationships.extend(rels)

        return {"entities": entities, "relationships": relationships, "path": path}

    def _query_search(self, query: NOGQuery) -> Dict[str, Any]:
        """Search entities by term."""
        if not query.search_term:
            raise ValueError("search_term required for search query")

        search_term = query.search_term.lower()
        entities = []

        # Search in all entities
        for entity in self.graph._entities.values():
            # Filter by type if specified
            if query.entity_types and entity.entity_type not in query.entity_types:
                continue

            # Filter by tags if specified
            if query.tags and not any(tag in entity.tags for tag in query.tags):
                continue

            # Search in name and description
            if (
                search_term in entity.name.lower()
                or (entity.description and search_term in entity.description.lower())
                or any(search_term in tag.lower() for tag in entity.tags)
            ):
                entities.append(entity)

                if len(entities) >= query.limit:
                    break

        return {"entities": entities, "relationships": []}
