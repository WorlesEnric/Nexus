/**
 * @nexus/reactor - View Bindings
 *
 * Re-exports binding utilities from utils/expression
 * This module exists for organizational clarity in the view namespace
 */

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
} from '../utils/expression';

export type { RuntimeValue, BindingExpression, Expression } from '../core/types';
