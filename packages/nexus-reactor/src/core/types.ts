/**
 * @nexus/reactor - Core Type Definitions
 * 
 * This file defines the foundational types used throughout the Nexus Reactor.
 * It mirrors and extends types from @nexus/protocol for runtime use.
 */

// ============================================================================
// Primitive Types
// ============================================================================

/**
 * Supported primitive types in NXML state definitions
 */
export type NXMLPrimitiveType = 'string' | 'number' | 'boolean' | 'list' | 'object';

/**
 * JavaScript identifier pattern for variable names
 */
export type Identifier = string;

/**
 * Expression string that will be evaluated at runtime
 */
export type Expression = string;

/**
 * Binding expression with interpolation syntax: "{$state.x}" or "{$scope.item}"
 */
export type BindingExpression = string;

/**
 * Handler code block that runs in the sandbox
 */
export type HandlerCode = string;

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

// ============================================================================
// Layout Types
// ============================================================================

/**
 * Layout strategy determines how children are arranged
 */
export type LayoutStrategy = 'auto' | 'stack' | 'row';

/**
 * Gap sizing options
 */
export type GapSize = 'sm' | 'md' | 'lg';

/**
 * Alignment options for flex layouts
 */
export type Alignment = 'start' | 'center' | 'end' | 'stretch';

/**
 * Column span for 12-column grid (1-12)
 */
export type ColumnSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * Layout information injected by the Layout Engine
 */
export interface LayoutInfo {
  colSpan: ColumnSpan;
  className: string;
  newRow?: boolean;
}

// ============================================================================
// Component Types
// ============================================================================

export type TextVariant = 'h1' | 'h2' | 'h3' | 'h4' | 'body' | 'code' | 'caption';
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type StatusType = 'success' | 'warn' | 'error' | 'info';
export type ChartType = 'line' | 'bar' | 'pie' | 'area';
export type ContainerVariant = 'card' | 'panel' | 'section' | 'transparent';
export type InputType = 'text' | 'number' | 'password' | 'email';

// ============================================================================
// AST Node Types (Simplified for Runtime)
// ============================================================================

/**
 * Source location for error reporting
 */
export interface SourceLocation {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * Base interface for all AST nodes
 */
export interface BaseNode {
  loc?: SourceLocation;
}

/**
 * Lifecycle event types
 */
export type LifecycleEvent = 'mount' | 'unmount';

// ---- Data Namespace ----

export interface StateNode extends BaseNode {
  readonly kind: 'State';
  name: Identifier;
  type: NXMLPrimitiveType;
  default?: RuntimeValue;
}

export interface ComputedNode extends BaseNode {
  readonly kind: 'Computed';
  name: Identifier;
  value: Expression;
}

export type DataNode = StateNode | ComputedNode;

export interface DataAST extends BaseNode {
  readonly kind: 'Data';
  states: StateNode[];
  computed: ComputedNode[];
}

// ---- Logic Namespace ----

export interface ArgNode extends BaseNode {
  readonly kind: 'Arg';
  name: Identifier;
  type: NXMLPrimitiveType;
  required?: boolean;
  default?: unknown;
  description?: string;
}

export interface HandlerNode extends BaseNode {
  readonly kind: 'Handler';
  code: HandlerCode;
  isAsync?: boolean;

