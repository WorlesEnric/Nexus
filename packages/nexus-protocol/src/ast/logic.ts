/**
 * @fileoverview Logic namespace AST definitions
 * @module @nexus/protocol/ast/logic
 * 
 * The Logic namespace defines panel behavior:
 * - Tools: Atomic operations that can be triggered by UI or AI
 * - Lifecycles: Hooks for mount/unmount events
 * - Extensions: External capability declarations (e.g., filesystem, AI)
 * 
 * All logic code runs in the Nexus Runtime Sandbox with restricted access.
 */

import type { 
  BaseNode, 
  Identifier, 
  NXMLPrimitiveType, 
  HandlerCode,
  LifecycleEvent 
} from './common';

// =============================================================================
// Argument Node
// =============================================================================

/**
 * Represents a function argument declaration for Tools
 * 
 * @example
 * ```xml
 * <Arg name="amount" type="number" />
 * <Arg name="force" type="boolean" />
 * ```
 */
export interface ArgNode extends BaseNode {
  readonly kind: 'Arg';
  
  /**
   * Argument name (accessible via $args.{name} in handler)
   */
  name: Identifier;
  
  /**
   * Argument type for validation
   */
  type: NXMLPrimitiveType;
  
  /**
   * Whether this argument is required
   * @default true
   */
  required?: boolean;
  
  /**
   * Default value if argument is optional
   */
  default?: unknown;
  
  /**
   * Description for AI understanding
   */
  description?: string;
}

/**
 * Type guard for ArgNode
 */
export function isArgNode(node: unknown): node is ArgNode {
  return typeof node === 'object' && node !== null && (node as ArgNode).kind === 'Arg';
}

// =============================================================================
// Handler Node
// =============================================================================

/**
 * Represents a code handler block
 * Contains JavaScript code that executes in the sandbox
 */
export interface HandlerNode extends BaseNode {
  readonly kind: 'Handler';
  
  /**
   * The JavaScript code to execute
   * Has access to: $state, $args, $emit, $ext, $view, console
   * Restricted from: window, document, fetch, eval
   */
  code: HandlerCode;
  
  /**
   * Whether this handler contains async operations
   * Detected by presence of 'await' keyword
   */
  isAsync?: boolean;
}

/**
 * Type guard for HandlerNode
 */
export function isHandlerNode(node: unknown): node is HandlerNode {
  return typeof node === 'object' && node !== null && (node as HandlerNode).kind === 'Handler';
}

// =============================================================================
// Tool Node
// =============================================================================

/**
 * Represents an atomic operation function
 * Tools can be invoked by UI triggers or by NexusOS (AI)
 * 
 * @example
 * ```xml
 * <Tool name="increment" description="Increases the counter">
 *   <Arg name="amount" type="number" />
 *   <Handler>
 *     $state.count += $args.amount;
 *   </Handler>
 * </Tool>
 * ```
 */
export interface ToolNode extends BaseNode {
  readonly kind: 'Tool';
  
  /**
   * Tool name (used as trigger reference in View)
   * Also registered with NexusOS for AI invocation
   */
  name: Identifier;
  
  /**
   * Human-readable description for AI understanding
   * NexusOS uses this to determine when to invoke the tool
   */
  description?: string;
  
  /**
   * Tool arguments
   */
  args: ArgNode[];
  
  /**
   * The handler code block
   */
  handler: HandlerNode;
}

/**
 * Type guard for ToolNode
 */
export function isToolNode(node: unknown): node is ToolNode {
  return typeof node === 'object' && node !== null && (node as ToolNode).kind === 'Tool';
}

// =============================================================================
// Lifecycle Node
// =============================================================================

/**
 * Represents a lifecycle hook
 * 
 * @example
 * ```xml
 * <Lifecycle on="mount">
 *   <Handler>
 *     console.log("Panel mounted");
 *     $state.initialized = true;
 *   </Handler>
 * </Lifecycle>
 * ```
 */
export interface LifecycleNode extends BaseNode {
  readonly kind: 'Lifecycle';
  
  /**
   * The lifecycle event to hook into
   * - mount: Fires once when panel loads
   * - unmount: Fires when panel is destroyed
   */
  on: LifecycleEvent;
  
  /**
   * The handler code block
   */
  handler: HandlerNode;
}

/**
 * Type guard for LifecycleNode
 */
export function isLifecycleNode(node: unknown): node is LifecycleNode {
  return typeof node === 'object' && node !== null && (node as LifecycleNode).kind === 'Lifecycle';
}

// =============================================================================
// Extension Node
// =============================================================================

