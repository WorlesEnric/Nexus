/**
 * TriLog TypeScript SDK
 *
 * Model-Driven Observability for TypeScript applications
 *
 * @packageDocumentation
 */

// DSL - Schema definition
export { TrilogObject, TrilogProcess } from './dsl/base';
export { field, Field, FieldOptions, getFieldMetadata, FIELDS_METADATA_KEY } from './dsl/fields';
export { Registry } from './dsl/registry';

// Context - Anchoring and propagation
export {
  anchor,
  anchored,
  getCurrentAnchor,
  getCurrentObjId,
  getCurrentObjType,
  getAnchorStack,
  getAnchorDepth,
  getRootAnchor,
  AnchorContext,
} from './context/anchor';

export {
  setupOtel,
  setupOtelKubernetes,
  setupOtelLocal,
  getOtelSDK,
  shutdownOtel,
  OtelSetupOptions,
} from './context/otel-setup';

// Logger - Logging interface
export { TriLogLogger, createLogger, LogSeverity } from './logger/trilog-logger';

// Re-export commonly used types
export type { typeof TrilogObject as TrilogObjectType } from './dsl/base';
export type { typeof TrilogProcess as TrilogProcessType } from './dsl/base';
