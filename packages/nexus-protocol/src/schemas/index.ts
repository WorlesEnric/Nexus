/**
 * @fileoverview Schema module exports
 * @module @nexus/protocol/schemas
 * 
 * This module provides Zod schemas for validating NXML AST structures.
 */

// =============================================================================
// Data Schemas
// =============================================================================

export {
  NXMLPrimitiveTypeSchema,
  IdentifierSchema,
  RuntimeValueSchema,
  ExpressionSchema,
  StateNodeSchema,
  ComputedNodeSchema,
  DataASTSchema,
  validateStateNode,
  validateComputedNode,
  validateDataAST,
  validateDefaultValueType,
} from './data';

export type {
  StateNodeInput,
  StateNodeOutput,
  ComputedNodeInput,
  ComputedNodeOutput,
  DataASTInput,
  DataASTOutput,
} from './data';

// =============================================================================
// Logic Schemas
// =============================================================================

export {
  HandlerCodeSchema,
  ArgNodeSchema,
  HandlerNodeSchema,
  ToolNodeSchema,
  LifecycleEventSchema,
  LifecycleNodeSchema,
  ExtensionNameSchema,
  ExtensionNodeSchema,
  LogicASTSchema,
  validateArgNode,
  validateHandlerNode,
  validateToolNode,
  validateLifecycleNode,
  validateExtensionNode,
  validateLogicAST,
  detectAsyncHandler,
  extractExtensionUsage,
  validateExtensionUsage,
} from './logic';

export type {
  ArgNodeInput,
  ArgNodeOutput,
  HandlerNodeInput,
  HandlerNodeOutput,
  ToolNodeInput,
  ToolNodeOutput,
  LifecycleNodeInput,
  LifecycleNodeOutput,
  ExtensionNodeInput,
  ExtensionNodeOutput,
  LogicASTInput,
  LogicASTOutput,
} from './logic';

// =============================================================================
// View Schemas
// =============================================================================

export {
  BindingExpressionSchema,
  LayoutStrategySchema,
  GapSizeSchema,
  AlignmentSchema,
  TextVariantSchema,
  ButtonVariantSchema,
  StatusTypeSchema,
  ChartTypeSchema,
  ContainerVariantSchema,
  LayoutInfoSchema,
  LayoutPropsSchema,
  ContainerPropsSchema,
  IfPropsSchema,
  IteratePropsSchema,
  TextPropsSchema,
  MetricPropsSchema,
  StatusBadgePropsSchema,
  LogStreamPropsSchema,
  InputPropsSchema,
  ButtonPropsSchema,
  SwitchPropsSchema,
  ChartPropsSchema,
  ActionPropsSchema,
  ViewNodeSchema,
  ViewASTSchema,
  validateViewNode,
  validateViewAST,
  isBindingExpression,
  extractBindingReferences,
  extractTriggerReferences,
} from './view';

export type {
  ViewNodeInput,
  ViewNodeOutput,
  ViewASTInput,
  ViewASTOutput,
  LayoutPropsInput,
  LayoutPropsOutput,
} from './view';

// =============================================================================
// Panel Schemas
// =============================================================================

export {
  PanelMetaSchema,
  NexusPanelASTSchema,
  NexusPanelASTSchemaStrict,
  validateNexusPanelAST,
  validateNexusPanelASTQuick,
  validateNexusPanelASTStrict,
} from './panel';

export type {
  PanelMetaInput,
  PanelMetaOutput,
  NexusPanelASTInput,
  NexusPanelASTOutput,
  PanelValidationResult,
  PanelValidationError,
  PanelValidationWarning,
} from './panel';
