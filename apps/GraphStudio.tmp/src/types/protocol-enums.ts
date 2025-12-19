/**
 * Enum types for nexus-protocol
 *
 * These are manually defined because Python Enums need special handling.
 * Keep in sync with nexus_protocol Python enums.
 */

// ============================================================================
// NXML AST Enums
// ============================================================================

export enum NXMLPrimitiveType {
  STRING = "string",
  NUMBER = "number",
  BOOLEAN = "boolean",
  ARRAY = "array",
  OBJECT = "object",
  ANY = "any",
}

// ============================================================================
// NOG Enums
// ============================================================================

export enum EntityType {
  FUNCTION = "function",
  VARIABLE = "variable",
  CONCEPT = "concept",
  PANEL = "panel",
  TOOL = "tool",
  WORKFLOW = "workflow",
  DATA_SOURCE = "data_source",
  USER = "user",
  WORKSPACE = "workspace",
  CUSTOM = "custom",
}

export enum RelationType {
  DEPENDS_ON = "depends_on",
  USES = "uses",
  PRODUCES = "produces",
  CONTAINS = "contains",
  REFERENCES = "references",
  FLOWS_TO = "flows_to",
  TRIGGERS = "triggers",
  CUSTOM = "custom",
}

export enum PatchOperation {
  ENTITY_CREATE = "entity_create",
  ENTITY_UPDATE = "entity_update",
  ENTITY_DELETE = "entity_delete",
  RELATIONSHIP_CREATE = "relationship_create",
  RELATIONSHIP_UPDATE = "relationship_update",
  RELATIONSHIP_DELETE = "relationship_delete",
}