  // WASM-specific fields
  /** Capability tokens required for this handler */
  capabilities?: CapabilityToken[];
  /** Custom timeout in milliseconds (overrides default) */
  timeoutMs?: number;
  /** Pre-compiled WASM bytecode (cached) */
  _compiledBytecode?: Uint8Array;
}

/**
 * Capability token format for WASM security
 */
export type CapabilityToken =
  | `state:read:${string}`    // Read specific state key
  | `state:write:${string}`   // Write specific state key
  | 'state:read:*'            // Read all state
  | 'state:write:*'           // Write all state
  | `events:emit:${string}`   // Emit specific event
  | 'events:emit:*'           // Emit all events
  | `view:update:${string}`   // Update specific component
  | 'view:update:*'           // Update all components
  | `ext:${string}`           // Access specific extension
  | 'ext:*';                  // Access all extensions

export interface ToolNode extends BaseNode {
  readonly kind: 'Tool';
  name: Identifier;
  description?: string;
  args: ArgNode[];
  handler: HandlerNode;
}

export interface LifecycleNode extends BaseNode {
  readonly kind: 'Lifecycle';
  on: LifecycleEvent;
  handler: HandlerNode;
}

export interface ExtensionNode extends BaseNode {
  readonly kind: 'Extension';
  name: string;
  alias: Identifier;
  source?: string;
}

export type LogicNode = ToolNode | LifecycleNode | ExtensionNode;

export interface LogicAST extends BaseNode {
  readonly kind: 'Logic';
  extensions: ExtensionNode[];
  tools: ToolNode[];
  lifecycles: LifecycleNode[];
}

// ---- View Namespace ----

export interface ViewNode extends BaseNode {
  type: string;
  id?: string;
  props: Record<string, unknown>;
  children: ViewNode[];
  layout?: LayoutInfo;
}

export interface ViewAST extends BaseNode {
  readonly kind: 'View';
  root: ViewNode;
}

// ---- Panel Root ----

export interface PanelMeta {
  title: string;
  description?: string;
  id?: string;
  version?: string;
  author?: string;
  tags?: string[];
}

export interface NexusPanelAST extends BaseNode {
  readonly kind: 'NexusPanel';
  meta: PanelMeta;
  data: DataAST;
  logic: LogicAST;
  view: ViewAST;
}

// ============================================================================
// Reactor Configuration Types
// ============================================================================

/**
 * Configuration for initializing a NexusReactor instance
 */
export interface ReactorConfig {
  /** NXML source code */
  source: string;
  /** Host-provided capabilities (extensions) */
  extensions?: Record<string, unknown>;
  /** Initial state for restoration */
  initialState?: Record<string, RuntimeValue>;
  /** Enable debug mode */
  debug?: boolean;
}

/**
 * State snapshot for serialization/restoration
 */
export interface StateSnapshot {
  values: Record<string, RuntimeValue>;
  timestamp: number;
}

// ============================================================================
// Sandbox Types
// ============================================================================

/**
 * Context provided to sandbox handlers
 */
export interface SandboxContext {
  $state: Record<string, RuntimeValue>;
  $args: Record<string, unknown>;
  $view: ViewAPI;
  $emit: EmitFunction;
  $ext: Record<string, unknown>;
  $log: LogFunction;
}

/**
 * View API exposed to sandbox
 */
export interface ViewAPI {
  getElementById(id: string): ViewHandle | null;
}

/**
 * Handle for imperative view manipulation
 */
export interface ViewHandle {
  /** Override a property temporarily */
  setProp(prop: string, value: unknown): void;
  /** Call an imperative method on the component */
  call(method: string, ...args: unknown[]): void;
}

/**
 * Emit function for sending events to host
 */
export type EmitFunction = (event: string, payload?: unknown) => void;

/**
 * Safe logging function
 */
export type LogFunction = (...args: unknown[]) => void;

// ============================================================================
// MCP Types
// ============================================================================

/**
 * JSON Schema representation for MCP tool arguments
 */
export interface JSONSchema {
  type: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  default?: unknown;
  enum?: unknown[];
}

/**
 * MCP Tool definition
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: JSONSchema;
}

/**
 * MCP Resource for state inspection
 */
export interface MCPResource {
  uri: string;
  name: string;
  mimeType: string;
}

/**
 * Result from tool execution
 */
export interface ToolResult {
  success: boolean;
  value?: unknown;
  error?: string;
}

// ============================================================================
// Event Types
// ============================================================================

export type ReactorEventType =
  | 'mount'
  | 'unmount'
  | 'stateChange'
  | 'toolExecute'
  | 'error'
  | 'emit';

export interface ReactorEvent {
  type: ReactorEventType;
  payload?: unknown;
  timestamp: number;
}

export type ReactorEventHandler = (event: ReactorEvent) => void;

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationError {
  code: string;
  message: string;
  path: string[];
  loc?: SourceLocation;
}

export interface ValidationWarning {
  code: string;
  message: string;
  path: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

// ============================================================================
// Subscriber Types
// ============================================================================

export type SubscriberId = string;
export type StateKey = string;

export interface Subscriber {
  id: SubscriberId;
  callback: () => void;
  dependencies: Set<StateKey>;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isStateNode(node: unknown): node is StateNode {
  return (node as StateNode)?.kind === 'State';
}

export function isComputedNode(node: unknown): node is ComputedNode {
  return (node as ComputedNode)?.kind === 'Computed';
}

export function isToolNode(node: unknown): node is ToolNode {
  return (node as ToolNode)?.kind === 'Tool';
}

export function isLifecycleNode(node: unknown): node is LifecycleNode {
  return (node as LifecycleNode)?.kind === 'Lifecycle';
}

export function isExtensionNode(node: unknown): node is ExtensionNode {
  return (node as ExtensionNode)?.kind === 'Extension';
}

export function isBindingExpression(value: unknown): value is BindingExpression {
  if (typeof value !== 'string') return false;
  return /^\{.*\}$/.test(value.trim());
}

export function isNexusPanelAST(node: unknown): node is NexusPanelAST {
  return (node as NexusPanelAST)?.kind === 'NexusPanel';
}