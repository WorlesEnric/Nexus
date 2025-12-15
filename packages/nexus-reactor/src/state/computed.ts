/**
 * @nexus/reactor - Computed Values
 *
 * Utilities for working with computed values in the state store
 */

import type { StateStore } from './store';
import type { RuntimeValue } from '../core/types';
import { evaluateExpression } from '../utils/expression';

/**
 * Evaluate a computed value
 * This is called internally by the state proxy
 */
export function evaluateComputed(
  store: StateStore,
  name: string
): RuntimeValue {
  const expression = store.computedDefs.get(name);
  if (!expression) {
    throw new Error(`Computed value not found: ${name}`);
  }

  // Check cache first
  if (store.computedCache.has(name)) {
    return store.computedCache.get(name)!;
  }

  // Evaluate with read-only $state
  const result = evaluateExpression(expression, {
    $state: store.proxy,
  });

  // Cache the result
  store.computedCache.set(name, result as RuntimeValue);

  return result as RuntimeValue;
}

/**
 * Invalidate computed cache
 * Called when state changes
 */
export function invalidateComputedCache(store: StateStore): void {
  store.computedCache.clear();
}

/**
 * Check if a name is a computed value
 */
export function isComputed(store: StateStore, name: string): boolean {
  return store.computedDefs.has(name);
}

/**
 * Get all computed value names
 */
export function getComputedNames(store: StateStore): string[] {
  return Array.from(store.computedDefs.keys());
}

/**
 * Get the expression for a computed value
 */
export function getComputedExpression(store: StateStore, name: string): string | undefined {
  return store.computedDefs.get(name);
}

/**
 * Get all computed values and their expressions
 */
export function getAllComputed(store: StateStore): Map<string, string> {
  return new Map(store.computedDefs);
}

/**
 * Force re-evaluation of a specific computed value
 */
export function forceRecompute(store: StateStore, name: string): RuntimeValue {
  store.computedCache.delete(name);
  return evaluateComputed(store, name);
}

/**
 * Get all computed values (current values, not expressions)
 */
export function getComputedValues(store: StateStore): Record<string, RuntimeValue> {
  const result: Record<string, RuntimeValue> = {};

  for (const name of store.computedDefs.keys()) {
    result[name] = store.proxy[name];
  }

  return result;
}
