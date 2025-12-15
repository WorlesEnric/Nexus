/**
 * @nexus/reactor - Sandbox Context
 *
 * Utilities for creating and managing sandbox execution contexts
 */

import type { SandboxContext, RuntimeValue, ViewAPI, EmitFunction, LogFunction } from '../core/types';

/**
 * Create a sandbox context with all required APIs
 */
export function createSandboxContext(
  state: Record<string, RuntimeValue>,
  args: Record<string, unknown>,
  viewAPI: ViewAPI,
  emit: EmitFunction,
  ext: Record<string, unknown>,
  log: LogFunction
): SandboxContext {
  return {
    $state: state,
    $args: args,
    $view: viewAPI,
    $emit: emit,
    $ext: ext,
    $log: log,
  };
}

/**
 * Create a minimal sandbox context (for testing)
 */
export function createMinimalContext(state: Record<string, RuntimeValue> = {}): SandboxContext {
  return {
    $state: state,
    $args: {},
    $view: {
      getElementById: () => null,
    },
    $emit: () => {},
    $ext: {},
    $log: () => {},
  };
}

/**
 * Merge additional context into an existing context
 */
export function extendContext(
  base: SandboxContext,
  additional: Partial<SandboxContext>
): SandboxContext {
  return {
    ...base,
    ...additional,
  };
}

/**
 * Create context with only specific APIs enabled
 */
export function createRestrictedContext(
  apis: {
    state?: Record<string, RuntimeValue>;
    args?: Record<string, unknown>;
    view?: ViewAPI;
    emit?: EmitFunction;
    ext?: Record<string, unknown>;
    log?: LogFunction;
  }
): SandboxContext {
  return {
    $state: apis.state ?? {},
    $args: apis.args ?? {},
    $view: apis.view ?? { getElementById: () => null },
    $emit: apis.emit ?? (() => {}),
    $ext: apis.ext ?? {},
    $log: apis.log ?? (() => {}),
  };
}

/**
 * Validate that a context has all required properties
 */
export function validateContext(context: unknown): context is SandboxContext {
  if (!context || typeof context !== 'object') return false;

  const ctx = context as Record<string, unknown>;

  return (
    '$state' in ctx &&
    '$args' in ctx &&
    '$view' in ctx &&
    '$emit' in ctx &&
    '$ext' in ctx &&
    '$log' in ctx
  );
}

/**
 * Clone a context (shallow copy)
 */
export function cloneContext(context: SandboxContext): SandboxContext {
  return {
    $state: context.$state,
    $args: { ...context.$args },
    $view: context.$view,
    $emit: context.$emit,
    $ext: context.$ext,
    $log: context.$log,
  };
}
