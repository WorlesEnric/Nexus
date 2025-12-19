"""
AI Patch Generator - Converts LLM responses to NOG patches.

Parses LLM output and generates NOG graph patches that can be applied
to update the workspace.
"""

import json
import re
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from nexus_protocol.nog import (
    NOGEntity,
    NOGRelationship,
    EntityType,
    RelationshipType,
)


class EntityPatch(BaseModel):
    """Patch for adding/updating an entity."""
    
    operation: str  # "add", "update", "remove"
    entity_id: Optional[str] = None
    entity_type: Optional[EntityType] = None
    name: Optional[str] = None
    description: Optional[str] = None
    properties: Optional[Dict[str, Any]] = None
    source_panel_id: Optional[str] = None


class RelationshipPatch(BaseModel):
    """Patch for adding/updating a relationship."""
    
    operation: str  # "add", "remove"
    relationship_id: Optional[str] = None
    relationship_type: Optional[RelationshipType] = None
    source_id: Optional[str] = None
    target_id: Optional[str] = None
    properties: Optional[Dict[str, Any]] = None


class NOGPatch(BaseModel):
    """Complete NOG graph patch."""
    
    entities: List[EntityPatch] = []
    relationships: List[RelationshipPatch] = []
    metadata: Dict[str, Any] = {}


