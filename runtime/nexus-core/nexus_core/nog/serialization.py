"""
NOG Serialization - Convert graph to/from JSON.
"""

import json
from typing import Dict, Any
from .graph import NOGGraph
from nexus_protocol.nog import NOGEntity, NOGRelationship


class NOGSerializer:
    """Serialize/deserialize NOG graph to/from JSON."""

    @staticmethod
    def serialize(graph: NOGGraph) -> Dict[str, Any]:
        """
        Serialize graph to JSON-compatible dict.

        Args:
            graph: NOG graph

        Returns:
            JSON-compatible dictionary
        """
        return {
            "workspace_id": graph.workspace_id,
            "workspace_name": graph.workspace_name,
            "version": graph.version,
            "entities": [entity.to_dict() for entity in graph._entities.values()],
            "relationships": [rel.to_dict() for rel in graph._relationships.values()],
            "stats": graph.get_stats(),
        }

    @staticmethod
    def deserialize(data: Dict[str, Any]) -> NOGGraph:
        """
        Deserialize graph from JSON-compatible dict.

        Args:
            data: JSON-compatible dictionary

        Returns:
            NOG graph
        """
        graph = NOGGraph(
            workspace_id=data["workspace_id"], workspace_name=data["workspace_name"]
        )

        graph.version = data.get("version", 1)

        # Add entities
        for entity_data in data.get("entities", []):
            entity = NOGEntity(**entity_data)
            graph.add_entity(entity)

        # Add relationships
        for rel_data in data.get("relationships", []):
            rel = NOGRelationship(**rel_data)
            try:
                graph.add_relationship(rel)
            except ValueError:
                # Skip relationships with missing entities
                pass

        return graph

    @staticmethod
    def to_json(graph: NOGGraph, indent: int = 2) -> str:
        """
        Serialize graph to JSON string.

        Args:
            graph: NOG graph
            indent: JSON indentation

        Returns:
            JSON string
        """
        return json.dumps(NOGSerializer.serialize(graph), indent=indent, default=str)

    @staticmethod
    def from_json(json_str: str) -> NOGGraph:
        """
        Deserialize graph from JSON string.

        Args:
            json_str: JSON string

        Returns:
            NOG graph
        """
        data = json.loads(json_str)
        return NOGSerializer.deserialize(data)

    @staticmethod
    def to_file(graph: NOGGraph, file_path: str) -> None:
        """
        Save graph to JSON file.

        Args:
            graph: NOG graph
            file_path: Output file path
        """
        with open(file_path, "w") as f:
            f.write(NOGSerializer.to_json(graph))

    @staticmethod
    def from_file(file_path: str) -> NOGGraph:
        """
        Load graph from JSON file.

        Args:
            file_path: Input file path

        Returns:
            NOG graph
        """
        with open(file_path, "r") as f:
            return NOGSerializer.from_json(f.read())
