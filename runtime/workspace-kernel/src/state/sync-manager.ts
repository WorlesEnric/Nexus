/**
 * Sync Manager - Orchestrates debounced persistence of NOG to disk
 *
 * The Sync Manager follows the Explicit Sync Workflow:
 * 1. Receive patch from UI or AI
 * 2. Apply to in-memory NOG (immediate)
 * 3. Debounce disk writes to prevent thrashing
 * 4. Persist to NXML files via Git
 *
 * This ensures fast UI updates while maintaining durable storage.
 */

import debounce from 'debounce';
import { NOGPatch, findEntitiesByPanel } from '@nexus/protocol';
import { GitService } from './git-service';
import { NOGManager } from './nog-manager';
import { parseNXMLToEntities, generateNXMLFromEntities } from './mappers/nxml';
import { logger } from '../logger';
import { EventEmitter } from 'events';

// =============================================================================
// Types
// =============================================================================

export interface SyncManagerConfig {
  /**
   * Debounce delay in milliseconds (default: 1000ms)
   */
  debounceDelay?: number;

  /**
   * Auto-commit changes to Git (default: true)
   */
  autoCommit?: boolean;

  /**
   * Commit message prefix for auto-commits
   */
  commitPrefix?: string;
}

export interface SyncManagerEvents {
  'sync:started': () => void;
  'sync:completed': (filesWritten: number, commitHash: string) => void;
  'sync:failed': (error: Error) => void;
  'patch:queued': (patch: NOGPatch) => void;
  'patch:applied': (patch: NOGPatch) => void;
}

export interface SyncStats {
  totalPatches: number;
  appliedPatches: number;
  failedPatches: number;
  totalSyncs: number;
  lastSyncAt?: number;
  lastCommitHash?: string;
}

// =============================================================================
// SyncManager Class
// =============================================================================

/**
 * SyncManager - Coordinates patch application and persistence
 */
export class SyncManager extends EventEmitter {
  private readonly git: GitService;
  private readonly nog: NOGManager;
  private readonly config: Required<SyncManagerConfig>;

  private debouncedPersist: () => void;
  private pendingPatches: NOGPatch[] = [];
  private isPersisting: boolean = false;
  private stats: SyncStats;

  constructor(git: GitService, nog: NOGManager, config: SyncManagerConfig = {}) {
    super();

    this.git = git;
    this.nog = nog;

    // Merge config with defaults
    this.config = {
      debounceDelay: config.debounceDelay ?? 1000,
      autoCommit: config.autoCommit ?? true,
      commitPrefix: config.commitPrefix ?? 'Auto-save:',
    };

    // Create debounced persist function
    this.debouncedPersist = debounce(this.persist.bind(this), this.config.debounceDelay);

    // Initialize stats
    this.stats = {
      totalPatches: 0,
      appliedPatches: 0,
      failedPatches: 0,
      totalSyncs: 0,
    };

    // Listen to NOG events for automatic persistence
    this.setupNOGListeners();

    logger.info(
      {
        debounceDelay: this.config.debounceDelay,
        autoCommit: this.config.autoCommit,
      },
      'SyncManager initialized'
    );
  }

  // ===========================================================================
  // Patch Handling
  // ===========================================================================

  /**
   * Handle a patch by applying it to NOG and scheduling persistence
   */
  async handlePatch(patch: NOGPatch): Promise<void> {
    try {
      this.stats.totalPatches++;
      this.emit('patch:queued', patch);

      logger.debug(
        {
          patchId: patch.id,
          operation: patch.operation,
          patchType: patch.patchType,
        },
        'Handling patch'
      );

      // Step 1: Apply patch to in-memory NOG (immediate)
      this.nog.applyPatch(patch);

      this.stats.appliedPatches++;
      this.pendingPatches.push(patch);
      this.emit('patch:applied', patch);

      // Step 2: Schedule debounced persistence
      this.debouncedPersist();
    } catch (error) {
      this.stats.failedPatches++;
      logger.error({ error, patch }, 'Failed to handle patch');
      throw error;
    }
  }

