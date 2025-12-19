/**
 * Central export for all nexus-protocol types.
 *
 * Import from here to get all generated types and enums:
 * ```typescript
 * import { NOGEntity, EntityType, NexusPanelAST } from '@/types';
 * ```
 */

// Export generated interfaces
export * from './protocol.generated';

// Export manually defined enums
export * from './protocol-enums';

// Re-export commonly used types with aliases for convenience
export type {
  NOGEntity,
  NOGRelationship,
  NOGGraphSnapshot,
  NOGPatch,
  NOGQuery,
  NOGQueryResult,
  NexusPanelAST,
  PanelMeta,
  StateNode,
  ViewNode,
  ClientMessage,
  ServerMessage,
} from './protocol.generated';

export {
  EntityType,
  RelationType,
  PatchOperation,
  NXMLPrimitiveType,
} from './protocol-enums';
