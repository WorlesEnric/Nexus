"""
AI Context Builder - Converts NOG graphs to LLM context.

Extracts relevant subgraphs from the NOG and converts them to natural language
prompts for LLM consumption.
"""

from typing import List, Dict, Any, Optional

from nexus_core.nog import NOGGraph, NOGEntity, NOGRelationship, EntityType


class AIContextBuilder:
    """
    Builds AI context from NOG graphs for LLM prompts.

    Converts NOG entities and relationships into structured natural language
    that can be used as context for code generation and analysis.
    """

    def __init__(
        self,
        max_context_tokens: int = 8000,
    ):
        """
        Initialize context builder.

        Args:
            max_context_tokens: Maximum tokens for context
        """
        self.max_context_tokens = max_context_tokens
    
    def build_context(
        self,
        graph: NOGGraph,
        focus_entity_id: Optional[str] = None,
        depth: int = 2,
    ) -> List[Dict[str, Any]]:
        """
        Build context documents from NOG graph.

        Args:
            graph: NOG graph
            focus_entity_id: Entity to focus on (extracts subgraph)
            depth: Depth of subgraph extraction

        Returns:
            List of context documents (dicts with 'content' and 'metadata')
        """
        # Extract subgraph if focus entity is provided
        if focus_entity_id:
            graph = graph.get_subgraph(focus_entity_id, depth=depth)

        documents = []

        # Build documents for each entity
        for entity_id, entity in graph._entities.items():
            doc_content = self._entity_to_text(entity)

            # Add relationships
            relationships = graph.get_relationships(entity_id)
            if relationships:
                rel_text = self._relationships_to_text(relationships)
                doc_content += f"\n\nRelationships:\n{rel_text}"

            documents.append({
                "content": doc_content,
                "metadata": {
                    "entity_id": entity_id,
                    "entity_type": entity.entity_type.value,
                    "entity_name": entity.name,
                },
            })

        # Add graph-level context
        graph_context = self._graph_to_text(graph)
        documents.insert(
            0,
            {
                "content": graph_context,
                "metadata": {
                    "type": "graph_overview",
                    "workspace_id": graph.workspace_id,
                },
            },
        )

        return documents
    
    def _entity_to_text(self, entity: NOGEntity) -> str:
        """Convert NOG entity to natural language."""
        lines = [
            f"# {entity.name}",
            f"Type: {entity.entity_type.value}",
            f"ID: {entity.id}",
        ]
        
        if entity.description:
            lines.append(f"\nDescription: {entity.description}")
        
        if entity.properties:
            lines.append("\nProperties:")
            for key, value in entity.properties.items():
                lines.append(f"  - {key}: {value}")
        
        return "\n".join(lines)
    
    def _relationships_to_text(self, relationships: List[NOGRelationship]) -> str:
        """Convert relationships to natural language."""
        lines = []
        
        for rel in relationships:
            lines.append(
                f"  - {rel.relationship_type.value}: "
                f"from {rel.source_id} to {rel.target_id}"
            )
            
            if rel.properties:
                for key, value in rel.properties.items():
                    lines.append(f"      {key}: {value}")
        
        return "\n".join(lines)
    
    def _graph_to_text(self, graph: NOGGraph) -> str:
        """Convert graph overview to natural language."""
        entity_counts = {}
        for entity in graph._entities.values():
            entity_type = entity.entity_type.value
            entity_counts[entity_type] = entity_counts.get(entity_type, 0) + 1
        
        lines = [
            f"# Workspace: {graph.workspace_name}",
            f"Workspace ID: {graph.workspace_id}",
            "",
            "## Entity Summary",
        ]
        
        for entity_type, count in entity_counts.items():
            lines.append(f"  - {entity_type}: {count}")
        
        lines.append(f"\nTotal Relationships: {len(graph._relationships)}")
        
        return "\n".join(lines)
    
    def build_prompt(
        self,
        graph: NOGGraph,
        user_request: str,
        focus_entity_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Build complete LLM prompt with context.
        
        Args:
            graph: NOG graph
            user_request: User's request
            focus_entity_id: Entity to focus on
            system_prompt: Optional system prompt
            
        Returns:
            Dict with system, context, and user messages
        """
        # Build context documents
        documents = self.build_context(graph, focus_entity_id)

        # Combine document content
        context_text = "\n\n---\n\n".join([doc["content"] for doc in documents])
        
        # Build system prompt
        if system_prompt is None:
            system_prompt = (
                "You are an AI assistant helping with code generation and analysis "
                "for a Nexus workspace. You have access to the workspace's semantic graph "
                "(NOG - Nexus Object Graph) which shows entities and their relationships."
            )
        
        return {
            "system": system_prompt,
            "context": context_text,
            "user": user_request,
            "metadata": {
                "workspace_id": graph.workspace_id,
                "focus_entity_id": focus_entity_id,
                "entity_count": len(graph._entities),
                "relationship_count": len(graph._relationships),
            },
        }
    
    def build_function_context(
        self,
        graph: NOGGraph,
        function_id: str,
    ) -> str:
        """
        Build context specifically for a function entity.
        
        Args:
            graph: NOG graph
            function_id: Function entity ID
            
        Returns:
            Natural language context
        """
        entity = graph.get_entity(function_id)
        if not entity:
            raise ValueError(f"Function entity not found: {function_id}")
        
        if entity.entity_type != EntityType.FUNCTION:
            raise ValueError(f"Entity is not a function: {entity.entity_type}")
        
        # Get function signature
        context_lines = [
            f"# Function: {entity.name}",
            "",
        ]
        
        if entity.description:
            context_lines.append(f"Description: {entity.description}")
            context_lines.append("")
        
        # Get dependencies (what this function calls)
        dependencies = graph.get_outgoing_relationships(function_id, "calls")
        if dependencies:
            context_lines.append("Calls:")
            for rel in dependencies:
                target = graph.get_entity(rel.target_id)
                if target:
                    context_lines.append(f"  - {target.name} ({target.entity_type.value})")
            context_lines.append("")
        
        # Get dependents (what calls this function)
        dependents = graph.get_incoming_relationships(function_id, "calls")
        if dependents:
            context_lines.append("Called by:")
            for rel in dependents:
                source = graph.get_entity(rel.source_id)
                if source:
                    context_lines.append(f"  - {source.name} ({source.entity_type.value})")
            context_lines.append("")
        
        # Get related variables
        variable_rels = graph.get_outgoing_relationships(function_id, "uses")
        if variable_rels:
            context_lines.append("Uses variables:")
            for rel in variable_rels:
                target = graph.get_entity(rel.target_id)
                if target and target.entity_type == EntityType.VARIABLE:
                    context_lines.append(f"  - {target.name}")
            context_lines.append("")
        
        return "\n".join(context_lines)