/**
 * Represents an external capability declaration
 * Extensions provide access to host capabilities like filesystem, AI, etc.
 * 
 * @example
 * ```xml
 * <Extension name="nexus.fs" alias="fs" />
 * <Extension name="org.ollama" alias="ai" source="ollama:latest" />
 * ```
 */
export interface ExtensionNode extends BaseNode {
  readonly kind: 'Extension';
  
  /**
   * Capability ID (e.g., "nexus.fs", "local.llm")
   * This identifies the capability being requested
   */
  name: string;
  
  /**
   * Alias used in code (e.g., $ext.fs)
   * Defaults to the last segment of name if not specified
   */
  alias: Identifier;
  
  /**
   * Optional source/version specification
   * Used for marketplace package resolution
   */
  source?: string;
}

/**
 * Type guard for ExtensionNode
 */
export function isExtensionNode(node: unknown): node is ExtensionNode {
  return typeof node === 'object' && node !== null && (node as ExtensionNode).kind === 'Extension';
}

// =============================================================================
// Logic AST
// =============================================================================

/**
 * Union type for all logic node types
 */
export type LogicNode = ToolNode | LifecycleNode | ExtensionNode;

/**
 * Type guard for any LogicNode
 */
export function isLogicNode(node: unknown): node is LogicNode {
  return isToolNode(node) || isLifecycleNode(node) || isExtensionNode(node);
}

/**
 * The complete Logic namespace AST
 * Contains all behavioral definitions for a panel
 */
export interface LogicAST extends BaseNode {
  readonly kind: 'Logic';
  
  /**
   * Extension (capability) declarations
   * Must be declared before use in handlers
   */
  extensions: ExtensionNode[];
  
  /**
   * Tool (function) definitions
   */
  tools: ToolNode[];
  
  /**
   * Lifecycle hook definitions
   */
  lifecycles: LifecycleNode[];
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new ArgNode
 */
export function createArgNode(
  name: Identifier,
  type: NXMLPrimitiveType,
  options?: { required?: boolean; default?: unknown; description?: string }
): ArgNode {
  return {
    kind: 'Arg',
    name,
    type,
    required: options?.required ?? true,
    default: options?.default,
    description: options?.description,
  };
}

/**
 * Create a new HandlerNode
 */
export function createHandlerNode(code: HandlerCode): HandlerNode {
  return {
    kind: 'Handler',
    code,
    isAsync: code.includes('await'),
  };
}

/**
 * Create a new ToolNode
 */
export function createToolNode(
  name: Identifier,
  handler: HandlerNode,
  options?: { description?: string; args?: ArgNode[] }
): ToolNode {
  return {
    kind: 'Tool',
    name,
    description: options?.description,
    args: options?.args ?? [],
    handler,
  };
}

/**
 * Create a new LifecycleNode
 */
export function createLifecycleNode(
  on: LifecycleEvent,
  handler: HandlerNode
): LifecycleNode {
  return {
    kind: 'Lifecycle',
    on,
    handler,
  };
}

/**
 * Create a new ExtensionNode
 */
export function createExtensionNode(
  name: string,
  alias?: Identifier,
  source?: string
): ExtensionNode {
  // Default alias is the last segment of the name
  const defaultAlias = name.split('.').pop() ?? name;
  
  return {
    kind: 'Extension',
    name,
    alias: alias ?? defaultAlias,
    source,
  };
}

/**
 * Create an empty LogicAST
 */
export function createLogicAST(): LogicAST {
  return {
    kind: 'Logic',
    extensions: [],
    tools: [],
    lifecycles: [],
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get all tool names defined in a LogicAST
 */
export function getToolNames(logic: LogicAST): string[] {
  return logic.tools.map(t => t.name);
}

/**
 * Find a tool by name
 */
export function findTool(logic: LogicAST, name: string): ToolNode | undefined {
  return logic.tools.find(t => t.name === name);
}

/**
 * Find an extension by alias
 */
export function findExtensionByAlias(logic: LogicAST, alias: string): ExtensionNode | undefined {
  return logic.extensions.find(e => e.alias === alias);
}

/**
 * Check if any handler uses async operations
 */
export function hasAsyncHandlers(logic: LogicAST): boolean {
  return logic.tools.some(t => t.handler.isAsync) 
    || logic.lifecycles.some(l => l.handler.isAsync);
}

/**
 * Get all extension aliases for building the $ext object
 */
export function getExtensionAliases(logic: LogicAST): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const ext of logic.extensions) {
    aliases.set(ext.alias, ext.name);
  }
  return aliases;
}