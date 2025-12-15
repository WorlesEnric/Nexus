/**
 * NOG Manager - Manages the in-memory Nexus Object Graph
 *
 * This service provides a mutable wrapper around the NOG graph operations
 * from @nexus/protocol, adding:
 * - Event emission for graph changes
 * - Patch application logic
 * - Graph snapshots for WebSocket sync
 * - Validation and error handling
 */

import {
  NOGGraph,
  NOGEntity,
  NOGRelationship,
  NOGPatch,
  EntityPatch,
  RelationshipPatch,
  ViewPatch,
  createNOGGraph,
  addEntity,
  removeEntity,
  updateEntityInGraph,
  addRelationship,
  removeRelationship,
  serializeNOGGraph,
  deserializeNOGGraph,
  type NOGGraphJSON,
  type NOGGraphStats,
  calculateGraphStats,
} from '@nexus/protocol';
import { logger } from '../logger';
import { EventEmitter } from 'events';

// =============================================================================
// Types
// =============================================================================

export interface NOGManagerConfig {
  workspaceId: string;
  workspaceName: string;
}

export interface NOGManagerEvents {
  'graph:updated': (graph: NOGGraph) => void;
  'entity:created': (entity: NOGEntity) => void;
  'entity:updated': (entityId: string, entity: NOGEntity) => void;
  'entity:deleted': (entityId: string) => void;
  'relationship:created': (relationship: NOGRelationship) => void;
  'relationship:deleted': (relationshipId: string) => void;
  'patch:applied': (patch: NOGPatch) => void;
  'patch:failed': (patch: NOGPatch, error: Error) => void;
}

export interface GraphSnapshot {
  graph: NOGGraphJSON;
  stats: NOGGraphStats;
  timestamp: number;
}

// =============================================================================
// NOGManager Class
// =============================================================================

/**
 * NOGManager - Manages the in-memory NOG graph with event emission
 */
export class NOGManager extends EventEmitter {
  private graph: NOGGraph;
  private readonly workspaceId: string;

  constructor(config: NOGManagerConfig) {
    super();
    this.workspaceId = config.workspaceId;
    this.graph = createNOGGraph(config.workspaceId, config.workspaceName);

    logger.info(
      {
        workspaceId: config.workspaceId,
        workspaceName: config.workspaceName,
      },
      'NOGManager initialized'
    );
  }

  // ===========================================================================
  // Graph Access
  // ===========================================================================

  /**
   * Get a readonly copy of the current graph
   */
  getGraph(): Readonly<NOGGraph> {
    return this.graph;
  }

  /**
   * Get a JSON snapshot of the graph for serialization
   */
  getSnapshot(): GraphSnapshot {
    return {
      graph: serializeNOGGraph(this.graph),
      stats: calculateGraphStats(this.graph),
      timestamp: Date.now(),
    };
  }

  /**
   * Get graph statistics
   */
  getStats(): NOGGraphStats {
    return calculateGraphStats(this.graph);
  }

  /**
   * Get graph version
   */
  getVersion(): number {
    return this.graph.version;
  }

  /**
   * Replace the entire graph (used during hydration from disk)
   */
  replaceGraph(entities: NOGEntity[], relationships: NOGRelationship[] = []): void {
    logger.info(
      {
        workspaceId: this.workspaceId,
        entityCount: entities.length,
        relationshipCount: relationships.length,
      },
      'Replacing graph with new entities'
    );

    // Create new graph with same metadata
    const newGraph = createNOGGraph(this.graph.id, this.graph.meta.name);
    newGraph.meta = { ...this.graph.meta };

    // Add all entities
    let graph = newGraph;
    for (const entity of entities) {
      graph = addEntity(graph, entity);
    }

    // Add all relationships
    for (const relationship of relationships) {
      try {
        graph = addRelationship(graph, relationship);
      } catch (error) {
        logger.warn(
          {
            error,
            relationship,
          },
          'Failed to add relationship during graph replacement, skipping'
        );
      }
    }

    this.graph = graph;
    this.emit('graph:updated', this.graph);
  }

  /**
   * Deserialize and replace graph from JSON
   */
  loadFromJSON(json: NOGGraphJSON): void {
    logger.info(
      {
        workspaceId: json.id,
        entityCount: json.entities.length,
        relationshipCount: json.relationships.length,
      },
      'Loading graph from JSON'
    );

    this.graph = deserializeNOGGraph(json);
    this.emit('graph:updated', this.graph);
  }

