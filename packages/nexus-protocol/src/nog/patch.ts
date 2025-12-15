/**
 * @fileoverview NOG Patch and Sync definitions
 * @module @nexus/protocol/nog/patch
 * 
 * Patches represent changes to the NOG that need to be synchronized
 * across panels. They are the core of the Explicit Sync Workflow:
 * 
 * 1. User modifies Panel A
 * 2. NexusOS updates NOG
 * 3. NexusOS calculates patches for affected panels
 * 4. Patches enter "Pending Review" state
 * 5. User reviews and accepts/rejects patches
 * 6. Accepted patches are applied to target panels
 */

import type { NOGEntity } from './entity';
import type { NOGRelationship } from './relationship';

// =============================================================================
// Patch Operations
// =============================================================================

/**
 * Patch operation type
 */
export type PatchOperation = 
  | 'create'   // Create new entity/relationship
  | 'update'   // Modify existing entity/relationship
  | 'delete'   // Remove entity/relationship
  | 'move'     // Change parent (for tree structures)
  | 'merge'    // Combine two entities
  | 'split';   // Divide one entity into multiple

/**
 * Patch status in the review workflow
 */
export type PatchStatus =
  | 'pending'    // Waiting for review
  | 'approved'   // User approved, ready to apply
  | 'rejected'   // User rejected
  | 'applied'    // Successfully applied
  | 'failed'     // Application failed
  | 'expired';   // Timed out without review

// =============================================================================
// Patch Definitions
// =============================================================================

/**
 * Base patch interface
 */
export interface BasePatch {
  /**
   * Unique patch ID
   */
  id: string;
  
  /**
   * Operation type
   */
  operation: PatchOperation;
  
  /**
   * Source panel that triggered the change
   */
  sourcePanel: string;
  
  /**
   * Target panel to apply the patch to
   */
  targetPanel: string;
  
  /**
   * Patch status
   */
  status: PatchStatus;
  
  /**
   * Human-readable description of the change
   */
  description: string;
  
  /**
   * AI-generated reasoning for the change
   */
  reasoning?: string;
  
  /**
   * Confidence score (0-1)
   */
  confidence: number;
  
  /**
   * Creation timestamp
   */
  createdAt: number;
  
  /**
   * Review timestamp (if reviewed)
   */
  reviewedAt?: number;
  
  /**
   * Application timestamp (if applied)
   */
  appliedAt?: number;
}

/**
 * Patch for entity operations
 */
export interface EntityPatch extends BasePatch {
  patchType: 'entity';
  
  /**
   * Target entity ID (for update/delete)
   */
  entityId?: string;
  
  /**
   * Entity data for create/update
   */
  data?: Partial<NOGEntity>;
  
  /**
   * Previous state for undo
   */
  previousState?: NOGEntity;
}

/**
 * Patch for relationship operations
 */
export interface RelationshipPatch extends BasePatch {
  patchType: 'relationship';
  
  /**
   * Target relationship ID (for update/delete)
   */
  relationshipId?: string;
  
  /**
   * Relationship data for create/update
   */
  data?: Partial<NOGRelationship>;
  
  /**
   * Previous state for undo
   */
  previousState?: NOGRelationship;
}

/**
 * Patch for view-level changes (e.g., NXML updates)
 */
export interface ViewPatch extends BasePatch {
  patchType: 'view';
  
  /**
   * JSON path to the changed element
   */
  path: string[];
  
  /**
   * New value
   */
  value: unknown;
  
  /**
   * Previous value for undo
   */
  previousValue?: unknown;
  
  /**
   * NXML diff (for code review)
   */
  nxmlDiff?: string;
}

/**
 * Union of all patch types
 */
export type NOGPatch = EntityPatch | RelationshipPatch | ViewPatch;

// =============================================================================
// Patch Set
// =============================================================================

/**
 * A collection of related patches
 */
export interface PatchSet {
  /**
   * Patch set ID
   */
  id: string;
  
  /**
   * All patches in this set
   */
  patches: NOGPatch[];
  
  /**
   * Source panel that triggered the sync
   */
  sourcePanel: string;
  
  /**
   * Target panels affected
   */
  targetPanels: string[];
  
  /**
   * Overall status
   */
  status: PatchSetStatus;
  
  /**
   * Summary description
   */
  summary: string;
  
  /**
   * Creation timestamp
   */
  createdAt: number;
  
  /**
   * NOG version at creation
   */
  nogVersion: number;
}

export type PatchSetStatus =
  | 'pending'     // Has pending patches
  | 'approved'    // All patches approved
  | 'partial'     // Some approved, some rejected
  | 'rejected'    // All rejected
  | 'applied'     // All applied
  | 'conflict';   // Has conflicts

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Generate a unique patch ID
 */
