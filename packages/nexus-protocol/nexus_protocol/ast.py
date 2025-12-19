"""
NXML Abstract Syntax Tree (AST) definitions using Pydantic.

This module defines the complete structure of parsed NXML documents as type-safe
Pydantic models. These models are used to:
1. Represent parsed NXML in Python
2. Serialize to JSON for transmission to React frontend
3. Validate NXML structure and semantics
"""

from typing import Dict, List, Optional, Any, Literal, Union
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


# ============================================================================
# Primitive Types
# ============================================================================

class NXMLPrimitiveType(str, Enum):
    """NXML primitive data types."""
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    ARRAY = "array"
    LIST = "list"  # Alias for array
    OBJECT = "object"
    ANY = "any"


class SourceLocation(BaseModel):
    """Source code location for error reporting."""
    start_line: int
    start_column: int
    end_line: int
    end_column: int


# ============================================================================
# Panel Metadata
# ============================================================================

class PanelMeta(BaseModel):
    """Metadata for a Nexus panel."""
    id: str = Field(..., description="Unique panel ID")
    title: Optional[str] = Field(None, description="Panel display title")
    type: str = Field(..., description="Panel type (e.g., 'custom', 'flowchart')")
    version: str = Field(default="1.0.0", description="Panel schema version")
    description: Optional[str] = Field(None, description="Panel description")
    author: Optional[str] = Field(None, description="Panel author")
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")
    tags: List[str] = Field(default_factory=list, description="Searchable tags")
    icon: Optional[str] = Field(None, description="Icon name or emoji")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


# ============================================================================
# Data Section (State & Computed)
# ============================================================================

class StateNode(BaseModel):
    """State variable declaration."""
    kind: Literal["State"] = "State"
    name: str = Field(..., description="State variable name")
    type: NXMLPrimitiveType = Field(..., description="Data type")
    default: Any = Field(None, description="Default value")
    description: Optional[str] = Field(None, description="State description")
    validation: Optional[Dict[str, Any]] = Field(None, description="Validation rules")
    loc: Optional[SourceLocation] = None

    class Config:
        use_enum_values = True


class ComputedNode(BaseModel):
    """Computed value declaration (derived from state)."""
    kind: Literal["Computed"] = "Computed"
    name: str = Field(..., description="Computed variable name")
    value: str = Field(..., description="Expression to compute value")
    type: Optional[NXMLPrimitiveType] = Field(None, description="Result type")
    dependencies: List[str] = Field(default_factory=list, description="State dependencies")
    description: Optional[str] = Field(None, description="Computed description")
    loc: Optional[SourceLocation] = None

    class Config:
        use_enum_values = True


class DataAST(BaseModel):
    """Data section containing state and computed values."""
    kind: Literal["Data"] = "Data"
    states: List[StateNode] = Field(default_factory=list)
    computed: List[ComputedNode] = Field(default_factory=list)
    loc: Optional[SourceLocation] = None


# ============================================================================
# Logic Section (Tools, Handlers, Lifecycles)
# ============================================================================

class ArgNode(BaseModel):
    """Tool argument definition."""
    name: str = Field(..., description="Argument name")
    type: NXMLPrimitiveType = Field(..., description="Argument type")
    default: Optional[Any] = Field(None, description="Default value")
    required: bool = Field(default=True, description="Is required")
    description: Optional[str] = Field(None, description="Argument description")

    class Config:
        use_enum_values = True


class HandlerNode(BaseModel):
    """Handler code block."""
    kind: Literal["Handler"] = "Handler"
    code: str = Field(..., description="JavaScript handler code")
    capabilities: List[str] = Field(default_factory=list, description="Required capabilities")
    timeout_ms: int = Field(default=5000, description="Execution timeout in milliseconds")
    loc: Optional[SourceLocation] = None


class ToolNode(BaseModel):
    """Tool definition (user-invokable function)."""
    kind: Literal["Tool"] = "Tool"
    name: str = Field(..., description="Tool name")
    args: List[ArgNode] = Field(default_factory=list, description="Tool arguments")
    handler: HandlerNode = Field(..., description="Tool implementation")
    description: Optional[str] = Field(None, description="Tool description")
    icon: Optional[str] = Field(None, description="Tool icon")
    loc: Optional[SourceLocation] = None


class LifecycleNode(BaseModel):
    """Lifecycle hook definition."""
    kind: Literal["Lifecycle"] = "Lifecycle"
    event: str = Field(..., description="Lifecycle event (mount, unmount, etc.)")
    handler: HandlerNode = Field(..., description="Lifecycle handler")
    loc: Optional[SourceLocation] = None


