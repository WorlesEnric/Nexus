/**
 * @fileoverview NOG Relationship definitions
 * @module @nexus/protocol/nog/relationship
 * 
 * Relationships define the edges between entities in the knowledge graph.
 * They represent semantic connections like "implements", "depends on", etc.
 */

// =============================================================================
// Relationship Types
// =============================================================================

/**
 * Standard relationship types
 */
export type RelationshipType =
  // Structural
  | 'contains'         // Parent-child containment
  | 'part_of'          // Inverse of contains
  | 'extends'          // Inheritance/extension
  | 'implements'       // Realization of concept
  
  // Dependencies
  | 'depends_on'       // Requires another entity
  | 'required_by'      // Inverse of depends_on
  | 'uses'             // Utilizes another entity
  | 'used_by'          // Inverse of uses
  
  // Data Flow
  | 'produces'         // Outputs data
  | 'consumes'         // Inputs data
  | 'transforms'       // Modifies data
  
  // Associations
  | 'related_to'       // General association
  | 'similar_to'       // Similarity relationship
  | 'conflicts_with'   // Conflict or contradiction
  
  // Temporal
  | 'precedes'         // Happens before
  | 'follows'          // Happens after
  | 'triggers'         // Causes to happen
  
  // Custom
  | 'custom';

/**
 * Relationship metadata
 */
export interface RelationshipMeta {
  /**
   * Relationship strength (0-1)
   */
  strength?: number;
  
  /**
   * Confidence level (0-1)
   */
  confidence?: number;
  
  /**
   * Whether this was auto-generated
   */
  auto?: boolean;
  
  /**
   * Source of the relationship
   */
  source?: 'user' | 'ai' | 'system';
  
  /**
   * Additional notes
   */
  notes?: string;
}

/**
 * Relationship edge in the graph
 */
export interface NOGRelationship {
  /**
   * Unique relationship ID
   */
  id: string;
  
  /**
   * Source entity ID
   */
  from: string;
  
  /**
   * Target entity ID
   */
  to: string;
  
  /**
   * Relationship type
   */
  type: RelationshipType;
  
  /**
   * Custom label for 'custom' type
   */
  label?: string;
  
  /**
   * Relationship metadata
   */
  meta: RelationshipMeta;
  
  /**
   * Custom properties
   */
  properties: Record<string, unknown>;
  
  /**
   * Creation timestamp
   */
  createdAt: number;
  
  /**
   * Last modification timestamp
   */
  updatedAt: number;
}

// =============================================================================
// Relationship Rules
// =============================================================================

/**
 * Valid relationship directions for entity categories
 */
export interface RelationshipRule {
  type: RelationshipType;
  fromCategories: string[];
  toCategories: string[];
  bidirectional?: boolean;
  inverse?: RelationshipType;
}

/**
 * Standard relationship rules
 */
export const RELATIONSHIP_RULES: RelationshipRule[] = [
  {
    type: 'contains',
    fromCategories: ['component', 'concept'],
    toCategories: ['component', 'data', 'action'],
    inverse: 'part_of',
  },
  {
    type: 'implements',
    fromCategories: ['component', 'action'],
    toCategories: ['concept'],
  },
  {
    type: 'depends_on',
    fromCategories: ['component', 'action', 'concept'],
    toCategories: ['component', 'data', 'resource'],
    inverse: 'required_by',
  },
  {
    type: 'uses',
    fromCategories: ['action', 'component'],
    toCategories: ['data', 'resource'],
    inverse: 'used_by',
  },
  {
    type: 'triggers',
    fromCategories: ['action', 'component'],
    toCategories: ['action'],
  },
  {
    type: 'related_to',
    fromCategories: ['*'],
    toCategories: ['*'],
    bidirectional: true,
  },
];

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Generate a unique relationship ID
 */
export function generateRelationshipId(): string {
  return `rel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new relationship
 */
export function createRelationship(
  from: string,
  to: string,
  type: RelationshipType,
  options?: {
    label?: string;
    meta?: Partial<RelationshipMeta>;
    properties?: Record<string, unknown>;
  }
): NOGRelationship {
  const now = Date.now();
  
  return {
    id: generateRelationshipId(),
    from,
    to,
    type,
    label: options?.label,
    meta: {
      strength: options?.meta?.strength ?? 1,
      confidence: options?.meta?.confidence ?? 1,
      auto: options?.meta?.auto ?? false,
      source: options?.meta?.source ?? 'user',
      notes: options?.meta?.notes,
    },
    properties: options?.properties ?? {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create the inverse relationship if one exists
 */
export function createInverseRelationship(rel: NOGRelationship): NOGRelationship | null {
  const rule = RELATIONSHIP_RULES.find(r => r.type === rel.type);
  
  if (!rule?.inverse) {
    return null;
  }
  
  return createRelationship(rel.to, rel.from, rule.inverse, {
    meta: {
      ...rel.meta,
      auto: true,
      source: 'system',
    },
    properties: rel.properties,
  });
}

/**
 * Check if a relationship type is valid for given entity categories
 */
export function isValidRelationship(
  type: RelationshipType,
  fromCategory: string,
  toCategory: string
): boolean {
  const rule = RELATIONSHIP_RULES.find(r => r.type === type);
  
  if (!rule) {
    return type === 'custom'; // Custom is always allowed
  }
  
  const fromValid = rule.fromCategories.includes('*') || rule.fromCategories.includes(fromCategory);
  const toValid = rule.toCategories.includes('*') || rule.toCategories.includes(toCategory);
  
  return fromValid && toValid;
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Filter relationships by source entity
 */
export function getOutgoingRelationships(
  relationships: NOGRelationship[],
  entityId: string
): NOGRelationship[] {
  return relationships.filter(r => r.from === entityId);
}

/**
 * Filter relationships by target entity
 */
export function getIncomingRelationships(
  relationships: NOGRelationship[],
  entityId: string
): NOGRelationship[] {
  return relationships.filter(r => r.to === entityId);
}

/**
 * Get all relationships involving an entity
 */
export function getEntityRelationships(
  relationships: NOGRelationship[],
  entityId: string
): NOGRelationship[] {
  return relationships.filter(r => r.from === entityId || r.to === entityId);
}

/**
 * Find relationships by type
 */
export function getRelationshipsByType(
  relationships: NOGRelationship[],
  type: RelationshipType
): NOGRelationship[] {
  return relationships.filter(r => r.type === type);
}

/**
 * Find direct path between two entities
 */
export function findDirectRelationship(
  relationships: NOGRelationship[],
  fromId: string,
  toId: string
): NOGRelationship | undefined {
  return relationships.find(r => r.from === fromId && r.to === toId);
}
