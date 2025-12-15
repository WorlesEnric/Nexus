/**
 * State Engine - Main coordinator for the Nexus State Engine
 *
 * The State Engine is the "brain" of the workspace, coordinating:
 * - In-memory semantic graph (NOG)
 * - File system persistence (Git)
 * - Synchronization and debouncing (Sync)
 * - NXML parsing and generation (Mapper)
 *
 * It provides a unified API for the rest of the system to interact with
 * workspace state.
 */

import { EventEmitter } from 'events';
import {
  NOGGraph,
  NOGEntity,
  NOGRelationship,
  NOGPatch,
  type NOGGraphJSON,
  type NOGGraphStats,
  findEntitiesByPanel,
  findEntitiesByCategory,
  getEntityWithRelationships,
} from '@nexus/protocol';
import { GitService, type GitServiceConfig } from './git-service';
import { NOGManager } from './nog-manager';
import { SyncManager, type SyncManagerConfig } from './sync-manager';
import { logger } from '../logger';

// =============================================================================
// Types
// =============================================================================

export interface StateEngineConfig {
  /**
   * Workspace ID (unique identifier)
   */
  workspaceId: string;

  /**
   * Workspace name (human-readable)
   */
  workspaceName: string;

  /**
   * Root directory for the workspace
   */
  workspaceRoot: string;

  /**
   * Git configuration
   */
  git?: Partial<GitServiceConfig>;

  /**
   * Sync configuration
   */
  sync?: SyncManagerConfig;
}

export interface StateEngineEvents {
  'ready': () => void;
  'error': (error: Error) => void;
  'graph:updated': (graph: NOGGraph) => void;
  'entity:created': (entity: NOGEntity) => void;
  'entity:updated': (entityId: string, entity: NOGEntity) => void;
  'entity:deleted': (entityId: string) => void;
  'patch:applied': (patch: NOGPatch) => void;
  'sync:completed': (filesWritten: number, commitHash: string) => void;
}

export interface StateEngineStatus {
  isReady: boolean;
  workspaceId: string;
  workspaceName: string;
  graphVersion: number;
  entityCount: number;
  relationshipCount: number;
  hasPendingChanges: boolean;
  lastSyncAt?: number;
  stats: NOGGraphStats;
}

// =============================================================================
// StateEngine Class
// =============================================================================

/**
 * StateEngine - The main coordinator for workspace state management
 */
export class StateEngine extends EventEmitter {
  private readonly config: StateEngineConfig;
  private readonly git: GitService;
  private readonly nog: NOGManager;
  private readonly sync: SyncManager;

  private isReady: boolean = false;

