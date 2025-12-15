/**
 * @fileoverview AST module exports
 * @module @nexus/protocol/ast
 * 
 * This module provides the complete type definitions for the NXML
 * Abstract Syntax Tree (AST).
 */

// =============================================================================
// Common Types
// =============================================================================

export type {
  NXMLPrimitiveType,
  Identifier,
  Expression,
  BindingExpression,
  HandlerCode,
  LayoutStrategy,
  GapSize,
  Alignment,
  TextVariant,
  ButtonVariant,
  StatusType,
  ChartType,
  ContainerVariant,
  TrendDirection,
  LifecycleEvent,
  SourceLocation,
  BaseNode,
  RuntimeValue,
  DefaultValue,
  ValidationError,
  ValidationResult,
  ColumnSpan,
} from './common';

export {
  COMPONENT_WEIGHTS,
  getComponentWeight,
} from './common';

// =============================================================================
// Data Namespace
// =============================================================================

export type {
  StateNode,
  ComputedNode,
  DataNode,
  DataAST,
} from './data';

export {
  isStateNode,
  isComputedNode,
  isDataNode,
  createStateNode,
  createComputedNode,
  createDataAST,
  getStateNames,
  findDataNode,
  getDefaultForType,
  parseDefaultValue,
} from './data';

// =============================================================================
// Logic Namespace
// =============================================================================

export type {
  ArgNode,
  HandlerNode,
  ToolNode,
  LifecycleNode,
  ExtensionNode,
  LogicNode,
  LogicAST,
} from './logic';

export {
  isArgNode,
  isHandlerNode,
  isToolNode,
  isLifecycleNode,
  isExtensionNode,
  isLogicNode,
  createArgNode,
  createHandlerNode,
  createToolNode,
  createLifecycleNode,
  createExtensionNode,
  createLogicAST,
  getToolNames,
  findTool,
  findExtensionByAlias,
  hasAsyncHandlers,
  getExtensionAliases,
} from './logic';

// =============================================================================
// View Namespace
// =============================================================================

export type {
  ViewNodeBase,
  LayoutInfo,
  LayoutProps,
  LayoutNode,
  ContainerProps,
  ContainerNode,
  IfProps,
  IfNode,
  IterateProps,
  IterateNode,
  TextProps,
  TextNode,
  MetricProps,
  MetricNode,
  StatusBadgeProps,
  StatusBadgeNode,
  LogStreamProps,
  LogStreamNode,
  InputProps,
  InputNode,
  ButtonProps,
  ButtonNode,
  SwitchProps,
  SwitchNode,
  ChartProps,
  ChartNode,
  ActionProps,
  ActionNode,
  CustomComponentProps,
  CustomComponentNode,
  ViewNode,
  GenericViewNode,
  ViewAST,
} from './view';

export {
  isLayoutNode,
  isContainerNode,
  isIfNode,
  isIterateNode,
  isControlFlowNode,
  isCustomComponentNode,
  createViewNode,
  createLayoutNode,
  createViewAST,
  isBindingExpression,
  extractExpression,
  referencesState,
  referencesScope,
  traverseViewTree,
  findViewNodes,
  getAllBindings,
  getAllTriggers,
} from './view';

// =============================================================================
// Panel (Root)
// =============================================================================

export type {
  PanelMeta,
  NexusPanelAST,
  PanelSummary,
} from './panel';

export {
  createNexusPanelAST,
  isNexusPanelAST,
  validatePanelAST,
  serializePanelAST,
  deserializePanelAST,
  analyzePanelAST,
  extractStateDependencies,
  hasAsyncOperations,
} from './panel';
