/**
 * @fileoverview NOG (Nexus Object Graph) module exports
 * @module @nexus/protocol/nog
 * 
 * The Nexus Object Graph is the "Runtime Semantic Truth" of a project.
 * It maintains semantic relationships across all panels in a workspace.
 */

// =============================================================================
// Entity Types and Functions
// =============================================================================

export type {
  EntityCategory,
  EntityStatus,
  NOGEntity,
  EntityPropertyValue,
  EntityRef,
  ConceptEntity,
  ComponentEntity,
  DataEntity,
  ActionEntity,
  ResourceEntity,
  ConstraintEntity,
  MilestoneEntity,
  NOGEntityTyped,
} from './entity';

export {
  isConceptEntity,
  isComponentEntity,
  isDataEntity,
  isActionEntity,
  isResourceEntity,
  isConstraintEntity,
  isMilestoneEntity,
  generateEntityId,
  createEntity,
  cloneEntity,
  updateEntity,
} from './entity';

// =============================================================================
// Relationship Types and Functions
// =============================================================================

export type {
  RelationshipType,
  RelationshipMeta,
  NOGRelationship,
  RelationshipRule,
} from './relationship';

export {
  RELATIONSHIP_RULES,
  generateRelationshipId,
  createRelationship,
  createInverseRelationship,
  isValidRelationship,
  getOutgoingRelationships,
  getIncomingRelationships,
  getEntityRelationships,
  getRelationshipsByType,
  findDirectRelationship,
} from './relationship';

// =============================================================================
// Graph Types and Functions
// =============================================================================

export type {
  NOGGraph,
  NOGGraphMeta,
  NOGGraphJSON,
  EntityWithRelationships,
  NOGGraphStats,
} from './graph';

export {
  createNOGGraph,
  serializeNOGGraph,
  deserializeNOGGraph,
  addEntity,
  removeEntity,
  updateEntityInGraph,
  addRelationship,
  removeRelationship,
  findEntitiesByCategory,
  findEntitiesByTag,
  findEntitiesByPanel,
  getEntityWithRelationships,
  findConnectedEntities,
  findPath,
  calculateGraphStats,
} from './graph';

// =============================================================================
// Patch Types and Functions
// =============================================================================

export type {
  PatchOperation,
  PatchStatus,
  BasePatch,
  EntityPatch,
  RelationshipPatch,
  ViewPatch,
  NOGPatch,
  PatchSet,
  PatchSetStatus,
} from './patch';

export {
  generatePatchId,
  generatePatchSetId,
  createEntityPatch,
  createRelationshipPatch,
  createViewPatch,
  createPatchSet,
  approvePatch,
  rejectPatch,
  markPatchApplied,
  markPatchFailed,
  updatePatchSetStatus,
  isEntityPatch,
  isRelationshipPatch,
  isViewPatch,
} from './patch';