class AIPatchGenerator:
    """
    Generates NOG patches from LLM responses.
    
    Parses structured LLM output and converts it to NOG graph patches
    that can be applied to the workspace.
    """
    
    def __init__(self):
        """Initialize patch generator."""
        pass
    
    def parse_llm_response(
        self,
        response: str,
        format_type: str = "json",
    ) -> NOGPatch:
        """
        Parse LLM response into NOG patch.
        
        Args:
            response: LLM response text
            format_type: Format of response ("json", "markdown", "xml")
            
        Returns:
            NOG patch
        """
        if format_type == "json":
            return self._parse_json_response(response)
        elif format_type == "markdown":
            return self._parse_markdown_response(response)
        elif format_type == "xml":
            return self._parse_xml_response(response)
        else:
            raise ValueError(f"Unsupported format type: {format_type}")
    
    def _parse_json_response(self, response: str) -> NOGPatch:
        """Parse JSON-formatted LLM response."""
        try:
            # Extract JSON from response (handle markdown code blocks)
            json_match = re.search(r"```json\s*\n(.*?)\n```", response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                # Try to find JSON object directly
                json_match = re.search(r"\{.*\}", response, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    json_str = response
            
            data = json.loads(json_str)
            return NOGPatch(**data)
        
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse JSON response: {e}")
    
    def _parse_markdown_response(self, response: str) -> NOGPatch:
        """Parse Markdown-formatted LLM response."""
        patch = NOGPatch()
        
        # Parse entity sections
        entity_pattern = r"### Entity: (.+?)\n(.+?)(?=###|$)"
        for match in re.finditer(entity_pattern, response, re.DOTALL):
            entity_name = match.group(1).strip()
            entity_content = match.group(2).strip()
            
            # Parse entity properties
            entity_patch = self._parse_entity_block(entity_name, entity_content)
            patch.entities.append(entity_patch)
        
        # Parse relationship sections
        rel_pattern = r"### Relationship: (.+?)\n(.+?)(?=###|$)"
        for match in re.finditer(rel_pattern, response, re.DOTALL):
            rel_name = match.group(1).strip()
            rel_content = match.group(2).strip()
            
            # Parse relationship properties
            rel_patch = self._parse_relationship_block(rel_name, rel_content)
            patch.relationships.append(rel_patch)
        
        return patch
    
    def _parse_entity_block(self, name: str, content: str) -> EntityPatch:
        """Parse entity block from markdown."""
        lines = content.split("\n")
        
        operation = "add"
        entity_type = None
        entity_id = None
        description = None
        properties = {}
        
        for line in lines:
            line = line.strip()
            
            if line.startswith("- Operation:"):
                operation = line.split(":", 1)[1].strip().lower()
            elif line.startswith("- Type:"):
                type_str = line.split(":", 1)[1].strip().lower()
                entity_type = EntityType(type_str)
            elif line.startswith("- ID:"):
                entity_id = line.split(":", 1)[1].strip()
            elif line.startswith("- Description:"):
                description = line.split(":", 1)[1].strip()
            elif line.startswith("- "):
                # Custom property
                key, value = line[2:].split(":", 1)
                properties[key.strip()] = value.strip()
        
        return EntityPatch(
            operation=operation,
            entity_id=entity_id,
            entity_type=entity_type,
            name=name,
            description=description,
            properties=properties if properties else None,
        )
    
    def _parse_relationship_block(self, name: str, content: str) -> RelationshipPatch:
        """Parse relationship block from markdown."""
        lines = content.split("\n")
        
        operation = "add"
        rel_type = None
        source_id = None
        target_id = None
        properties = {}
        
        for line in lines:
            line = line.strip()
            
            if line.startswith("- Operation:"):
                operation = line.split(":", 1)[1].strip().lower()
            elif line.startswith("- Type:"):
                type_str = line.split(":", 1)[1].strip().lower()
                rel_type = RelationshipType(type_str)
            elif line.startswith("- Source:"):
                source_id = line.split(":", 1)[1].strip()
            elif line.startswith("- Target:"):
                target_id = line.split(":", 1)[1].strip()
            elif line.startswith("- "):
                # Custom property
                key, value = line[2:].split(":", 1)
                properties[key.strip()] = value.strip()
        
        return RelationshipPatch(
            operation=operation,
            relationship_type=rel_type,
            source_id=source_id,
            target_id=target_id,
            properties=properties if properties else None,
        )
    
    def _parse_xml_response(self, response: str) -> NOGPatch:
        """Parse XML-formatted LLM response."""
        # TODO: Implement XML parsing
        raise NotImplementedError("XML parsing not yet implemented")
    
    def apply_patch(
        self,
        patch: NOGPatch,
        graph: Any,  # NOGGraph type (avoiding circular import)
    ) -> None:
        """
        Apply NOG patch to graph.
        
        Args:
            patch: NOG patch to apply
            graph: NOG graph to modify
        """
        # Apply entity patches
        for entity_patch in patch.entities:
            if entity_patch.operation == "add":
                if not entity_patch.entity_id:
                    import uuid
                    entity_patch.entity_id = str(uuid.uuid4())
                
                entity = NOGEntity(
                    id=entity_patch.entity_id,
                    entity_type=entity_patch.entity_type,
                    name=entity_patch.name,
                    description=entity_patch.description,
                    properties=entity_patch.properties or {},
                    source_panel_id=entity_patch.source_panel_id,
                )
                graph.add_entity(entity)
            
            elif entity_patch.operation == "update":
                if not entity_patch.entity_id:
                    raise ValueError("Entity ID required for update operation")
                
                entity = graph.get_entity(entity_patch.entity_id)
                if not entity:
                    raise ValueError(f"Entity not found: {entity_patch.entity_id}")
                
                # Update entity properties
                if entity_patch.name:
                    entity.name = entity_patch.name
                if entity_patch.description:
                    entity.description = entity_patch.description
                if entity_patch.properties:
                    entity.properties.update(entity_patch.properties)
                
                graph.update_entity(entity)
            
            elif entity_patch.operation == "remove":
                if not entity_patch.entity_id:
                    raise ValueError("Entity ID required for remove operation")
                
                graph.remove_entity(entity_patch.entity_id)
        
        # Apply relationship patches
        for rel_patch in patch.relationships:
            if rel_patch.operation == "add":
                if not rel_patch.relationship_id:
                    import uuid
                    rel_patch.relationship_id = str(uuid.uuid4())
                
                relationship = NOGRelationship(
                    id=rel_patch.relationship_id,
                    relationship_type=rel_patch.relationship_type,
                    source_id=rel_patch.source_id,
                    target_id=rel_patch.target_id,
                    properties=rel_patch.properties or {},
                )
                graph.add_relationship(relationship)
            
            elif rel_patch.operation == "remove":
                if not rel_patch.relationship_id:
                    raise ValueError("Relationship ID required for remove operation")
                
                graph.remove_relationship(rel_patch.relationship_id)
    
    def generate_patch_prompt(
        self,
        user_request: str,
        context: str,
    ) -> str:
        """
        Generate a prompt for LLM to produce patches.
        
        Args:
            user_request: User's request
            context: Context from NOG graph
            
        Returns:
            LLM prompt
        """
        return f"""Based on the following workspace context and user request, generate a NOG patch in JSON format.

Workspace Context:
{context}

User Request:
{user_request}

Generate a JSON patch with the following structure:
{{
  "entities": [
    {{
      "operation": "add" | "update" | "remove",
      "entity_id": "optional-id-for-update-or-remove",
      "entity_type": "function" | "variable" | "panel" | "component" | "handler" | "state",
      "name": "entity-name",
      "description": "entity-description",
      "properties": {{}},
      "source_panel_id": "optional-panel-id"
    }}
  ],
  "relationships": [
    {{
      "operation": "add" | "remove",
      "relationship_id": "optional-id-for-remove",
      "relationship_type": "calls" | "uses" | "contains" | "depends_on" | "triggers",
      "source_id": "source-entity-id",
      "target_id": "target-entity-id",
      "properties": {{}}
    }}
  ],
  "metadata": {{
    "summary": "brief-summary-of-changes"
  }}
}}

Respond with ONLY the JSON patch, wrapped in ```json``` code blocks."""
