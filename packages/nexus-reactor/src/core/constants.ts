/**
 * @nexus/reactor - Constants
 * 
 * Configuration constants for the Nexus Reactor runtime.
 */

import type { ColumnSpan } from './types';

// ============================================================================
// Layout Constants
// ============================================================================

/**
 * Total columns in the grid system
 */
export const GRID_COLUMNS = 12;

/**
 * Component weights for auto-layout (12-column grid)
 * Determines default column span for each component type
 */
export const COMPONENT_WEIGHTS: Record<string, ColumnSpan> = {
  // Small components (4 per row)
  Metric: 3,
  StatusBadge: 3,
  Switch: 3,
  Button: 3,
  Action: 3,
  
  // Medium components (2 per row)
  Chart: 6,
  Input: 6,
  
  // Full-width components (1 per row)
  LogStream: 12,
  Text: 12,
  Container: 12,
  Layout: 12,
  
  // Control flow (inherit from children)
  If: 12,
  Iterate: 12,
  
  // Default for unknown components
  default: 6,
};

/**
 * Get the weight (column span) for a component type
 */
export function getComponentWeight(componentType: string): ColumnSpan {
  return COMPONENT_WEIGHTS[componentType] ?? COMPONENT_WEIGHTS['default'] ?? 6;
}

/**
 * Gap size mappings to CSS values
 */
export const GAP_SIZES: Record<string, string> = {
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
};

// ============================================================================
// Sandbox Constants
// ============================================================================

/**
 * Globals that must be shadowed (set to undefined) in the sandbox
 */
export const FORBIDDEN_GLOBALS = [
  'window',
  'document',
  'globalThis',
  'self',
  'frames',
  'parent',
  'top',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
  'SharedWorker',
  'ServiceWorker',
  'eval',
  'Function',
  'importScripts',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'cookieStore',
  'navigator',
  'location',
  'history',
  'alert',
  'confirm',
  'prompt',
  'open',
  'close',
  'print',
  'postMessage',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'queueMicrotask',
  'crypto',
  'performance',
];

/**
 * Maximum execution time for synchronous handlers (ms)
 */
export const HANDLER_TIMEOUT_MS = 500;

/**
 * Maximum recursion depth for reactive updates
 */
export const MAX_RECURSION_DEPTH = 50;

/**
 * Maximum number of state updates per tick
 */
export const MAX_UPDATES_PER_TICK = 1000;

// ============================================================================
// Parser Constants
// ============================================================================

/**
 * Valid identifier pattern (JavaScript identifier rules)
 */
export const IDENTIFIER_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Binding expression pattern: {expression}
 */
export const BINDING_PATTERN = /^\{(.+)\}$/;

/**
 * State reference pattern in expressions
 */
export const STATE_REF_PATTERN = /\$state\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

/**
 * Scope reference pattern in expressions
 */
export const SCOPE_REF_PATTERN = /\$scope\.([a-zA-Z_$][a-zA-Z0-9_$\.]*)/g;

/**
 * Extension usage pattern in handler code
 */
export const EXT_USAGE_PATTERN = /\$ext\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

/**
 * Extension name format pattern
 */
export const EXTENSION_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/;

// ============================================================================
// View Constants
// ============================================================================

/**
 * Components that are considered "control flow" (don't render themselves)
 */
export const CONTROL_FLOW_COMPONENTS = ['If', 'Iterate'];

/**
 * Components that are "structural" (layout containers)
 */
export const STRUCTURAL_COMPONENTS = ['Layout', 'Container'];

/**
 * Standard Component Library (SCL) component types
 */
export const SCL_COMPONENTS = [
  'Layout',
  'Container',
  'If',
  'Iterate',
  'Text',
  'Metric',
  'StatusBadge',
  'LogStream',
  'Chart',
  'Input',
  'Button',
  'Action',
  'Switch',
];

// ============================================================================
// Event Constants
// ============================================================================

/**
 * Built-in emit events
 */
export const EMIT_EVENTS = {
  TOAST: 'toast',
  MODAL: 'modal',
  NAVIGATE: 'navigate',
  ERROR: 'system:error',
  LOG: 'system:log',
} as const;

// ============================================================================
// Validation Constants
// ============================================================================

/**
 * Error codes for validation
 */
export const ERROR_CODES = {
  // Syntax errors
  PARSE_ERROR: 'PARSE_ERROR',
  INVALID_XML: 'INVALID_XML',
  
  // Schema errors
  INVALID_IDENTIFIER: 'INVALID_IDENTIFIER',
  INVALID_TYPE: 'INVALID_TYPE',
  MISSING_REQUIRED: 'MISSING_REQUIRED',
  
  // Uniqueness errors
  DUPLICATE_STATE: 'DUPLICATE_STATE',
  DUPLICATE_TOOL: 'DUPLICATE_TOOL',
  DUPLICATE_VIEW_ID: 'DUPLICATE_VIEW_ID',
  DUPLICATE_EXTENSION_ALIAS: 'DUPLICATE_EXTENSION_ALIAS',
  DUPLICATE_LIFECYCLE: 'DUPLICATE_LIFECYCLE',
  
  // Reference errors
  UNDEFINED_STATE_REFERENCE: 'UNDEFINED_STATE_REFERENCE',
  UNDEFINED_TOOL_REFERENCE: 'UNDEFINED_TOOL_REFERENCE',
  INVALID_SCOPE_REFERENCE: 'INVALID_SCOPE_REFERENCE',
  UNDECLARED_EXTENSION: 'UNDECLARED_EXTENSION',
  
  // Security errors
  FORBIDDEN_GLOBAL: 'FORBIDDEN_GLOBAL',
  
  // Runtime errors
  TIMEOUT: 'TIMEOUT',
  RECURSION_LIMIT: 'RECURSION_LIMIT',
  SANDBOX_ERROR: 'SANDBOX_ERROR',
} as const;

/**
 * Warning codes for validation
 */
export const WARNING_CODES = {
  UNUSED_STATE: 'UNUSED_STATE',
  UNUSED_TOOL: 'UNUSED_TOOL',
  NO_MOUNT_WITH_EXTENSIONS: 'NO_MOUNT_WITH_EXTENSIONS',
} as const;

// ============================================================================
// Type Coercion Constants
// ============================================================================

/**
 * Default values for each NXML primitive type
 */
export const DEFAULT_VALUES: Record<string, unknown> = {
  string: '',
  number: 0,
  boolean: false,
  list: [],
  object: {},
};

/**
 * Truthy string values for boolean coercion
 */
export const TRUTHY_STRINGS = ['true', 'yes', '1', 'on'];

/**
 * Falsy string values for boolean coercion
 */
export const FALSY_STRINGS = ['false', 'no', '0', 'off', ''];