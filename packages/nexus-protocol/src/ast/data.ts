/**
 * @fileoverview Data namespace AST definitions
 * @module @nexus/protocol/ast/data
 * 
 * The Data namespace defines the reactive state of a NexusPanel.
 * All UI updates are driven by state changes through the $state proxy.
 */

import type { 
  BaseNode, 
  Identifier, 
  NXMLPrimitiveType, 
  Expression,
  RuntimeValue 
} from './common';

// =============================================================================
// State Node
// =============================================================================

/**
 * Represents a mutable state variable declaration
 * 
 * @example
 * ```xml
 * <State name="count" type="number" default="0" />
 * <State name="items" type="list" default="[]" />
 * ```
 */
export interface StateNode extends BaseNode {
  readonly kind: 'State';
  
  /**
   * Variable name (must be a valid JS identifier)
   * Accessed at runtime via $state.{name}
   */
  name: Identifier;
  
  /**
   * The data type of this state variable
   */
  type: NXMLPrimitiveType;
  
  /**
   * Default value (optional)
   * Must be compatible with the declared type
   * Parser will coerce string values based on type:
   * - "false" → false (boolean)
   * - "123" → 123 (number)
   * - "[]" → [] (list)
   * - "{}" → {} (object)
   */
  default?: RuntimeValue;
}

/**
 * Type guard for StateNode
 */
export function isStateNode(node: unknown): node is StateNode {
  return typeof node === 'object' && node !== null && (node as StateNode).kind === 'State';
}

// =============================================================================
// Computed Node
// =============================================================================

/**
 * Represents a read-only derived state (computed property)
 * Automatically updates when dependencies change
 * 
 * @example
 * ```xml
 * <Computed name="total" value="$state.price * $state.qty" />
 * <Computed name="hasItems" value="$state.items.length > 0" />
 * ```
 */
export interface ComputedNode extends BaseNode {
  readonly kind: 'Computed';
  
  /**
   * Variable name (must be a valid JS identifier)
   * Accessed at runtime via $state.{name} (read-only)
   */
  name: Identifier;
  
  /**
   * JavaScript expression that computes the value
   * Must have a return value
   * Can reference $state properties
   */
  value: Expression;
}

/**
 * Type guard for ComputedNode
 */
export function isComputedNode(node: unknown): node is ComputedNode {
  return typeof node === 'object' && node !== null && (node as ComputedNode).kind === 'Computed';
}

// =============================================================================
// Data AST
// =============================================================================

/**
 * Union type for all data node types
 */
export type DataNode = StateNode | ComputedNode;

/**
 * Type guard for any DataNode
 */
export function isDataNode(node: unknown): node is DataNode {
  return isStateNode(node) || isComputedNode(node);
}

/**
 * The complete Data namespace AST
 * Contains all state and computed property definitions for a panel
 */
export interface DataAST extends BaseNode {
  readonly kind: 'Data';
  
  /**
   * Mutable state declarations
   */
  states: StateNode[];
  
  /**
   * Computed (derived) property declarations
   */
  computed: ComputedNode[];
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new StateNode
 */
export function createStateNode(
  name: Identifier,
  type: NXMLPrimitiveType,
  defaultValue?: RuntimeValue
): StateNode {
  return {
    kind: 'State',
    name,
    type,
    default: defaultValue,
  };
}

/**
 * Create a new ComputedNode
 */
export function createComputedNode(
  name: Identifier,
  value: Expression
): ComputedNode {
  return {
    kind: 'Computed',
    name,
    value,
  };
}

/**
 * Create an empty DataAST
 */
export function createDataAST(): DataAST {
  return {
    kind: 'Data',
    states: [],
    computed: [],
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get all state names defined in a DataAST
 */
export function getStateNames(data: DataAST): string[] {
  return [
    ...data.states.map(s => s.name),
    ...data.computed.map(c => c.name),
  ];
}

/**
 * Find a state or computed node by name
 */
export function findDataNode(data: DataAST, name: string): DataNode | undefined {
  return data.states.find(s => s.name === name) 
    ?? data.computed.find(c => c.name === name);
}

/**
 * Get the default value for a type
 */
export function getDefaultForType(type: NXMLPrimitiveType): RuntimeValue {
  switch (type) {
    case 'string': return '';
    case 'number': return 0;
    case 'boolean': return false;
    case 'list': return [];
    case 'object': return {};
  }
}

/**
 * Parse a string default value based on the declared type
 */
export function parseDefaultValue(value: string, type: NXMLPrimitiveType): RuntimeValue {
  switch (type) {
    case 'string':
      return value;
    case 'number':
      return Number(value) || 0;
    case 'boolean':
      return value.toLowerCase() === 'true';
    case 'list':
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    case 'object':
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
  }
}
