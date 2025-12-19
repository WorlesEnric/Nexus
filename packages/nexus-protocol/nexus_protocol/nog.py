"""
NOG (Nexus Object Graph) type definitions using Pydantic.

The NOG is the semantic graph that represents the meaning and relationships
of entities in a Nexus workspace. It enables:
1. AI context building (what entities exist and how they relate)
2. Dependency tracking (what depends on what)
3. Cross-panel intelligence (understanding relationships between panels)
"""

from typing import Dict, List, Optional, Any, Literal
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
from datetime import datetime

from .utils import to_camel, CAMEL_CASE_CONFIG


# ============================================================================
# Entity Types
# ============================================================================

class EntityType(str, Enum):
    """Types of entities in the NOG."""
    FUNCTION = "function"          # A function or tool
    VARIABLE = "variable"          # A state variable
    CONCEPT = "concept"            # An abstract concept
    PANEL = "panel"                # A panel instance
    TOOL = "tool"                  # A user-invokable tool
    WORKFLOW = "workflow"          # A multi-step process
    DATA_SOURCE = "data_source"    # External data source
    USER = "user"                  # User entity
    WORKSPACE = "workspace"        # Workspace entity
    CUSTOM = "custom"              # Custom user-defined type


class RelationType(str, Enum):
    """Types of relationships between entities."""
    DEPENDS_ON = "depends_on"      # A depends on B
    USES = "uses"                  # A uses B
    PRODUCES = "produces"          # A produces B
    CONTAINS = "contains"          # A contains B
    REFERENCES = "references"      # A references B
    FLOWS_TO = "flows_to"         # Data flows from A to B
    TRIGGERS = "triggers"          # A triggers B
    CUSTOM = "custom"              # Custom user-defined relationship


# ============================================================================
# NOG Entities
# ============================================================================

class NOGEntity(BaseModel):
    """A node in the Nexus Object Graph."""

    model_config = ConfigDict(
        **CAMEL_CASE_CONFIG,
        json_encoders={datetime: lambda v: v.isoformat()}
    )

    id: str = Field(..., description="Unique entity ID")
    entity_type: EntityType = Field(..., description="Type of entity")
    name: str = Field(..., description="Human-readable name")
    description: Optional[str] = Field(None, description="Entity description")
    properties: Dict[str, Any] = Field(default_factory=dict, description="Entity properties")

    # Source tracking
    source_panel_id: Optional[str] = Field(None, description="Panel that created this entity")
    source_location: Optional[str] = Field(None, description="Source code location")

    # Metadata
    version: int = Field(default=1, description="Entity version number")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    tags: List[str] = Field(default_factory=list, description="Searchable tags")

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dict."""
        return self.model_dump(mode="json")


class NOGRelationship(BaseModel):
    """An edge in the Nexus Object Graph."""

    model_config = ConfigDict(
        **CAMEL_CASE_CONFIG,
        json_encoders={datetime: lambda v: v.isoformat()}
    )

    id: str = Field(..., description="Unique relationship ID")
    source_id: str = Field(..., description="Source entity ID")
    target_id: str = Field(..., description="Target entity ID")
    relation_type: RelationType = Field(..., description="Type of relationship")

    # Optional properties
    properties: Dict[str, Any] = Field(default_factory=dict, description="Relationship properties")
    weight: float = Field(default=1.0, description="Relationship weight/strength")
    bidirectional: bool = Field(default=False, description="Is bidirectional")

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = Field(None, description="Panel or user that created this")

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dict."""
        return self.model_dump(mode="json")


# ============================================================================
# NOG Patches (Updates to the graph)
# ============================================================================

class PatchOperation(str, Enum):
    """Types of patch operations."""
    ENTITY_CREATE = "entity_create"
    ENTITY_UPDATE = "entity_update"
    ENTITY_DELETE = "entity_delete"
    RELATIONSHIP_CREATE = "relationship_create"
    RELATIONSHIP_UPDATE = "relationship_update"
    RELATIONSHIP_DELETE = "relationship_delete"


class NOGPatch(BaseModel):
    """A patch operation to apply to the NOG."""

    model_config = ConfigDict(
        **CAMEL_CASE_CONFIG,
        json_encoders={datetime: lambda v: v.isoformat() if v else None}
    )

    operation: PatchOperation = Field(..., description="Type of operation")
    entity_id: Optional[str] = Field(None, description="Entity ID (for entity operations)")
    relationship_id: Optional[str] = Field(None, description="Relationship ID (for relationship operations)")
    data: Dict[str, Any] = Field(default_factory=dict, description="Operation data")

    # Metadata
    applied_at: Optional[datetime] = Field(None, description="When the patch was applied")
    applied_by: Optional[str] = Field(None, description="Who applied the patch (user/panel/AI)")
    source: str = Field(..., description="Source of the patch (user_edit, ai_suggestion, etc.)")


