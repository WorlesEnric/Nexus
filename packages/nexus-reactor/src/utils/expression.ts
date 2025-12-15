/**
 * @nexus/reactor - Expression Utilities
 * 
 * Safe expression evaluation and binding resolution.
 */

import { BINDING_PATTERN, STATE_REF_PATTERN, SCOPE_REF_PATTERN } from '../core/constants';
import type { RuntimeValue, BindingExpression, Expression } from '../core/types';

/**
 * Check if a value is a binding expression: {expression}
 */
export function isBindingExpression(value: unknown): value is BindingExpression {
  if (typeof value !== 'string') return false;
  return BINDING_PATTERN.test(value.trim());
}

/**
 * Extract the expression from a binding: "{$state.count}" -> "$state.count"
 */
export function extractExpression(binding: BindingExpression): Expression {
  const match = binding.trim().match(BINDING_PATTERN);
  return match ? match[1].trim() : binding;
}

/**
 * Check if an expression references $state
 */
export function referencesState(expr: Expression): boolean {
  return /\$state\b/.test(expr);
}

/**
 * Check if an expression references $scope
 */
export function referencesScope(expr: Expression): boolean {
  return /\$scope\b/.test(expr);
}

/**
 * Extract state variable names from an expression
 * "$state.count + $state.total" -> ["count", "total"]
 */
export function extractStateRefs(expr: Expression): string[] {
  const refs: string[] = [];
  const regex = new RegExp(STATE_REF_PATTERN.source, 'g');
  let match;
  
  while ((match = regex.exec(expr)) !== null) {
    if (!refs.includes(match[1])) {
      refs.push(match[1]);
    }
  }
  
  return refs;
}

/**
 * Extract scope variable names from an expression
 * "$scope.item.name + $scope.index" -> ["item.name", "index"]
 */
export function extractScopeRefs(expr: Expression): string[] {
  const refs: string[] = [];
  const regex = new RegExp(SCOPE_REF_PATTERN.source, 'g');
  let match;
  
  while ((match = regex.exec(expr)) !== null) {
    if (!refs.includes(match[1])) {
      refs.push(match[1]);
    }
  }
  
  return refs;
}

/**
 * Safely evaluate an expression with given context
 * This uses Function constructor but with a restricted context
 */
export function evaluateExpression(
  expr: Expression,
  context: {
    $state?: Record<string, RuntimeValue>;
    $scope?: Record<string, unknown>;
  }
): unknown {
  try {
    // Create a safe evaluation function
    const fn = new Function(
      '$state',
      '$scope',
      `"use strict"; return (${expr});`
    );
    
    return fn(context.$state ?? {}, context.$scope ?? {});
  } catch (error) {
    console.error(`Error evaluating expression "${expr}":`, error);
    return undefined;
  }
}

/**
 * Resolve a binding expression to its value
 */
export function resolveBinding(
  binding: BindingExpression | string,
  context: {
    $state?: Record<string, RuntimeValue>;
    $scope?: Record<string, unknown>;
  }
): unknown {
  // If not a binding, return as-is
  if (!isBindingExpression(binding)) {
    return binding;
  }
  
  const expr = extractExpression(binding);
  return evaluateExpression(expr, context);
}

/**
 * Resolve all bindings in a props object
 */
export function resolveBindings(
  props: Record<string, unknown>,
  context: {
    $state?: Record<string, RuntimeValue>;
    $scope?: Record<string, unknown>;
  }
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'string' && isBindingExpression(value)) {
      resolved[key] = resolveBinding(value, context);
    } else {
      resolved[key] = value;
    }
  }
  
  return resolved;
}

/**
 * Get a nested property from an object using dot notation
 * getNestedValue({ a: { b: { c: 1 } } }, 'a.b.c') -> 1
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  
  return current;
}

/**
 * Set a nested property on an object using dot notation
 * setNestedValue({}, 'a.b.c', 1) -> { a: { b: { c: 1 } } }
 */
export function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const parts = path.split('.');
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  
  current[parts[parts.length - 1]] = value;
}

/**
 * Check if a binding expression references a specific state key
 */
export function bindingReferencesState(binding: string, stateKey: string): boolean {
  if (!isBindingExpression(binding)) return false;
  const expr = extractExpression(binding);
  const refs = extractStateRefs(expr);
  return refs.includes(stateKey);
}

/**
 * Create an expression evaluator with pre-bound context
 */
export function createExpressionEvaluator(context: {
  $state?: Record<string, RuntimeValue>;
  $scope?: Record<string, unknown>;
}) {
  return (expr: Expression) => evaluateExpression(expr, context);
}

/**
 * Parse args expression from binding
 * "[$scope.item.id]" -> evaluated array
 * "{ id: $scope.item.id }" -> evaluated object
 */
export function parseArgsExpression(
  args: string | unknown,
  context: {
    $state?: Record<string, RuntimeValue>;
    $scope?: Record<string, unknown>;
  }
): unknown {
  if (typeof args !== 'string') return args;
  
  // If it's a binding expression, evaluate it
  if (isBindingExpression(args)) {
    return resolveBinding(args, context);
  }
  
  // Try to parse as JSON-like expression
  try {
    // Replace $scope and $state references with context access
    const argsStr = String(args);
    const processed = argsStr
      .replace(/\$scope\./g, 'context.$scope.')
      .replace(/\$state\./g, 'context.$state.');

    const fn = new Function('context', `"use strict"; return (${processed});`);
    return fn({ $state: context.$state, $scope: context.$scope });
  } catch {
    return args;
  }
}

/**
 * Interpolate string with bindings
 * "Hello {$state.name}!" with $state.name = "World" -> "Hello World!"
 */
export function interpolateString(
  template: string,
  context: {
    $state?: Record<string, RuntimeValue>;
    $scope?: Record<string, unknown>;
  }
): string {
  return template.replace(/\{([^}]+)\}/g, (_match, expr) => {
    const value = evaluateExpression(expr.trim(), context);
    return value !== undefined && value !== null ? String(value) : '';
  });
}