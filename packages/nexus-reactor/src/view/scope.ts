/**
 * @nexus/reactor - Scope Context
 *
 * Manages scope for Iterate components ($scope.item, $scope.index)
 */

import { getNestedValue, setNestedValue } from '../utils/expression';

export interface ScopeContext {
  /** Parent scope (for nested Iterate) */
  parent: ScopeContext | null;

  /** Variables defined in this scope */
  variables: Record<string, unknown>;
}

/**
 * Create a root scope context
 */
export function createRootScope(): ScopeContext {
  return {
    parent: null,
    variables: {},
  };
}

/**
 * Create a child scope with a parent
 */
export function createChildScope(parent: ScopeContext, variables: Record<string, unknown>): ScopeContext {
  return {
    parent,
    variables,
  };
}

/**
 * Create scope for an Iterate loop
 */
export function createIterateScope(
  parent: ScopeContext,
  itemName: string,
  itemValue: unknown,
  index: number
): ScopeContext {
  return createChildScope(parent, {
    [itemName]: itemValue,
    index,
  });
}

/**
 * Resolve a scope reference like "$scope.item.name"
 * Searches up the scope chain
 */
export function resolveScopeReference(scope: ScopeContext, path: string): unknown {
  // Remove "$scope." prefix if present
  const cleanPath = path.replace(/^\$scope\./, '');

  // Try to resolve in current scope
  const value = getNestedValue(scope.variables, cleanPath);
  if (value !== undefined) {
    return value;
  }

  // Try parent scope
  if (scope.parent) {
    return resolveScopeReference(scope.parent, cleanPath);
  }

  return undefined;
}

/**
 * Set a value in the scope
 */
export function setScopeValue(scope: ScopeContext, path: string, value: unknown): void {
  const cleanPath = path.replace(/^\$scope\./, '');
  setNestedValue(scope.variables, cleanPath, value);
}

/**
 * Check if a variable exists in the scope chain
 */
export function hasScopeVariable(scope: ScopeContext, name: string): boolean {
  if (name in scope.variables) {
    return true;
  }

  if (scope.parent) {
    return hasScopeVariable(scope.parent, name);
  }

  return false;
}

/**
 * Get all variables in the scope (flattened, with parent variables)
 */
export function getFlattenedScope(scope: ScopeContext): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Add parent variables first (so they can be overridden)
  if (scope.parent) {
    Object.assign(result, getFlattenedScope(scope.parent));
  }

  // Add current scope variables
  Object.assign(result, scope.variables);

  return result;
}

/**
 * Merge parent scope into a flat object for expression evaluation
 */
export function mergeScopeForEvaluation(scope: ScopeContext): Record<string, unknown> {
  return getFlattenedScope(scope);
}