  /**
   * Handle multiple patches in sequence
   */
  async handlePatches(patches: NOGPatch[]): Promise<void> {
    logger.info({ count: patches.length }, 'Handling multiple patches');

    for (const patch of patches) {
      try {
        await this.handlePatch(patch);
      } catch (error) {
        logger.error({ error, patchId: patch.id }, 'Failed to handle patch in batch');
        // Continue with remaining patches
      }
    }
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  /**
   * Persist the current NOG state to disk
   * This is the core synchronization logic
   */
  private async persist(): Promise<void> {
    // Prevent concurrent persistence
    if (this.isPersisting) {
      logger.debug('Persistence already in progress, skipping');
      return;
    }

    this.isPersisting = true;
    this.emit('sync:started');

    try {
      logger.info('Starting NOG persistence to disk');

      const graph = this.nog.getGraph();
      const entities = Array.from(graph.entities.values()) as any[];

      // Group entities by sourcePanel
      const panelGroups = new Map<string, typeof entities>();

      for (const entity of entities) {
        if (entity.sourcePanel) {
          if (!panelGroups.has(entity.sourcePanel)) {
            panelGroups.set(entity.sourcePanel, []);
          }
          panelGroups.get(entity.sourcePanel)!.push(entity);
        }
      }

      logger.debug(
        {
          panelCount: panelGroups.size,
          entityCount: entities.length,
        },
        'Grouped entities by panel'
      );

      // Write each panel to its NXML file
      let filesWritten = 0;

      for (const [panelFile, panelEntities] of panelGroups) {
        try {
          // Extract panel ID from filename
          const panelId = panelFile.replace(/\.nxml$/, '');

          // Generate NXML content
          const nxmlContent = generateNXMLFromEntities(panelId, panelEntities);

          // Write to file
          await this.git.writeFile(panelFile, nxmlContent);
          filesWritten++;

          logger.debug({ panelFile }, 'Wrote NXML file');
        } catch (error) {
          logger.error({ error, panelFile }, 'Failed to write NXML file, continuing');
          // Continue with other files
        }
      }

      // Commit changes to Git
      let commitHash = '';

      if (this.config.autoCommit && filesWritten > 0) {
        const patchSummary = this.getPatchSummary();
        const commitMessage = `${this.config.commitPrefix} ${patchSummary}`;

        const result = await this.git.commit(commitMessage);
        commitHash = result.hash;

        logger.info(
          {
            commitHash,
            filesChanged: result.filesChanged,
            message: commitMessage,
          },
          'Committed changes to Git'
        );
      }

      // Update stats
      this.stats.totalSyncs++;
      this.stats.lastSyncAt = Date.now();
      if (commitHash !== undefined) {
        this.stats.lastCommitHash = commitHash;
      }

      // Clear pending patches
      this.pendingPatches = [];

      this.emit('sync:completed', filesWritten, commitHash);

      logger.info(
        {
          filesWritten,
          commitHash,
          totalSyncs: this.stats.totalSyncs,
        },
        'NOG persistence completed'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to persist NOG to disk');
      this.emit('sync:failed', error as Error);
      throw error;
    } finally {
      this.isPersisting = false;
    }
  }

  /**
   * Force immediate persistence (bypass debounce)
   */
  async forcePersist(): Promise<void> {
    logger.info('Forcing immediate persistence');

    // Cancel pending debounced call
    if (this.debouncedPersist) {
      (this.debouncedPersist as any).clear?.();
    }

    await this.persist();
  }

  // ===========================================================================
  // Hydration (Loading from Disk)
  // ===========================================================================

  /**
   * Load NOG state from NXML files on disk
   * This is typically called on startup
   */
  async hydrate(): Promise<void> {
    try {
      logger.info('Hydrating NOG from disk');

      // List all NXML files
      const nxmlFiles = await this.git.listFiles('.*\\.nxml');

      if (nxmlFiles.length === 0) {
        logger.info('No NXML files found, starting with empty NOG');
        return;
      }

      logger.debug({ fileCount: nxmlFiles.length }, 'Found NXML files');

      // Parse each file and collect entities
      const allEntities = [];
      const allRelationships = [];

      for (const file of nxmlFiles) {
        try {
          const content = await this.git.readFile(file);
          const parsed = parseNXMLToEntities(file, content);

          allEntities.push(...parsed.entities);
          allRelationships.push(...parsed.relationships);

          logger.debug(
            {
              file,
              entityCount: parsed.entities.length,
              relationshipCount: parsed.relationships.length,
            },
            'Parsed NXML file'
          );
        } catch (error) {
          logger.error({ error, file }, 'Failed to parse NXML file, skipping');
          // Continue with other files
        }
      }

      // Replace NOG with loaded entities
      this.nog.replaceGraph(allEntities, allRelationships);

      logger.info(
        {
          fileCount: nxmlFiles.length,
          entityCount: allEntities.length,
          relationshipCount: allRelationships.length,
        },
        'Successfully hydrated NOG from disk'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to hydrate NOG from disk');
      throw error;
    }
  }

  // ===========================================================================
  // Stats & Monitoring
  // ===========================================================================

  /**
   * Get synchronization statistics
   */
  getStats(): Readonly<SyncStats> {
    return { ...this.stats };
  }

  /**
   * Check if there are pending changes waiting to be persisted
   */
  hasPendingChanges(): boolean {
    return this.pendingPatches.length > 0 || this.isPersisting;
  }

  /**
   * Get a summary of pending patches
   */
  private getPatchSummary(): string {
    if (this.pendingPatches.length === 0) {
      return 'No changes';
    }

    const operations = this.pendingPatches.map((p) => p.operation);
    const opCounts = new Map<string, number>();

    for (const op of operations) {
      opCounts.set(op, (opCounts.get(op) ?? 0) + 1);
    }

    const summary = Array.from(opCounts.entries())
      .map(([op, count]) => `${count} ${op}`)
      .join(', ');

    return `Applied patches (${summary})`;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Setup listeners for NOG events to trigger automatic persistence
   */
  private setupNOGListeners(): void {
    // Listen to graph updates to schedule persistence
    this.nog.on('graph:updated', () => {
      this.debouncedPersist();
    });

    // Listen to patch application
    this.nog.on('patch:applied', (patch) => {
      logger.debug({ patchId: patch.id }, 'NOG patch applied');
    });

    this.nog.on('patch:failed', (patch, error) => {
      logger.error({ error, patchId: patch.id }, 'NOG patch application failed');
    });
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Cleanup resources and force final persistence
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up SyncManager');

    // Force persist any pending changes
    if (this.hasPendingChanges()) {
      await this.forcePersist();
    }

    // Remove all listeners
    this.removeAllListeners();
  }
}
