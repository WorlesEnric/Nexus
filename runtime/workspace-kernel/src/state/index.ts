/**
 * State Engine - Public API
 *
 * This module provides the public API for the Nexus State Engine (Phase 3).
 * The State Engine manages the persistent state of a workspace by:
 * - Maintaining an in-memory semantic graph (NOG)
 * - Synchronizing with Git-backed NXML files
 * - Providing debounced persistence
 * - Supporting shadow branches for AI operations
 *
 * @example
 * ```typescript
 * import { createStateEngine } from './state';
 *
 * const engine = await createStateEngine({
 *   workspaceId: 'ws-123',
 *   workspaceName: 'My Workspace',
 *   workspaceRoot: '/path/to/workspace'
 * });
 *
 * // Apply patches
 * await engine.applyPatch(patch);
 *
 * // Query entities
 * const entities = engine.findEntitiesByPanel('panel.nxml');
 *
 * // Force persistence
 * await engine.forcePersist();
 * ```
 */

// =============================================================================
// Core State Engine
// =============================================================================

export {
  StateEngine,
  createStateEngine,
  type StateEngineConfig,
  type StateEngineEvents,
  type StateEngineStatus,
} from './engine';

// =============================================================================
// Git Service
// =============================================================================

export {
  GitService,
  type GitServiceConfig,
  type CommitResult,
  type ShadowBranchInfo,
} from './git-service';

// =============================================================================
// NOG Manager
// =============================================================================

export {
  NOGManager,
  type NOGManagerConfig,
  type NOGManagerEvents,
  type GraphSnapshot,
} from './nog-manager';

// =============================================================================
// Sync Manager
// =============================================================================

export {
  SyncManager,
  type SyncManagerConfig,
  type SyncManagerEvents,
  type SyncStats,
} from './sync-manager';

// =============================================================================
// NXML Mapper
// =============================================================================

export {
  parseNXMLToEntities,
  generateNXMLFromEntities,
  type ParsedPanel,
  type NXMLGenerationOptions,
} from './mappers/nxml';

// =============================================================================
// Re-export Protocol Types
// =============================================================================

// Re-export commonly used types from @nexus/protocol for convenience
export type {
  NOGGraph,
  NOGEntity,
  NOGRelationship,
  NOGPatch,
  EntityPatch,
  RelationshipPatch,
  ViewPatch,
  NOGGraphJSON,
  NOGGraphStats,
  EntityCategory,
  EntityStatus,
  PatchOperation,
  PatchStatus,
} from '@nexus/protocol';