export function generatePatchId(): string {
  return `patch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a unique patch set ID
 */
export function generatePatchSetId(): string {
  return `pset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create an entity patch
 */
export function createEntityPatch(
  operation: PatchOperation,
  sourcePanel: string,
  targetPanel: string,
  options: {
    entityId?: string;
    data?: Partial<NOGEntity>;
    previousState?: NOGEntity;
    description: string;
    reasoning?: string;
    confidence?: number;
  }
): EntityPatch {
  return {
    id: generatePatchId(),
    patchType: 'entity',
    operation,
    sourcePanel,
    targetPanel,
    status: 'pending',
    description: options.description,
    ...(options.reasoning !== undefined && { reasoning: options.reasoning }),
    confidence: options.confidence ?? 0.8,
    ...(options.entityId !== undefined && { entityId: options.entityId }),
    ...(options.data !== undefined && { data: options.data }),
    ...(options.previousState !== undefined && { previousState: options.previousState }),
    createdAt: Date.now(),
  };
}

/**
 * Create a relationship patch
 */
export function createRelationshipPatch(
  operation: PatchOperation,
  sourcePanel: string,
  targetPanel: string,
  options: {
    relationshipId?: string;
    data?: Partial<NOGRelationship>;
    previousState?: NOGRelationship;
    description: string;
    reasoning?: string;
    confidence?: number;
  }
): RelationshipPatch {
  return {
    id: generatePatchId(),
    patchType: 'relationship',
    operation,
    sourcePanel,
    targetPanel,
    status: 'pending',
    description: options.description,
    ...(options.reasoning !== undefined && { reasoning: options.reasoning }),
    confidence: options.confidence ?? 0.8,
    ...(options.relationshipId !== undefined && { relationshipId: options.relationshipId }),
    ...(options.data !== undefined && { data: options.data }),
    ...(options.previousState !== undefined && { previousState: options.previousState }),
    createdAt: Date.now(),
  };
}

/**
 * Create a view patch
 */
export function createViewPatch(
  operation: PatchOperation,
  sourcePanel: string,
  targetPanel: string,
  options: {
    path: string[];
    value: unknown;
    previousValue?: unknown;
    nxmlDiff?: string;
    description: string;
    reasoning?: string;
    confidence?: number;
  }
): ViewPatch {
  return {
    id: generatePatchId(),
    patchType: 'view',
    operation,
    sourcePanel,
    targetPanel,
    status: 'pending',
    description: options.description,
    ...(options.reasoning !== undefined && { reasoning: options.reasoning }),
    confidence: options.confidence ?? 0.8,
    path: options.path,
    value: options.value,
    ...(options.previousValue !== undefined && { previousValue: options.previousValue }),
    ...(options.nxmlDiff !== undefined && { nxmlDiff: options.nxmlDiff }),
    createdAt: Date.now(),
  };
}

/**
 * Create a patch set
 */
export function createPatchSet(
  sourcePanel: string,
  patches: NOGPatch[],
  summary: string,
  nogVersion: number
): PatchSet {
  const targetPanels = [...new Set(patches.map(p => p.targetPanel))];
  
  return {
    id: generatePatchSetId(),
    patches,
    sourcePanel,
    targetPanels,
    status: 'pending',
    summary,
    createdAt: Date.now(),
    nogVersion,
  };
}

// =============================================================================
// Patch Operations
// =============================================================================

/**
 * Approve a patch
 */
export function approvePatch<T extends NOGPatch>(patch: T): T {
  return {
    ...patch,
    status: 'approved',
    reviewedAt: Date.now(),
  };
}

/**
 * Reject a patch
 */
export function rejectPatch<T extends NOGPatch>(patch: T): T {
  return {
    ...patch,
    status: 'rejected',
    reviewedAt: Date.now(),
  };
}

/**
 * Mark a patch as applied
 */
export function markPatchApplied<T extends NOGPatch>(patch: T): T {
  return {
    ...patch,
    status: 'applied',
    appliedAt: Date.now(),
  };
}

/**
 * Mark a patch as failed
 */
export function markPatchFailed<T extends NOGPatch>(patch: T): T {
  return {
    ...patch,
    status: 'failed',
    appliedAt: Date.now(),
  };
}

/**
 * Update patch set status based on individual patch statuses
 */
export function updatePatchSetStatus(patchSet: PatchSet): PatchSet {
  const statuses = patchSet.patches.map(p => p.status);
  
  let newStatus: PatchSetStatus;
  
  if (statuses.every(s => s === 'pending')) {
    newStatus = 'pending';
  } else if (statuses.every(s => s === 'approved' || s === 'applied')) {
    newStatus = statuses.every(s => s === 'applied') ? 'applied' : 'approved';
  } else if (statuses.every(s => s === 'rejected')) {
    newStatus = 'rejected';
  } else if (statuses.some(s => s === 'approved') && statuses.some(s => s === 'rejected')) {
    newStatus = 'partial';
  } else {
    newStatus = 'pending';
  }
  
  return {
    ...patchSet,
    status: newStatus,
  };
}

// =============================================================================
// Type Guards
// =============================================================================

export function isEntityPatch(patch: NOGPatch): patch is EntityPatch {
  return patch.patchType === 'entity';
}

export function isRelationshipPatch(patch: NOGPatch): patch is RelationshipPatch {
  return patch.patchType === 'relationship';
}

export function isViewPatch(patch: NOGPatch): patch is ViewPatch {
  return patch.patchType === 'view';
}
