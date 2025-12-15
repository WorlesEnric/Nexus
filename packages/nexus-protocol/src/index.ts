/**
 * @fileoverview Nexus Protocol - Core type definitions and validation
 * @module @nexus/protocol
 * @version 1.0.0
 * 
 * Nexus Protocol provides the foundational type system for the Nexus
 * AI-assisted prototyping platform. This package includes:
 * 
 * - **AST**: Abstract Syntax Tree definitions for NXML (Nexus Extensible Markup Language)
 * - **Schemas**: Zod validation schemas for runtime type checking
 * - **NOG**: Nexus Object Graph - the semantic truth layer for cross-panel synchronization
 * - **Utils**: Common utilities for working with Nexus types
 * 
 * @example
 * ```typescript
 * import { 
 *   NexusPanelAST, 
 *   createNexusPanelAST,
 *   validateNexusPanelAST 
 * } from '@nexus/protocol';
 * 
 * const panel = createNexusPanelAST({ title: 'My Panel' });
 * const result = validateNexusPanelAST(panel);
 * ```
 */

// =============================================================================
// AST Module
// =============================================================================

export * from './ast';

// =============================================================================
// Schemas Module
// =============================================================================

export {
  // Data Schemas
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
  // Logic Schemas
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
  // View Schemas
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
  // isBindingExpression intentionally omitted - already exported from './ast'
  extractBindingReferences,
  extractTriggerReferences,
  // Panel Schemas
  PanelMetaSchema,
  NexusPanelASTSchema,
  NexusPanelASTSchemaStrict,
  validateNexusPanelAST,
  validateNexusPanelASTQuick,
  validateNexusPanelASTStrict,
} from './schemas';

export type {
  StateNodeInput,
  StateNodeOutput,
  ComputedNodeInput,
  ComputedNodeOutput,
  DataASTInput,
  DataASTOutput,
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
  ViewNodeInput,
  ViewNodeOutput,
  ViewASTInput,
  ViewASTOutput,
  LayoutPropsInput,
  LayoutPropsOutput,
  PanelMetaInput,
  PanelMetaOutput,
  NexusPanelASTInput,
  NexusPanelASTOutput,
  PanelValidationResult,
  PanelValidationError,
  PanelValidationWarning,
} from './schemas';

// =============================================================================
// NOG Module (Nexus Object Graph)
// =============================================================================

export * from './nog';

// =============================================================================
// Utils Module
// =============================================================================

export * from './utils';

// =============================================================================
// Package Constants
// =============================================================================

/**
 * Protocol version
 */
export const NEXUS_PROTOCOL_VERSION = '1.0.0';

/**
 * NXML specification version
 */
export const NXML_SPEC_VERSION = '1.0.0';
