/**
 * @fileoverview NOG Entity definitions
 * @module @nexus/protocol/nog/entity
 * 
 * Entities represent semantic concepts in the project.
 * They are the "nouns" of the knowledge graph.
 */

// =============================================================================
// Entity Types
// =============================================================================

/**
 * Entity category for classification
 */
export type EntityCategory =
  | 'concept'     // Abstract ideas or requirements
  | 'component'   // UI or system components
  | 'data'        // Data structures or models
  | 'action'      // Behaviors or operations
  | 'resource'    // External resources or assets
  | 'constraint'  // Rules or limitations
  | 'milestone'   // Project milestones or goals
  | 'custom';     // User-defined categories

/**
 * Entity status for lifecycle tracking
 */
export type EntityStatus =
  | 'draft'       // Being defined
  | 'active'      // In use
  | 'deprecated'  // Marked for removal
  | 'archived';   // Kept for reference

/**
 * Base entity interface
 */
export interface NOGEntity {
  /**
   * Unique identifier within the workspace
   */
  id: string;
  
  /**
   * Human-readable name
   */
  name: string;
  
  /**
   * Entity category
   */
  category: EntityCategory;
  
  /**
   * Entity status
   */
  status: EntityStatus;
  
  /**
   * Detailed description
   */
  description?: string;
  
  /**
   * Source panel ID where this entity was defined
   */
  sourcePanel?: string;
  
  /**
   * Tags for organization
   */
  tags: string[];
  
  /**
   * Custom properties
   */
  properties: Record<string, EntityPropertyValue>;
  
  /**
   * Creation timestamp
   */
  createdAt: number;
  
  /**
   * Last modification timestamp
   */
  updatedAt: number;
  
  /**
   * Version number for conflict resolution
   */
  version: number;
}

/**
 * Entity property value types
 */
export type EntityPropertyValue =
  | string
  | number
  | boolean
  | string[]
  | EntityRef
  | EntityRef[];

/**
 * Reference to another entity
 */
export interface EntityRef {
  entityId: string;
  label?: string;
}

// =============================================================================
// Specialized Entity Types
// =============================================================================

/**
 * Concept entity - abstract ideas or requirements
 */
export interface ConceptEntity extends NOGEntity {
  category: 'concept';
  properties: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    complexity?: 'simple' | 'moderate' | 'complex';
    implementedBy?: EntityRef[];
    dependsOn?: EntityRef[];
  };
}

/**
 * Component entity - UI or system components
 */
export interface ComponentEntity extends NOGEntity {
  category: 'component';
  properties: {
    type?: 'ui' | 'service' | 'utility' | 'integration';
    panelId?: string;
    stateBindings?: string[];
    toolBindings?: string[];
    children?: EntityRef[];
    parent?: EntityRef;
  };
}

/**
 * Data entity - data structures or models
 */
export interface DataEntity extends NOGEntity {
  category: 'data';
  properties: {
    schema?: string;  // JSON Schema or TypeScript type
    source?: 'local' | 'remote' | 'computed';
    persistence?: 'memory' | 'session' | 'persistent';
    usedBy?: EntityRef[];
  };
}

/**
 * Action entity - behaviors or operations
 */
export interface ActionEntity extends NOGEntity {
  category: 'action';
  properties: {
    trigger?: 'manual' | 'automatic' | 'scheduled';
    inputs?: EntityRef[];
    outputs?: EntityRef[];
    effects?: string[];
    toolName?: string;
  };
}

/**
 * Resource entity - external resources or assets
 */
export interface ResourceEntity extends NOGEntity {
  category: 'resource';
  properties: {
    resourceType?: 'api' | 'file' | 'database' | 'service';
    url?: string;
    extensionName?: string;
    credentials?: boolean;
  };
}

/**
 * Constraint entity - rules or limitations
 */
export interface ConstraintEntity extends NOGEntity {
  category: 'constraint';
  properties: {
    constraintType?: 'validation' | 'security' | 'performance' | 'business';
    appliesTo?: EntityRef[];
    expression?: string;
    severity?: 'info' | 'warning' | 'error';
  };
}

/**
 * Milestone entity - project milestones or goals
 */
export interface MilestoneEntity extends NOGEntity {
  category: 'milestone';
  properties: {
    dueDate?: string;
    completion?: number;  // 0-100
    dependencies?: EntityRef[];
    deliverables?: EntityRef[];
  };
}

// =============================================================================
// Union Type
// =============================================================================

/**
 * Union of all entity types
 */
export type NOGEntityTyped =
  | ConceptEntity
  | ComponentEntity
  | DataEntity
  | ActionEntity
  | ResourceEntity
  | ConstraintEntity
  | MilestoneEntity
  | NOGEntity;

// =============================================================================
// Type Guards
// =============================================================================

export function isConceptEntity(entity: NOGEntity): entity is ConceptEntity {
  return entity.category === 'concept';
}

export function isComponentEntity(entity: NOGEntity): entity is ComponentEntity {
  return entity.category === 'component';
}

export function isDataEntity(entity: NOGEntity): entity is DataEntity {
  return entity.category === 'data';
}

export function isActionEntity(entity: NOGEntity): entity is ActionEntity {
  return entity.category === 'action';
}

export function isResourceEntity(entity: NOGEntity): entity is ResourceEntity {
  return entity.category === 'resource';
}

export function isConstraintEntity(entity: NOGEntity): entity is ConstraintEntity {
  return entity.category === 'constraint';
}

export function isMilestoneEntity(entity: NOGEntity): entity is MilestoneEntity {
  return entity.category === 'milestone';
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Generate a unique entity ID
 */
export function generateEntityId(): string {
  return `ent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new entity with defaults
 */
export function createEntity(
  name: string,
  category: EntityCategory,
  options?: Partial<Omit<NOGEntity, 'id' | 'name' | 'category' | 'createdAt' | 'updatedAt' | 'version'>>
): NOGEntity {
  const now = Date.now();
  
  return {
    id: generateEntityId(),
    name,
    category,
    status: options?.status ?? 'draft',
    description: options?.description,
    sourcePanel: options?.sourcePanel,
    tags: options?.tags ?? [],
    properties: options?.properties ?? {},
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

/**
 * Clone an entity with a new ID
 */
export function cloneEntity(entity: NOGEntity, updates?: Partial<NOGEntity>): NOGEntity {
  const now = Date.now();
  
  return {
    ...entity,
    ...updates,
    id: generateEntityId(),
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

/**
 * Update an entity (bumps version)
 */
export function updateEntity<T extends NOGEntity>(
  entity: T,
  updates: Partial<Omit<T, 'id' | 'createdAt' | 'version'>>
): T {
  return {
    ...entity,
    ...updates,
    updatedAt: Date.now(),
    version: entity.version + 1,
  } as T;
}
