/**
 * @fileoverview NOG Graph structure and operations
 * @module @nexus/protocol/nog/graph
 * 
 * The Nexus Object Graph (NOG) is the "Runtime Semantic Truth" of a project.
 * It maintains the semantic structure across all panels in a workspace.
 */

import type { NOGEntity, EntityCategory } from './entity';
import type { NOGRelationship, RelationshipType } from './relationship';
import { 
  generateEntityId, 
  createEntity,
  updateEntity 
} from './entity';
import { 
  generateRelationshipId, 
  createRelationship,
  getOutgoingRelationships,
  getIncomingRelationships 
} from './relationship';

// =============================================================================
// Graph Structure
// =============================================================================

/**
 * The Nexus Object Graph
 */
export interface NOGGraph {
  /**
   * Graph ID (matches workspace ID)
   */
  id: string;
  
  /**
   * All entities in the graph
   */
  entities: Map<string, NOGEntity>;
  
  /**
   * All relationships in the graph
   */
  relationships: Map<string, NOGRelationship>;
  
  /**
   * Graph version for conflict resolution
   */
  version: number;
  
  /**
   * Last modification timestamp
   */
  updatedAt: number;
  
  /**
   * Graph metadata
   */
  meta: NOGGraphMeta;
}

/**
 * Graph metadata
 */
export interface NOGGraphMeta {
  /**
   * Workspace name
   */
  name: string;
  
  /**
   * Source panels that contribute to this graph
   */
  sourcePanels: string[];
  
  /**
   * Graph creation timestamp
   */
  createdAt: number;
  
  /**
   * Author information
   */
  author?: string;
}

// =============================================================================
// Serializable Format
// =============================================================================

/**
 * JSON-serializable graph format
 */
export interface NOGGraphJSON {
  id: string;
  entities: NOGEntity[];
  relationships: NOGRelationship[];
  version: number;
  updatedAt: number;
  meta: NOGGraphMeta;
}

// =============================================================================
// Graph Factory
// =============================================================================

/**
 * Create a new empty NOG graph
 */
export function createNOGGraph(id: string, name: string): NOGGraph {
  const now = Date.now();
  
  return {
    id,
    entities: new Map(),
    relationships: new Map(),
    version: 1,
    updatedAt: now,
    meta: {
      name,
      sourcePanels: [],
      createdAt: now,
    },
  };
}

/**
 * Serialize graph to JSON
 */
export function serializeNOGGraph(graph: NOGGraph): NOGGraphJSON {
  return {
    id: graph.id,
    entities: Array.from(graph.entities.values()),
    relationships: Array.from(graph.relationships.values()),
    version: graph.version,
    updatedAt: graph.updatedAt,
    meta: graph.meta,
  };
}

/**
 * Deserialize graph from JSON
 */
export function deserializeNOGGraph(json: NOGGraphJSON): NOGGraph {
  return {
    id: json.id,
    entities: new Map(json.entities.map(e => [e.id, e])),
    relationships: new Map(json.relationships.map(r => [r.id, r])),
    version: json.version,
    updatedAt: json.updatedAt,
    meta: json.meta,
  };
}

// =============================================================================
// Graph Operations
// =============================================================================

/**
 * Add an entity to the graph
 */
export function addEntity(graph: NOGGraph, entity: NOGEntity): NOGGraph {
  const newEntities = new Map(graph.entities);
  newEntities.set(entity.id, entity);
  
  return {
    ...graph,
    entities: newEntities,
    version: graph.version + 1,
    updatedAt: Date.now(),
  };
}

/**
 * Remove an entity and all its relationships
 */
export function removeEntity(graph: NOGGraph, entityId: string): NOGGraph {
  const newEntities = new Map(graph.entities);
  newEntities.delete(entityId);
  
  // Remove relationships involving this entity
  const newRelationships = new Map(graph.relationships);
  for (const [id, rel] of newRelationships) {
    if (rel.from === entityId || rel.to === entityId) {
      newRelationships.delete(id);
    }
  }
  
  return {
    ...graph,
    entities: newEntities,
    relationships: newRelationships,
    version: graph.version + 1,
    updatedAt: Date.now(),
  };
}

/**
 * Update an entity in the graph
 */
export function updateEntityInGraph(
  graph: NOGGraph,
  entityId: string,
  updates: Partial<Omit<NOGEntity, 'id' | 'createdAt' | 'version'>>
): NOGGraph {
  const entity = graph.entities.get(entityId);
  if (!entity) {
    return graph;
  }
  
  const updatedEntity = updateEntity(entity, updates);
  const newEntities = new Map(graph.entities);
  newEntities.set(entityId, updatedEntity);
  
  return {
    ...graph,
    entities: newEntities,
    version: graph.version + 1,
    updatedAt: Date.now(),
  };
}

/**
 * Add a relationship to the graph
 */
export function addRelationship(graph: NOGGraph, relationship: NOGRelationship): NOGGraph {
  // Verify both entities exist
  if (!graph.entities.has(relationship.from) || !graph.entities.has(relationship.to)) {
    throw new Error('Cannot create relationship: entity not found');
  }
  
  const newRelationships = new Map(graph.relationships);
  newRelationships.set(relationship.id, relationship);
  
  return {
    ...graph,
    relationships: newRelationships,
    version: graph.version + 1,
    updatedAt: Date.now(),
  };
}