  constructor(config: StateEngineConfig) {
    super();

    this.config = config;

    logger.info(
      {
        workspaceId: config.workspaceId,
        workspaceName: config.workspaceName,
        workspaceRoot: config.workspaceRoot,
      },
      'Initializing StateEngine'
    );

    // Initialize Git Service
    this.git = new GitService({
      rootDir: config.workspaceRoot,
      ...config.git,
    });

    // Initialize NOG Manager
    this.nog = new NOGManager({
      workspaceId: config.workspaceId,
      workspaceName: config.workspaceName,
    });

    // Initialize Sync Manager
    this.sync = new SyncManager(this.git, this.nog, config.sync);

    // Setup event forwarding
    this.setupEventForwarding();
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Initialize the State Engine
   * This should be called before any other operations
   */
  async init(): Promise<void> {
    try {
      logger.info({ workspaceId: this.config.workspaceId }, 'Initializing State Engine');

      // Step 1: Initialize Git repository
      await this.git.init();

      // Step 2: Hydrate NOG from disk
      await this.sync.hydrate();

      // Mark as ready
      this.isReady = true;
      this.emit('ready');

      logger.info(
        {
          workspaceId: this.config.workspaceId,
          entityCount: this.nog.getGraph().entities.size,
          relationshipCount: this.nog.getGraph().relationships.size,
        },
        'State Engine initialized successfully'
      );
    } catch (error) {
      logger.error({ error, workspaceId: this.config.workspaceId }, 'Failed to initialize State Engine');
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Shutdown the State Engine gracefully
   */
  async shutdown(): Promise<void> {
    try {
      logger.info({ workspaceId: this.config.workspaceId }, 'Shutting down State Engine');

      // Force persist any pending changes
      await this.sync.forcePersist();

      // Cleanup resources
      await this.sync.cleanup();

      this.isReady = false;

      logger.info({ workspaceId: this.config.workspaceId }, 'State Engine shut down successfully');
    } catch (error) {
      logger.error({ error, workspaceId: this.config.workspaceId }, 'Error during State Engine shutdown');
      throw error;
    }
  }

  /**
   * Check if the State Engine is ready
   */
  getIsReady(): boolean {
    return this.isReady;
  }

  // ===========================================================================
  // Patch Operations
  // ===========================================================================

  /**
   * Apply a patch to the graph
   */
  async applyPatch(patch: NOGPatch): Promise<void> {
    this.ensureReady();
    await this.sync.handlePatch(patch);
  }

  /**
   * Apply multiple patches
   */
  async applyPatches(patches: NOGPatch[]): Promise<void> {
    this.ensureReady();
    await this.sync.handlePatches(patches);
  }

  // ===========================================================================
  // Entity Operations
  // ===========================================================================

  /**
   * Add an entity to the graph
   */
  addEntity(entity: NOGEntity): void {
    this.ensureReady();
    this.nog.addEntity(entity);
  }

  /**
   * Update an entity
   */
  updateEntity(entityId: string, updates: Partial<Omit<NOGEntity, 'id' | 'createdAt' | 'version'>>): void {
    this.ensureReady();
    this.nog.updateEntity(entityId, updates);
  }

  /**
   * Remove an entity
   */
  removeEntity(entityId: string): void {
    this.ensureReady();
    this.nog.removeEntity(entityId);
  }

  /**
   * Get an entity by ID
   */
  getEntity(entityId: string): NOGEntity | undefined {
    this.ensureReady();
    return this.nog.getEntity(entityId);
  }

  /**
   * Check if an entity exists
   */
  hasEntity(entityId: string): boolean {
    this.ensureReady();
    return this.nog.hasEntity(entityId);
  }

  // ===========================================================================
  // Relationship Operations
  // ===========================================================================

  /**
   * Add a relationship to the graph
   */
  addRelationship(relationship: NOGRelationship): void {
    this.ensureReady();
    this.nog.addRelationship(relationship);
  }

  /**
   * Remove a relationship
   */
  removeRelationship(relationshipId: string): void {
    this.ensureReady();
    this.nog.removeRelationship(relationshipId);
  }

  /**
   * Get a relationship by ID
   */
  getRelationship(relationshipId: string): NOGRelationship | undefined {
    this.ensureReady();
    return this.nog.getRelationship(relationshipId);
  }

  // ===========================================================================
  // Graph Access
  // ===========================================================================

  /**
   * Get the current graph (readonly)
   */
  getGraph(): Readonly<NOGGraph> {
    this.ensureReady();
    return this.nog.getGraph();
  }

  /**
   * Get a JSON snapshot of the graph
   */
  getSnapshot(): NOGGraphJSON {
    this.ensureReady();
    return this.nog.getSnapshot().graph;
  }

  /**
   * Get graph statistics
   */
  getStats(): NOGGraphStats {
    this.ensureReady();
    return this.nog.getStats();
  }

  /**
   * Get graph version
   */
  getVersion(): number {
    this.ensureReady();
    return this.nog.getVersion();
  }

  // ===========================================================================
  // Query Operations
  // ===========================================================================

  /**
   * Find entities by panel
   */
  findEntitiesByPanel(panelId: string): NOGEntity[] {
    this.ensureReady();
    return findEntitiesByPanel(this.nog.getGraph(), panelId);
  }

  /**
   * Find entities by category
   */
  findEntitiesByCategory(category: NOGEntity['category']): NOGEntity[] {
    this.ensureReady();
    return findEntitiesByCategory(this.nog.getGraph(), category);
  }

  /**
   * Get entity with relationships
   */
  getEntityWithRelationships(entityId: string) {
    this.ensureReady();
    return getEntityWithRelationships(this.nog.getGraph(), entityId);
  }

  // ===========================================================================
  // Persistence Operations
  // ===========================================================================

  /**
   * Force immediate persistence (bypass debounce)
   */
  async forcePersist(): Promise<void> {
    this.ensureReady();
    await this.sync.forcePersist();
  }

  /**
   * Reload NOG from disk (discarding in-memory changes)
   */
  async reload(): Promise<void> {
    this.ensureReady();
    logger.warn({ workspaceId: this.config.workspaceId }, 'Reloading NOG from disk');
    await this.sync.hydrate();
  }

  /**
   * Check if there are pending changes
   */
  hasPendingChanges(): boolean {
    if (!this.isReady) return false;
    return this.sync.hasPendingChanges();
  }

  // ===========================================================================
  // Git Operations
  // ===========================================================================

  /**
   * Get current Git branch
   */
  async getCurrentBranch(): Promise<string> {
    this.ensureReady();
    return await this.git.getCurrentBranch();
  }

  /**
   * Create a shadow branch for AI operations
   */
  async createShadowBranch(taskId: string) {
    this.ensureReady();
    return await this.git.createShadowBranch(taskId);
  }

  /**
   * Checkout a branch
   */
  async checkout(branchName?: string): Promise<void> {
    this.ensureReady();
    await this.git.checkout(branchName);
    // Reload NOG after checkout
    await this.reload();
  }

  /**
   * Delete a shadow branch
   */
  async deleteShadowBranch(branchName: string): Promise<void> {
    this.ensureReady();
    await this.git.deleteBranch(branchName, true);
  }

  /**
   * List all shadow branches
   */
  async listShadowBranches(): Promise<string[]> {
    this.ensureReady();
    return await this.git.listShadowBranches();
  }

  /**
   * Clean up old shadow branches
   */
  async cleanupShadowBranches(olderThanMs?: number): Promise<number> {
    this.ensureReady();
    return await this.git.cleanupShadowBranches(olderThanMs);
  }

  /**
   * Manual commit (useful for explicit saves)
   */
  async commit(message: string): Promise<string> {
    this.ensureReady();
    const result = await this.git.commit(message);
    return result.hash;
  }

  // ===========================================================================
  // Status & Monitoring
  // ===========================================================================

  /**
   * Get the current status of the State Engine
   */
  getStatus(): StateEngineStatus {
    const graph = this.isReady ? this.nog.getGraph() : null;
    const syncStats = this.isReady ? this.sync.getStats() : null;

    return {
      isReady: this.isReady,
      workspaceId: this.config.workspaceId,
      workspaceName: this.config.workspaceName,
      graphVersion: graph?.version ?? 0,
      entityCount: graph?.entities.size ?? 0,
      relationshipCount: graph?.relationships.size ?? 0,
      hasPendingChanges: this.hasPendingChanges(),
      ...(syncStats?.lastSyncAt !== undefined && { lastSyncAt: syncStats.lastSyncAt }),
      stats: this.isReady ? this.nog.getStats() : ({} as NOGGraphStats),
    };
  }

  /**
   * Get workspace ID
   */
  getWorkspaceId(): string {
    return this.config.workspaceId;
  }

  /**
   * Get workspace root directory
   */
  getWorkspaceRoot(): string {
    return this.config.workspaceRoot;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Ensure the engine is ready before operations
   */
  private ensureReady(): void {
    if (!this.isReady) {
      throw new Error('StateEngine not ready. Call init() first.');
    }
  }

  /**
   * Setup event forwarding from sub-components
   */
  private setupEventForwarding(): void {
    // Forward NOG events
    this.nog.on('graph:updated', (graph) => {
      this.emit('graph:updated', graph);
    });

    this.nog.on('entity:created', (entity) => {
      this.emit('entity:created', entity);
    });

    this.nog.on('entity:updated', (entityId, entity) => {
      this.emit('entity:updated', entityId, entity);
    });

    this.nog.on('entity:deleted', (entityId) => {
      this.emit('entity:deleted', entityId);
    });

    this.nog.on('patch:applied', (patch) => {
      this.emit('patch:applied', patch);
    });

    // Forward Sync events
    this.sync.on('sync:completed', (filesWritten, commitHash) => {
      this.emit('sync:completed', filesWritten, commitHash);
    });

    this.sync.on('sync:failed', (error) => {
      this.emit('error', error);
    });
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create and initialize a State Engine
 */
export async function createStateEngine(config: StateEngineConfig): Promise<StateEngine> {
  const engine = new StateEngine(config);
  await engine.init();
  return engine;
}