class PatchBatch(BaseModel):
    """A batch of patches to apply atomically."""

    model_config = ConfigDict(
        **CAMEL_CASE_CONFIG,
        json_encoders={datetime: lambda v: v.isoformat()}
    )

    patches: List[NOGPatch] = Field(..., description="List of patches")
    description: Optional[str] = Field(None, description="Batch description")
    atomic: bool = Field(default=True, description="Apply all or none")

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = Field(None, description="Creator")


# ============================================================================
# NOG Graph Snapshot
# ============================================================================

class NOGGraphSnapshot(BaseModel):
    """A complete snapshot of the NOG graph state."""

    model_config = ConfigDict(
        **CAMEL_CASE_CONFIG,
        json_encoders={datetime: lambda v: v.isoformat()}
    )

    workspace_id: str = Field(..., description="Workspace ID")
    workspace_name: str = Field(..., description="Workspace name")
    version: int = Field(..., description="Snapshot version")

    # Graph data
    entities: List[NOGEntity] = Field(default_factory=list)
    relationships: List[NOGRelationship] = Field(default_factory=list)

    # Statistics
    entity_count: int = Field(default=0)
    relationship_count: int = Field(default=0)
    entity_types: Dict[str, int] = Field(default_factory=dict, description="Count by type")

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    commit_hash: Optional[str] = Field(None, description="Git commit hash")

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dict."""
        return self.model_dump(mode="json")


# ============================================================================
# NOG Query
# ============================================================================

class NOGQuery(BaseModel):
    """A query against the NOG graph."""

    model_config = CAMEL_CASE_CONFIG

    # Query type
    query_type: Literal["get_entity", "get_subgraph", "find_path", "search"] = Field(
        ..., description="Type of query"
    )

    # Query parameters
    entity_id: Optional[str] = Field(None, description="Entity ID (for get_entity, get_subgraph)")
    source_id: Optional[str] = Field(None, description="Source entity (for find_path)")
    target_id: Optional[str] = Field(None, description="Target entity (for find_path)")
    search_term: Optional[str] = Field(None, description="Search term (for search)")

    # Filters
    entity_types: Optional[List[EntityType]] = Field(None, description="Filter by entity types")
    relation_types: Optional[List[RelationType]] = Field(None, description="Filter by relation types")
    tags: Optional[List[str]] = Field(None, description="Filter by tags")

    # Options
    depth: int = Field(default=2, description="Traversal depth (for get_subgraph)")
    limit: int = Field(default=100, description="Maximum results")
    include_properties: bool = Field(default=True, description="Include entity properties")


class NOGQueryResult(BaseModel):
    """Result of a NOG query."""

    model_config = CAMEL_CASE_CONFIG

    success: bool = Field(..., description="Query success")
    query_type: str = Field(..., description="Query type")

    # Results
    entities: List[NOGEntity] = Field(default_factory=list)
    relationships: List[NOGRelationship] = Field(default_factory=list)
    path: Optional[List[str]] = Field(None, description="Path (for find_path)")

    # Metadata
    result_count: int = Field(default=0)
    execution_time_ms: float = Field(default=0.0)
    error: Optional[str] = Field(None, description="Error message if failed")

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dict."""
        return self.model_dump(mode="json")


# ============================================================================
# Helper Functions
# ============================================================================

def create_entity(
    entity_id: str,
    entity_type: EntityType,
    name: str,
    **kwargs
) -> NOGEntity:
    """Helper to create a NOG entity."""
    return NOGEntity(
        id=entity_id,
        entity_type=entity_type,
        name=name,
        **kwargs
    )


def create_relationship(
    relationship_id: str,
    source_id: str,
    target_id: str,
    relation_type: RelationType,
    **kwargs
) -> NOGRelationship:
    """Helper to create a NOG relationship."""
    return NOGRelationship(
        id=relationship_id,
        source_id=source_id,
        target_id=target_id,
        relation_type=relation_type,
        **kwargs
    )


def create_patch(
    operation: PatchOperation,
    source: str,
    **kwargs
) -> NOGPatch:
    """Helper to create a NOG patch."""
    return NOGPatch(
        operation=operation,
        source=source,
        **kwargs
    )