/**
 * Remove a relationship from the graph
 */
export function removeRelationship(graph: NOGGraph, relationshipId: string): NOGGraph {
  const newRelationships = new Map(graph.relationships);
  newRelationships.delete(relationshipId);
  
  return {
    ...graph,
    relationships: newRelationships,
    version: graph.version + 1,
    updatedAt: Date.now(),
  };
}

// =============================================================================
// Graph Queries
// =============================================================================

/**
 * Find entities by category
 */
export function findEntitiesByCategory(
  graph: NOGGraph,
  category: EntityCategory
): NOGEntity[] {
  return Array.from(graph.entities.values()).filter(e => e.category === category);
}

/**
 * Find entities by tag
 */
export function findEntitiesByTag(
  graph: NOGGraph,
  tag: string
): NOGEntity[] {
  return Array.from(graph.entities.values()).filter(e => e.tags.includes(tag));
}

/**
 * Find entities by source panel
 */
export function findEntitiesByPanel(
  graph: NOGGraph,
  panelId: string
): NOGEntity[] {
  return Array.from(graph.entities.values()).filter(e => e.sourcePanel === panelId);
}

/**
 * Get entity with all its relationships
 */
export interface EntityWithRelationships {
  entity: NOGEntity;
  outgoing: NOGRelationship[];
  incoming: NOGRelationship[];
}

export function getEntityWithRelationships(
  graph: NOGGraph,
  entityId: string
): EntityWithRelationships | null {
  const entity = graph.entities.get(entityId);
  if (!entity) return null;
  
  const relationships = Array.from(graph.relationships.values());
  
  return {
    entity,
    outgoing: getOutgoingRelationships(relationships, entityId),
    incoming: getIncomingRelationships(relationships, entityId),
  };
}

/**
 * Find all connected entities (BFS)
 */
export function findConnectedEntities(
  graph: NOGGraph,
  startId: string,
  maxDepth: number = 3
): NOGEntity[] {
  const visited = new Set<string>();
  const queue: { id: string; depth: number }[] = [{ id: startId, depth: 0 }];
  const result: NOGEntity[] = [];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    if (visited.has(current.id) || current.depth > maxDepth) {
      continue;
    }
    
    visited.add(current.id);
    const entity = graph.entities.get(current.id);
    
    if (entity && current.id !== startId) {
      result.push(entity);
    }
    
    // Find connected entities through relationships
    for (const rel of graph.relationships.values()) {
      if (rel.from === current.id && !visited.has(rel.to)) {
        queue.push({ id: rel.to, depth: current.depth + 1 });
      }
      if (rel.to === current.id && !visited.has(rel.from)) {
        queue.push({ id: rel.from, depth: current.depth + 1 });
      }
    }
  }
  
  return result;
}

/**
 * Find path between two entities
 */
export function findPath(
  graph: NOGGraph,
  fromId: string,
  toId: string,
  maxDepth: number = 5
): NOGRelationship[] | null {
  const visited = new Set<string>();
  const queue: { id: string; path: NOGRelationship[] }[] = [{ id: fromId, path: [] }];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    if (current.id === toId) {
      return current.path;
    }
    
    if (visited.has(current.id) || current.path.length >= maxDepth) {
      continue;
    }
    
    visited.add(current.id);
    
    for (const rel of graph.relationships.values()) {
      if (rel.from === current.id && !visited.has(rel.to)) {
        queue.push({ id: rel.to, path: [...current.path, rel] });
      }
    }
  }
  
  return null; // No path found
}

// =============================================================================
// Graph Statistics
// =============================================================================

export interface NOGGraphStats {
  entityCount: number;
  relationshipCount: number;
  entitiesByCategory: Record<string, number>;
  relationshipsByType: Record<string, number>;
  averageConnections: number;
  orphanedEntities: number;
}

/**
 * Calculate graph statistics
 */
export function calculateGraphStats(graph: NOGGraph): NOGGraphStats {
  const entities = Array.from(graph.entities.values());
  const relationships = Array.from(graph.relationships.values());
  
  // Count by category
  const entitiesByCategory: Record<string, number> = {};
  for (const entity of entities) {
    entitiesByCategory[entity.category] = (entitiesByCategory[entity.category] ?? 0) + 1;
  }
  
  // Count by relationship type
  const relationshipsByType: Record<string, number> = {};
  for (const rel of relationships) {
    relationshipsByType[rel.type] = (relationshipsByType[rel.type] ?? 0) + 1;
  }
  
  // Calculate connections
  const connectionCounts = new Map<string, number>();
  for (const entity of entities) {
    connectionCounts.set(entity.id, 0);
  }
  for (const rel of relationships) {
    connectionCounts.set(rel.from, (connectionCounts.get(rel.from) ?? 0) + 1);
    connectionCounts.set(rel.to, (connectionCounts.get(rel.to) ?? 0) + 1);
  }
  
  const totalConnections = Array.from(connectionCounts.values()).reduce((a, b) => a + b, 0);
  const orphanedEntities = Array.from(connectionCounts.values()).filter(c => c === 0).length;
  
  return {
    entityCount: entities.length,
    relationshipCount: relationships.length,
    entitiesByCategory,
    relationshipsByType,
    averageConnections: entities.length > 0 ? totalConnections / entities.length : 0,
    orphanedEntities,
  };
}
