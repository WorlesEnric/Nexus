/**
 * @fileoverview NexusPanel AST definition
 * @module @nexus/protocol/ast/panel
 * 
 * The NexusPanel is the root AST node that combines:
 * - Data: Reactive state definitions
 * - Logic: Behavioral definitions (tools, lifecycles, extensions)
 * - View: UI structure definition
 */

import type { BaseNode, ValidationResult, ValidationError } from './common';
import type { DataAST } from './data';
import type { LogicAST } from './logic';
import type { ViewAST } from './view';
import { traverseViewTree } from './view';
import { createDataAST } from './data';
import { createLogicAST } from './logic';
import { createViewAST } from './view';

// =============================================================================
// NexusPanel Metadata
// =============================================================================

/**
 * Panel metadata for display and identification
 */
export interface PanelMeta {
  /**
   * Panel title displayed in the header
   */
  title: string;
  
  /**
   * Optional description for documentation
   */
  description?: string;
  
  /**
   * Unique panel identifier (auto-generated if not provided)
   */
  id?: string;
  
  /**
   * Panel version for compatibility checking
   */
  version?: string;
  
  /**
   * Author information
   */
  author?: string;
  
  /**
   * Tags for categorization
   */
  tags?: string[];
}

// =============================================================================
// NexusPanel AST
// =============================================================================

/**
 * The complete NexusPanel Abstract Syntax Tree
 * This is the top-level structure produced by parsing an NXML document
 * 
 * @example
 * ```xml
 * <NexusPanel title="My Panel" description="A sample panel">
 *   <Data>...</Data>
 *   <Logic>...</Logic>
 *   <View>...</View>
 * </NexusPanel>
 * ```
 */
export interface NexusPanelAST extends BaseNode {
  readonly kind: 'NexusPanel';
  
  /**
   * Panel metadata from attributes
   */
  meta: PanelMeta;
  
  /**
   * Data namespace AST (state definitions)
   */
  data: DataAST;
  
  /**
   * Logic namespace AST (behavior definitions)
   */
  logic: LogicAST;
  
  /**
   * View namespace AST (UI definition)
   */
  view: ViewAST;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new NexusPanelAST with defaults
 */
export function createNexusPanelAST(
  meta: PanelMeta
): NexusPanelAST {
  return {
    kind: 'NexusPanel',
    meta: {
      id: meta.id ?? generatePanelId(),
      ...meta,
    },
    data: createDataAST(),
    logic: createLogicAST(),
    view: createViewAST(),
  };
}

/**
 * Generate a unique panel ID
 */
function generatePanelId(): string {
  return `panel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// Type Guard
// =============================================================================

/**
 * Type guard for NexusPanelAST
 */
export function isNexusPanelAST(node: unknown): node is NexusPanelAST {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as NexusPanelAST).kind === 'NexusPanel'
  );
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a NexusPanelAST for consistency
 * Checks:
 * - All view bindings reference valid state
 * - All view triggers reference valid tools
 * - No duplicate state names
 * - No duplicate tool names
 * - No duplicate View Component IDs
 */
export function validatePanelAST(ast: NexusPanelAST): ValidationResult {
  const errors: ValidationError[] = [];

  // Check for duplicate state names
  const seenStateNames = new Set<string>();
  for (const state of [...ast.data.states, ...ast.data.computed]) {
    if (seenStateNames.has(state.name)) {
      errors.push({
        code: 'DUPLICATE_STATE',
        message: `Duplicate state name: "${state.name}"`,
        path: ['data', state.name],
        ...(state.loc !== undefined && { loc: state.loc }),
      });
    }
    seenStateNames.add(state.name);
  }
  
  // Check for duplicate tool names
  const seenToolNames = new Set<string>();
  for (const tool of ast.logic.tools) {
    if (seenToolNames.has(tool.name)) {
      errors.push({
        code: 'DUPLICATE_TOOL',
        message: `Duplicate tool name: "${tool.name}"`,
        path: ['logic', 'tools', tool.name],
        ...(tool.loc !== undefined && { loc: tool.loc }),
      });
    }
    seenToolNames.add(tool.name);
  }
  
  // Validate duplicate View IDs (required for imperative $view manipulation)
  const seenViewIds = new Set<string>();
  
  traverseViewTree(ast.view.root, (node) => {
    // Check if node is GenericViewNode or any node with an ID
    // We cast to any to safely access 'id' since it's now on ViewNodeBase
    const nodeId = (node as any).id;
    if (nodeId) {
      if (seenViewIds.has(nodeId)) {
        errors.push({
          code: 'DUPLICATE_VIEW_ID',
          message: `Duplicate view ID: "${nodeId}"`,
          path: ['view', nodeId],
          ...(node.loc !== undefined && { loc: node.loc }),
        });
      }
      seenViewIds.add(nodeId);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// Serialization
// =============================================================================

/**
 * Convert AST to a JSON-safe format
 */
export function serializePanelAST(ast: NexusPanelAST): string {
  return JSON.stringify(ast, null, 2);
}

/**
 * Parse a serialized AST (with basic validation)
 */
export function deserializePanelAST(json: string): NexusPanelAST {
  const parsed = JSON.parse(json);
  if (!isNexusPanelAST(parsed)) {
    throw new Error('Invalid NexusPanelAST structure');
  }
  return parsed;
}

// =============================================================================
// Analysis Utilities
// =============================================================================

/**
 * Get a summary of the panel structure
 */
export interface PanelSummary {
  title: string;
  stateCount: number;
  computedCount: number;
  toolCount: number;
  extensionCount: number;
  hasLifecycleMount: boolean;
  hasLifecycleUnmount: boolean;
}

/**
 * Analyze a panel AST and return a summary
 */
export function analyzePanelAST(ast: NexusPanelAST): PanelSummary {
  return {
    title: ast.meta.title,
    stateCount: ast.data.states.length,
    computedCount: ast.data.computed.length,
    toolCount: ast.logic.tools.length,
    extensionCount: ast.logic.extensions.length,
    hasLifecycleMount: ast.logic.lifecycles.some(l => l.on === 'mount'),
    hasLifecycleUnmount: ast.logic.lifecycles.some(l => l.on === 'unmount'),
  };
}

/**
 * Extract all state dependencies from a panel
 * Returns a map of state name -> dependent states (from computed expressions)
 */
export function extractStateDependencies(ast: NexusPanelAST): Map<string, string[]> {
  const deps = new Map<string, string[]>();
  
  for (const computed of ast.data.computed) {
    const matches = computed.value.matchAll(/\$state\.(\w+)/g);
    const dependencies = [...matches].map(m => m[1]).filter((d): d is string => d !== undefined);
    deps.set(computed.name, dependencies);
  }
  
  return deps;
}

/**
 * Check if panel has any async operations
 */
export function hasAsyncOperations(ast: NexusPanelAST): boolean {
  return (
    ast.logic.tools.some(t => t.handler.isAsync) ||
    ast.logic.lifecycles.some(l => l.handler.isAsync) ||
    ast.logic.extensions.length > 0 // Extensions are always async
  );
}