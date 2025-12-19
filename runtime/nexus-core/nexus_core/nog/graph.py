"""
NOG Graph Engine - NetworkX-based semantic graph.
"""

import networkx as nx
from typing import Dict, List, Optional, Set, Any
from datetime import datetime
from nexus_protocol.nog import (
    NOGEntity,
    NOGRelationship,
    EntityType,
    RelationType,
    NOGPatch,
    PatchOperation,
)


class NOGGraph:
    """
    Semantic graph using NetworkX for efficient queries.

    The NOG captures the meaning and relationships of entities in a workspace,
    enabling AI context building and dependency tracking.
    """

    def __init__(self, workspace_id: str, workspace_name: str):
        self.workspace_id = workspace_id
        self.workspace_name = workspace_name

        # Directed graph for relationships
        self.graph = nx.DiGraph()

        # Fast lookup caches
        self._entities: Dict[str, NOGEntity] = {}
        self._relationships: Dict[str, NOGRelationship] = {}

        # Indexes for fast queries
        self._entities_by_type: Dict[EntityType, Set[str]] = {}
        self._entities_by_panel: Dict[str, Set[str]] = {}

        # Version tracking
        self.version = 1

    # =========================================================================
    # Entity Operations
    # =========================================================================

    def add_entity(self, entity: NOGEntity) -> None:
        """
        Add entity to graph.

        Args:
            entity: NOG entity to add
        """
        self._entities[entity.id] = entity
        self.graph.add_node(entity.id, data=entity)

        # Update indexes
        if entity.entity_type not in self._entities_by_type:
            self._entities_by_type[entity.entity_type] = set()
        self._entities_by_type[entity.entity_type].add(entity.id)

        if entity.source_panel_id:
            if entity.source_panel_id not in self._entities_by_panel:
                self._entities_by_panel[entity.source_panel_id] = set()
            self._entities_by_panel[entity.source_panel_id].add(entity.id)

        self.version += 1

    def get_entity(self, entity_id: str) -> Optional[NOGEntity]:
        """
        Get entity by ID.

        Args:
            entity_id: Entity ID

        Returns:
            Entity or None if not found
        """
        return self._entities.get(entity_id)

    def update_entity(self, entity_id: str, updates: Dict[str, Any]) -> NOGEntity:
        """
        Update entity properties.

        Args:
            entity_id: Entity ID
            updates: Properties to update

        Returns:
            Updated entity

        Raises:
            ValueError: If entity not found
        """
        entity = self._entities.get(entity_id)
        if not entity:
            raise ValueError(f"Entity not found: {entity_id}")

        # Apply updates
        for key, value in updates.items():
            if hasattr(entity, key):
                setattr(entity, key, value)

        entity.version += 1
        entity.updated_at = datetime.utcnow()

        self.version += 1
        return entity

    def remove_entity(self, entity_id: str) -> None:
        """
        Remove entity and all its relationships.

        Args:
            entity_id: Entity ID
        """
        if entity_id not in self._entities:
            return

        entity = self._entities[entity_id]

        # Remove from graph
        if self.graph.has_node(entity_id):
            self.graph.remove_node(entity_id)

        # Remove from indexes
        if entity.entity_type in self._entities_by_type:
            self._entities_by_type[entity.entity_type].discard(entity_id)

        if entity.source_panel_id and entity.source_panel_id in self._entities_by_panel:
            self._entities_by_panel[entity.source_panel_id].discard(entity_id)

        # Remove from entities
        del self._entities[entity_id]

        # Cleanup relationships
        to_remove = [
            rel_id
            for rel_id, rel in self._relationships.items()
            if rel.source_id == entity_id or rel.target_id == entity_id
        ]
        for rel_id in to_remove:
            del self._relationships[rel_id]

        self.version += 1

    # =========================================================================
    # Relationship Operations
    # =========================================================================

    def add_relationship(self, relationship: NOGRelationship) -> None:
        """
        Add relationship between entities.

        Args:
            relationship: NOG relationship

        Raises:
            ValueError: If source or target entity not found
        """
        if relationship.source_id not in self._entities:
            raise ValueError(f"Source entity not found: {relationship.source_id}")
        if relationship.target_id not in self._entities:
            raise ValueError(f"Target entity not found: {relationship.target_id}")

        self._relationships[relationship.id] = relationship
        self.graph.add_edge(
            relationship.source_id,
            relationship.target_id,
            key=relationship.id,
            data=relationship,
        )

        # Add reverse edge if bidirectional
        if relationship.bidirectional:
            self.graph.add_edge(
                relationship.target_id,
                relationship.source_id,
                key=f"{relationship.id}_reverse",
                data=relationship,
            )

        self.version += 1

    def get_relationships(
        self,
        source_id: Optional[str] = None,
        target_id: Optional[str] = None,
        relation_type: Optional[RelationType] = None,
    ) -> List[NOGRelationship]:
        """
        Query relationships with filters.

        Args:
            source_id: Filter by source entity
            target_id: Filter by target entity
            relation_type: Filter by relationship type

        Returns:
            List of matching relationships
        """
        results = []

        for rel in self._relationships.values():
            if source_id and rel.source_id != source_id:
                continue
            if target_id and rel.target_id != target_id:
                continue
            if relation_type and rel.relation_type != relation_type:
                continue
            results.append(rel)

        return results

    def remove_relationship(self, relationship_id: str) -> None:
        """
        Remove relationship.

        Args:
            relationship_id: Relationship ID
        """
        if relationship_id not in self._relationships:
            return

        rel = self._relationships[relationship_id]

        # Remove from graph
        if self.graph.has_edge(rel.source_id, rel.target_id):
            self.graph.remove_edge(rel.source_id, rel.target_id)

        if rel.bidirectional and self.graph.has_edge(rel.target_id, rel.source_id):
            self.graph.remove_edge(rel.target_id, rel.source_id)

        del self._relationships[relationship_id]
        self.version += 1

    # =========================================================================
    # Graph Queries
    # =========================================================================

    def get_subgraph(
        self,
        entity_id: str,
        depth: int = 2,
        relation_types: Optional[List[RelationType]] = None,
    ) -> "NOGGraph":
        """
        Extract subgraph centered on entity.

        Uses BFS traversal to extract entities within depth limit.

        Args:
            entity_id: Center entity ID
            depth: Maximum traversal depth
            relation_types: Filter by relationship types

        Returns:
            Subgraph containing entity and neighbors

        Raises:
            ValueError: If entity not found
        """
        if entity_id not in self._entities:
            raise ValueError(f"Entity not found: {entity_id}")

        # BFS traversal
        visited = {entity_id}
        queue = [(entity_id, 0)]

        while queue:
            current_id, current_depth = queue.pop(0)

            if current_depth >= depth:
                continue

            # Get neighbors
            for neighbor in self.graph.neighbors(current_id):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, current_depth + 1))

            # Also check predecessors (incoming edges)
            for predecessor in self.graph.predecessors(current_id):
                if predecessor not in visited:
                    visited.add(predecessor)
                    queue.append((predecessor, current_depth + 1))

        # Build subgraph
        subgraph = NOGGraph(
            workspace_id=self.workspace_id,
            workspace_name=f"{self.workspace_name} (subgraph)",
        )

        for ent_id in visited:
            subgraph.add_entity(self._entities[ent_id])

        for rel_id, rel in self._relationships.items():
            if rel.source_id in visited and rel.target_id in visited:
                if relation_types is None or rel.relation_type in relation_types:
                    subgraph.add_relationship(rel)

        return subgraph

    def find_path(self, source_id: str, target_id: str) -> Optional[List[str]]:
        """
        Find shortest path between entities.

        Args:
            source_id: Source entity ID
            target_id: Target entity ID

        Returns:
            List of entity IDs forming path, or None if no path exists
        """
        try:
            return nx.shortest_path(self.graph, source_id, target_id)
        except nx.NetworkXNoPath:
            return None
        except nx.NodeNotFound:
            return None

    def get_dependencies(self, entity_id: str) -> List[NOGEntity]:
        """
        Get all entities this entity depends on.

        Args:
            entity_id: Entity ID

        Returns:
            List of dependency entities
        """
        dep_ids = [
            rel.target_id
            for rel in self.get_relationships(
                source_id=entity_id, relation_type=RelationType.DEPENDS_ON
            )
        ]
        return [self._entities[eid] for eid in dep_ids if eid in self._entities]

    def get_dependents(self, entity_id: str) -> List[NOGEntity]:
        """
        Get all entities that depend on this entity.

        Args:
            entity_id: Entity ID

        Returns:
            List of dependent entities
        """
        dep_ids = [
            rel.source_id
            for rel in self.get_relationships(
                target_id=entity_id, relation_type=RelationType.DEPENDS_ON
            )
        ]
        return [self._entities[eid] for eid in dep_ids if eid in self._entities]

    def get_entities_by_type(self, entity_type: EntityType) -> List[NOGEntity]:
        """
        Get all entities of a specific type.

        Args:
            entity_type: Entity type

        Returns:
            List of entities
        """
        entity_ids = self._entities_by_type.get(entity_type, set())
        return [self._entities[eid] for eid in entity_ids]

    def get_entities_by_panel(self, panel_id: str) -> List[NOGEntity]:
        """
        Get all entities from a specific panel.

        Args:
            panel_id: Panel ID

        Returns:
            List of entities
        """
        entity_ids = self._entities_by_panel.get(panel_id, set())
        return [self._entities[eid] for eid in entity_ids]

    # =========================================================================
    # Patch Operations
    # =========================================================================

    def apply_patch(self, patch: NOGPatch) -> None:
        """
        Apply a NOG patch to the graph.

        Args:
            patch: NOG patch to apply

        Raises:
            ValueError: If patch is invalid
        """
        if patch.operation == PatchOperation.ENTITY_CREATE:
            if not patch.data.get("entity"):
                raise ValueError("Entity create patch must have 'entity' data")
            entity = NOGEntity(**patch.data["entity"])
            self.add_entity(entity)

        elif patch.operation == PatchOperation.ENTITY_UPDATE:
            if not patch.entity_id:
                raise ValueError("Entity update patch must have entity_id")
            self.update_entity(patch.entity_id, patch.data)

        elif patch.operation == PatchOperation.ENTITY_DELETE:
            if not patch.entity_id:
                raise ValueError("Entity delete patch must have entity_id")
            self.remove_entity(patch.entity_id)

        elif patch.operation == PatchOperation.RELATIONSHIP_CREATE:
            if not patch.data.get("relationship"):
                raise ValueError("Relationship create patch must have 'relationship' data")
            relationship = NOGRelationship(**patch.data["relationship"])
            self.add_relationship(relationship)

        elif patch.operation == PatchOperation.RELATIONSHIP_DELETE:
            if not patch.relationship_id:
                raise ValueError("Relationship delete patch must have relationship_id")
            self.remove_relationship(patch.relationship_id)

    # =========================================================================
    # Statistics
    # =========================================================================

    def get_stats(self) -> Dict[str, Any]:
        """
        Get graph statistics.

        Returns:
            Dictionary of statistics
        """
        return {
            "workspace_id": self.workspace_id,
            "workspace_name": self.workspace_name,
            "version": self.version,
            "entity_count": len(self._entities),
            "relationship_count": len(self._relationships),
            "entities_by_type": {
                entity_type.value: len(entity_ids)
                for entity_type, entity_ids in self._entities_by_type.items()
            },
            "graph_density": nx.density(self.graph) if len(self._entities) > 0 else 0,
            "connected_components": (
                nx.number_weakly_connected_components(self.graph)
                if len(self._entities) > 0
                else 0
            ),
        }