  // ===========================================================================
  // Entity Operations
  // ===========================================================================

  /**
   * Add an entity to the graph
   */
  addEntity(entity: NOGEntity): void {
    try {
      this.graph = addEntity(this.graph, entity);
      this.emit('entity:created', entity);
      this.emit('graph:updated', this.graph);

      logger.debug(
        {
          entityId: entity.id,
          category: entity.category,
          name: entity.name,
        },
        'Entity added to graph'
      );
    } catch (error) {
      logger.error({ error, entity }, 'Failed to add entity');
      throw error;
    }
  }

  /**
   * Update an entity in the graph
   */
  updateEntity(entityId: string, updates: Partial<Omit<NOGEntity, 'id' | 'createdAt' | 'version'>>): void {
    try {
      const oldEntity = this.graph.entities.get(entityId);
      if (!oldEntity) {
        throw new Error(`Entity not found: ${entityId}`);
      }

      this.graph = updateEntityInGraph(this.graph, entityId, updates);
      const updatedEntity = this.graph.entities.get(entityId);

      if (updatedEntity) {
        this.emit('entity:updated', entityId, updatedEntity);
        this.emit('graph:updated', this.graph);

        logger.debug({ entityId, updates }, 'Entity updated');
      }
    } catch (error) {
      logger.error({ error, entityId, updates }, 'Failed to update entity');
      throw error;
    }
  }

  /**
   * Remove an entity from the graph
   */
  removeEntity(entityId: string): void {
    try {
      const entity = this.graph.entities.get(entityId);
      if (!entity) {
        logger.warn({ entityId }, 'Attempted to remove non-existent entity');
        return;
      }

      this.graph = removeEntity(this.graph, entityId);
      this.emit('entity:deleted', entityId);
      this.emit('graph:updated', this.graph);

      logger.debug({ entityId }, 'Entity removed from graph');
    } catch (error) {
      logger.error({ error, entityId }, 'Failed to remove entity');
      throw error;
    }
  }

  /**
   * Get an entity by ID
   */
  getEntity(entityId: string): NOGEntity | undefined {
    return this.graph.entities.get(entityId);
  }

  /**
   * Check if an entity exists
   */
  hasEntity(entityId: string): boolean {
    return this.graph.entities.has(entityId);
  }

  // ===========================================================================
  // Relationship Operations
  // ===========================================================================

  /**
   * Add a relationship to the graph
   */
  addRelationship(relationship: NOGRelationship): void {
    try {
      this.graph = addRelationship(this.graph, relationship);
      this.emit('relationship:created', relationship);
      this.emit('graph:updated', this.graph);

      logger.debug(
        {
          relationshipId: relationship.id,
          from: relationship.from,
          to: relationship.to,
          type: relationship.type,
        },
        'Relationship added to graph'
      );
    } catch (error) {
      logger.error({ error, relationship }, 'Failed to add relationship');
      throw error;
    }
  }

  /**
   * Remove a relationship from the graph
   */
  removeRelationship(relationshipId: string): void {
    try {
      const relationship = this.graph.relationships.get(relationshipId);
      if (!relationship) {
        logger.warn({ relationshipId }, 'Attempted to remove non-existent relationship');
        return;
      }

      this.graph = removeRelationship(this.graph, relationshipId);
      this.emit('relationship:deleted', relationshipId);
      this.emit('graph:updated', this.graph);

      logger.debug({ relationshipId }, 'Relationship removed from graph');
    } catch (error) {
      logger.error({ error, relationshipId }, 'Failed to remove relationship');
      throw error;
    }
  }

  /**
   * Get a relationship by ID
   */
  getRelationship(relationshipId: string): NOGRelationship | undefined {
    return this.graph.relationships.get(relationshipId);
  }

  // ===========================================================================
  // Patch Application
  // ===========================================================================

