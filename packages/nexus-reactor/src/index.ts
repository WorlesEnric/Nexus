/**
 * @nexus/reactor
 * 
 * Isomorphic execution engine for Nexus Panels.
 * Transforms NXML definitions into living, interactive applications.
 */

// Main reactor class
export { NexusReactor } from './reactor';

// Core types
export type {
  ReactorConfig,
  NexusPanelAST,
  RuntimeValue,
  ToolResult,
  PanelMeta,
  DataAST,
  LogicAST,
  ViewAST,
  StateNode,
  ComputedNode,
  ToolNode,
  ArgNode,
  HandlerNode,
  LifecycleNode,
  ExtensionNode,
  ViewNode,
  LayoutInfo,
  SandboxContext,
  ViewAPI,
  ViewHandle,
  MCPTool,
  MCPResource,
  JSONSchema,
  ColumnSpan,
  LayoutStrategy,
  GapSize,
  Alignment,
  TextVariant,
  ButtonVariant,
  StatusType,
  ChartType,
  ContainerVariant,
  InputType,
  NXMLPrimitiveType,
  LifecycleEvent,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './core/types';

// Parser
export { parse } from './parser/parser';
export { tokenize, type Token, type TokenType } from './parser/lexer';
export {
  validate,
  validateOrThrow,
  validateQuick,
  getToolNames,
  getStateNames,
  findTool,
  findState,
} from './parser/validator';

// State
export {
  createStateStore,
  subscribe,
  unsubscribe,
  getSnapshot,
  setState,
  trackAccess,
  type StateStore,
} from './state/store';

// Sandbox
export {
  createSandboxExecutor,
  createViewAPI,
  createEmitFunction,
  createLogFunction,
  createSandboxContext,
  type SandboxExecutor,
} from './sandbox/executor';

// Layout
export {
  processLayout,
  getLayoutStyles,
  getChildLayoutStyles,
  analyzeLayout,
  type LayoutStats,
} from './layout/engine';

// View
export {
  createViewRegistry,
  registerComponent,
  unregisterComponent,
  getViewHandle,
  getTransientProps,
  NXMLRenderer,
  HydrationProvider,
  useHydrationContext,
  createPanelComponent,
  type ViewRegistry,
  type HydrationContext,
} from './view/index';

// MCP
export {
  createMCPBridge,
  generateStateSchema,
  getToolsDescription,
  type MCPBridge,
} from './mcp/bridge';

// Events
export {
  ReactorEventEmitter,
  LogStream,
  globalEventBus,
  createPanelEventEmitter,
  type LogEntry,
  type LogLevel,
} from './core/events';

// Errors
export {
  NexusError,
  ParseError,
  ValidationError as ValidationErrorClass,
  SandboxError,
  StateError,
  ViewError,
  AggregateValidationError,
} from './core/errors';

// Constants
export {
  COMPONENT_WEIGHTS,
  GRID_COLUMNS,
  GAP_SIZES,
  FORBIDDEN_GLOBALS,
  getComponentWeight,
  SCL_COMPONENTS,
  EMIT_EVENTS,
  ERROR_CODES,
  WARNING_CODES,
} from './core/constants';

// Utilities
export {
  isBindingExpression,
  extractExpression,
  resolveBinding,
  resolveBindings,
  evaluateExpression,
  extractStateRefs,
  extractScopeRefs,
  getNestedValue,
  setNestedValue,
  parseArgsExpression,
  interpolateString,
} from './utils/expression';

export {
  parseDefaultValue,
  getDefaultForType,
  coerceToType,
  coerceToString,
  coerceToNumber,
  coerceToBoolean,
  coerceToList,
  coerceToObject,
  validateValueType,
  getValueType,
  cloneValue,
  valuesEqual,
} from './utils/coercion';

export {
  setDebugMode,
  isDebugEnabled,
  createDebugger,
  generateId,
  throttle,
  debounce,
} from './utils/debug';