class ExtensionNode(BaseModel):
    """Extension declaration (external capabilities)."""
    kind: Literal["Extension"] = "Extension"
    name: str = Field(..., description="Extension name (e.g., 'http', 'fs')")
    config: Dict[str, Any] = Field(default_factory=dict, description="Extension configuration")
    loc: Optional[SourceLocation] = None


class LogicAST(BaseModel):
    """Logic section containing tools, handlers, and lifecycles."""
    kind: Literal["Logic"] = "Logic"
    extensions: List[ExtensionNode] = Field(default_factory=list)
    tools: List[ToolNode] = Field(default_factory=list)
    lifecycles: List[LifecycleNode] = Field(default_factory=list)
    loc: Optional[SourceLocation] = None


# ============================================================================
# View Section (UI Components)
# ============================================================================

class ViewNode(BaseModel):
    """UI component in the view tree."""
    type: str = Field(..., description="Component type (Layout, Button, Text, etc.)")
    props: Dict[str, Any] = Field(default_factory=dict, description="Component properties")
    children: List["ViewNode"] = Field(default_factory=list, description="Child components")
    bindings: Dict[str, str] = Field(default_factory=dict, description="State bindings")
    events: Dict[str, str] = Field(default_factory=dict, description="Event handlers")
    conditions: Optional[str] = Field(None, description="Conditional rendering expression")
    iteration: Optional[Dict[str, Any]] = Field(None, description="List iteration config")
    loc: Optional[SourceLocation] = None

    class Config:
        # Allow recursive model definition
        arbitrary_types_allowed = True


# Update forward references for recursive models
ViewNode.model_rebuild()


class ViewAST(BaseModel):
    """View section containing the UI component tree."""
    kind: Literal["View"] = "View"
    root: ViewNode = Field(..., description="Root component")
    loc: Optional[SourceLocation] = None


# ============================================================================
# Complete Panel AST
# ============================================================================

class NexusPanelAST(BaseModel):
    """Complete NXML panel Abstract Syntax Tree."""
    kind: Literal["NexusPanel"] = "NexusPanel"
    meta: PanelMeta = Field(..., description="Panel metadata")
    data: DataAST = Field(..., description="Data section (state & computed)")
    logic: LogicAST = Field(..., description="Logic section (tools & handlers)")
    view: ViewAST = Field(..., description="View section (UI tree)")
    loc: Optional[SourceLocation] = None

    def to_json_dict(self) -> Dict[str, Any]:
        """Convert AST to JSON-serializable dict for frontend."""
        return self.model_dump(
            mode="json",
            exclude_none=True,
            exclude={"loc"}  # Exclude source locations
        )

    def get_state_names(self) -> List[str]:
        """Get all state variable names."""
        return [state.name for state in self.data.states]

    def get_computed_names(self) -> List[str]:
        """Get all computed variable names."""
        return [computed.name for computed in self.data.computed]

    def get_tool_names(self) -> List[str]:
        """Get all tool names."""
        return [tool.name for tool in self.logic.tools]

    def get_lifecycle_events(self) -> List[str]:
        """Get all lifecycle event names."""
        return [lifecycle.event for lifecycle in self.logic.lifecycles]

    def get_required_capabilities(self) -> List[str]:
        """Get all required capabilities across all handlers."""
        capabilities = set()

        # Tool handlers
        for tool in self.logic.tools:
            capabilities.update(tool.handler.capabilities)

        # Lifecycle handlers
        for lifecycle in self.logic.lifecycles:
            capabilities.update(lifecycle.handler.capabilities)

        return sorted(list(capabilities))


# ============================================================================
# Validation Errors
# ============================================================================

class ValidationError(BaseModel):
    """NXML validation error."""
    severity: Literal["error", "warning"] = "error"
    message: str
    loc: Optional[SourceLocation] = None
    hint: Optional[str] = None


class ValidationResult(BaseModel):
    """Result of NXML validation."""
    valid: bool
    errors: List[ValidationError] = Field(default_factory=list)
    warnings: List[ValidationError] = Field(default_factory=list)

    @property
    def has_errors(self) -> bool:
        """Check if there are any errors."""
        return len(self.errors) > 0

    @property
    def has_warnings(self) -> bool:
        """Check if there are any warnings."""
        return len(self.warnings) > 0
