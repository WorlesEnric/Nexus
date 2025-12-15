/**
 * @nexus/reactor - View Module
 *
 * Aggregates all view-related exports
 */

// Registry
export {
  createViewRegistry,
  registerComponent,
  unregisterComponent,
  getViewHandle,
  getTransientProps,
  setTransientProp,
  clearTransientProps,
  getAllComponentIds,
  hasComponent,
  getComponentInfo,
  type ViewRegistry,
} from './registry';

// Scope
export {
  createRootScope,
  createChildScope,
  createIterateScope,
  resolveScopeReference,
  setScopeValue,
  hasScopeVariable,
  getFlattenedScope,
  mergeScopeForEvaluation,
  type ScopeContext,
} from './scope';

// Bindings (re-exported from utils)
export {
  isBindingExpression,
  extractExpression,
  resolveBinding,
  resolveBindings,
  evaluateExpression,
  extractStateRefs,
  extractScopeRefs,
  parseArgsExpression,
  interpolateString,
  bindingReferencesState,
  createExpressionEvaluator,
  getNestedValue,
  setNestedValue,
  referencesState,
  referencesScope,
} from './bindings';

// Hydrator
export {
  NXMLRenderer,
  HydrationProvider,
  useHydrationContext,
  createPanelComponent,
  type HydrationContext,
} from './hydrator';

// Re-export types
export type { RuntimeValue, BindingExpression, Expression, ViewNode, ViewHandle } from '../core/types';