  /**
   * Apply a patch to the graph
   * This is the core synchronization mechanism
   */
  applyPatch(patch: NOGPatch): void {
    try {
      logger.debug(
        {
          patchId: patch.id,
          patchType: patch.patchType,
          operation: patch.operation,
        },
        'Applying patch to graph'
      );

      if (patch.patchType === 'entity') {
        this.applyEntityPatch(patch as EntityPatch);
      } else if (patch.patchType === 'relationship') {
        this.applyRelationshipPatch(patch as RelationshipPatch);
      } else if (patch.patchType === 'view') {
        this.applyViewPatch(patch as ViewPatch);
      } else {
        throw new Error(`Unknown patch type: ${(patch as any).patchType}`);
      }

      this.emit('patch:applied', patch);
    } catch (error) {
      logger.error({ error, patch }, 'Failed to apply patch');
      this.emit('patch:failed', patch, error as Error);
      throw error;
    }
  }

  /**
   * Apply multiple patches in sequence
   */
  applyPatches(patches: NOGPatch[]): void {
    logger.info({ count: patches.length }, 'Applying multiple patches');

    for (const patch of patches) {
      try {
        this.applyPatch(patch);
      } catch (error) {
        logger.error({ error, patchId: patch.id }, 'Failed to apply patch in batch, continuing');
        // Continue with other patches even if one fails
      }
    }
  }

  // ===========================================================================
  // Private Patch Handlers
  // ===========================================================================

  private applyEntityPatch(patch: EntityPatch): void {
    switch (patch.operation) {
      case 'create':
        if (!patch.data) {
          throw new Error('Entity patch create operation requires data');
        }
        // Create a full entity from the patch data
        const newEntity: NOGEntity = {
          id: patch.data.id || patch.entityId || `entity:${Date.now()}`,
          name: patch.data.name || 'Unnamed',
          category: patch.data.category || 'custom',
          status: patch.data.status || 'draft',
          tags: patch.data.tags || [],
          properties: patch.data.properties || {},
          createdAt: patch.data.createdAt || Date.now(),
          updatedAt: Date.now(),
          version: 1,
          ...patch.data,
        };
        this.addEntity(newEntity);
        break;

      case 'update':
        if (!patch.entityId) {
          throw new Error('Entity patch update operation requires entityId');
        }
        if (!patch.data) {
          throw new Error('Entity patch update operation requires data');
        }
        this.updateEntity(patch.entityId, patch.data);
        break;

      case 'delete':
        if (!patch.entityId) {
          throw new Error('Entity patch delete operation requires entityId');
        }
        this.removeEntity(patch.entityId);
        break;

      case 'merge':
      case 'split':
      case 'move':
        // TODO: Implement advanced operations
        logger.warn({ operation: patch.operation }, 'Advanced entity operation not yet implemented');
        break;

      default:
        throw new Error(`Unknown entity patch operation: ${patch.operation}`);
    }
  }

  private applyRelationshipPatch(patch: RelationshipPatch): void {
    switch (patch.operation) {
      case 'create':
        if (!patch.data) {
          throw new Error('Relationship patch create operation requires data');
        }
        const now = Date.now();
        const newRelationship: NOGRelationship = {
          id: patch.data.id || patch.relationshipId || `rel:${Date.now()}`,
          from: patch.data.from || '',
          to: patch.data.to || '',
          type: patch.data.type || 'related_to',
          meta: patch.data.meta || {},
          properties: patch.data.properties || {},
          createdAt: patch.data.createdAt || now,
          updatedAt: patch.data.updatedAt || now,
          ...patch.data,
        };
        this.addRelationship(newRelationship);
        break;

      case 'delete':
        if (!patch.relationshipId) {
          throw new Error('Relationship patch delete operation requires relationshipId');
        }
        this.removeRelationship(patch.relationshipId);
        break;

      case 'update':
      case 'merge':
      case 'split':
      case 'move':
        logger.warn({ operation: patch.operation }, 'Relationship operation not fully implemented');
        break;

      default:
        throw new Error(`Unknown relationship patch operation: ${patch.operation}`);
    }
  }

  private applyViewPatch(patch: ViewPatch): void {
    // View patches are typically handled at the panel level
    // For now, we just log them
    logger.debug({ patch }, 'View patch received (handled at panel level)');
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Clear the entire graph (useful for testing)
   */
  clear(): void {
    logger.warn({ workspaceId: this.workspaceId }, 'Clearing entire NOG graph');
    this.graph = createNOGGraph(this.graph.id, this.graph.meta.name);
    this.graph.meta = { ...this.graph.meta };
    this.emit('graph:updated', this.graph);
  }

  /**
   * Get the workspace ID
   */
  getWorkspaceId(): string {
    return this.workspaceId;
  }
}
