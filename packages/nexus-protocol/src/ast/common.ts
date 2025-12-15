/**
 * @fileoverview Common types used across NXML AST definitions
 * @module @nexus/protocol/ast/common
 */

// =============================================================================
// Primitive Types
// =============================================================================

/**
 * Supported primitive types in NXML state definitions
 */
export type NXMLPrimitiveType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'list' 
  | 'object';

/**
 * JavaScript identifier pattern for variable names
 */
export type Identifier = string;

/**
 * Expression string that will be evaluated at runtime
 * Examples: "$state.count > 0", "$state.price * $state.qty"
 */
export type Expression = string;

/**
 * Binding expression with interpolation syntax
 * Examples: "{$state.user.name}", "{$scope.item.title}"
 */
export type BindingExpression = string;

/**
 * Handler code block that runs in the sandbox
 * 
 * Available Globals:
 * - $state: Reactive state proxy (read/write)
 * - $args: Tool arguments (read-only)
 * - $view: Imperative UI manipulation (e.g., $view.getElementById('id').setValue(val))
 * - $emit: Event emitter (e.g., $emit('toast', 'Saved'))
 * - $ext: Extensions (e.g., $ext.fs.readFile)
 * - console: Sandboxed console logging
 */
export type HandlerCode = string;

// =============================================================================
// Layout Types
// =============================================================================

/**
 * Layout strategy determines how children are arranged
 */
export type LayoutStrategy = 
  | 'auto'   // Intelligent 12-column grid with heuristic weighting
  | 'stack'  // Vertical flex column
  | 'row';   // Horizontal flex row

/**
 * Gap sizing options
 */
export type GapSize = 'sm' | 'md' | 'lg';

/**
 * Alignment options for flex layouts
 */
export type Alignment = 'start' | 'center' | 'end' | 'stretch';

// =============================================================================
// Component Types
// =============================================================================

/**
 * Text variant options for the Text component
 */
export type TextVariant = 'h1' | 'h2' | 'h3' | 'h4' | 'body' | 'code' | 'caption';

/**
 * Button variant options
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

/**
 * Status badge states
 */
export type StatusType = 'success' | 'warn' | 'error' | 'info';

/**
 * Chart type options
 */
export type ChartType = 'line' | 'bar' | 'pie' | 'area';

/**
 * Trend direction for metrics
 */
export type TrendDirection = 'up' | 'down' | 'flat';

// =============================================================================
// Container Types
// =============================================================================

/**
 * Container variant options
 */
export type ContainerVariant = 'card' | 'panel' | 'section' | 'transparent';

// =============================================================================
// Lifecycle Types
// =============================================================================

/**
 * Lifecycle event types
 */
export type LifecycleEvent = 'mount' | 'unmount';

// =============================================================================
// Source Location (for error reporting)
// =============================================================================

/**
 * Source location information for AST nodes
 * Used for error reporting and debugging
 */
export interface SourceLocation {
  /** Starting line number (1-indexed) */
  startLine: number;
  /** Starting column number (1-indexed) */
  startColumn: number;
  /** Ending line number (1-indexed) */
  endLine: number;
  /** Ending column number (1-indexed) */
  endColumn: number;
}

/**
 * Base interface for all AST nodes
 */
export interface BaseNode {
  /** Optional source location for debugging */
  loc?: SourceLocation;
}

// =============================================================================
// Runtime Value Types
// =============================================================================

/**
 * Runtime value that can be stored in state
 */
export type RuntimeValue = 
  | string 
  | number 
  | boolean 
  | RuntimeValue[] 
  | { [key: string]: RuntimeValue }
  | null
  | undefined;

/**
 * Default value type that matches the declared type
 */
export type DefaultValue<T extends NXMLPrimitiveType> = 
  T extends 'string' ? string :
  T extends 'number' ? number :
  T extends 'boolean' ? boolean :
  T extends 'list' ? RuntimeValue[] :
  T extends 'object' ? Record<string, RuntimeValue> :
  never;

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Validation error with context
 */
export interface ValidationError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Path to the problematic node in the AST */
  path: string[];
  /** Source location if available */
  loc?: SourceLocation;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** List of validation errors if any */
  errors: ValidationError[];
}

// =============================================================================
// Column Span Weights (for Layout Engine)
// =============================================================================

/**
 * Column span configuration for the 12-column grid system
 */
export type ColumnSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * Component weight mapping for auto layout
 * These determine how much horizontal space a component should occupy
 */
export const COMPONENT_WEIGHTS: Record<string, ColumnSpan> = {
  // Small components (4 per row)
  Metric: 3,
  StatusBadge: 3,
  Switch: 3,
  
  // Medium components (2 per row)
  Chart: 6,
  Input: 6,
  Button: 3,
  
  // Full-width components
  LogStream: 12,
  Text: 12,
  Container: 12,
  
  // Default for unknown components
  default: 6,
} as const;

/**
 * Get the column span weight for a component type
 */
export function getComponentWeight(componentType: string): ColumnSpan {
  return COMPONENT_WEIGHTS[componentType] ?? COMPONENT_WEIGHTS['default'] ?? 6;
}