/**
 * @nexus/reactor - View Registry
 *
 * Manages imperative access to rendered components via $view API
 */

import type { ViewHandle } from '../core/types';
import { createDebugger } from '../utils/debug';

const debug = createDebugger('view-registry');

export interface ViewRegistry {
  /** Map of component IDs to their handles */
  components: Map<string, ComponentRegistration>;

  /** Map of component IDs to transient props */
  transientProps: Map<string, Record<string, unknown>>;
}

interface ComponentRegistration {
  id: string;
  type: string;
  ref: unknown | null;
  forceUpdate: () => void;
  handle: ViewHandle;
}

/**
 * Create a new ViewRegistry
 */
export function createViewRegistry(): ViewRegistry {
  debug.log('Creating view registry');

  return {
    components: new Map(),
    transientProps: new Map(),
  };
}

/**
 * Register a component with the registry
 */
export function registerComponent(
  registry: ViewRegistry,
  id: string,
  type: string,
  ref: unknown | null,
  forceUpdate: () => void
): void {
  debug.log(`Registering component: ${id} (${type})`);

  const handle = createViewHandle(registry, id, forceUpdate);

  registry.components.set(id, {
    id,
    type,
    ref,
    forceUpdate,
    handle,
  });
}

/**
 * Unregister a component from the registry
 */
export function unregisterComponent(registry: ViewRegistry, id: string): void {
  debug.log(`Unregistering component: ${id}`);

  registry.components.delete(id);
  registry.transientProps.delete(id);
}

/**
 * Get a view handle for a component by ID
 */
export function getViewHandle(registry: ViewRegistry, id: string): ViewHandle | null {
  const registration = registry.components.get(id);
  return registration?.handle ?? null;
}

/**
 * Get transient props for a component
 * These are temporary prop overrides set via $view.setProp()
 */
export function getTransientProps(registry: ViewRegistry, id: string): Record<string, unknown> {
  return registry.transientProps.get(id) ?? {};
}

/**
 * Set a transient prop for a component
 */
export function setTransientProp(
  registry: ViewRegistry,
  id: string,
  prop: string,
  value: unknown
): void {
  debug.log(`Setting transient prop: ${id}.${prop}`, value);

  const existing = registry.transientProps.get(id) ?? {};
  registry.transientProps.set(id, {
    ...existing,
    [prop]: value,
  });

  // Trigger re-render
  const registration = registry.components.get(id);
  if (registration) {
    registration.forceUpdate();
  }
}

/**
 * Clear transient props for a component
 */
export function clearTransientProps(registry: ViewRegistry, id: string): void {
  debug.log(`Clearing transient props: ${id}`);

  registry.transientProps.delete(id);

  // Trigger re-render
  const registration = registry.components.get(id);
  if (registration) {
    registration.forceUpdate();
  }
}

/**
 * Create a ViewHandle for imperative component manipulation
 */
function createViewHandle(
  registry: ViewRegistry,
  id: string,
  forceUpdate: () => void
): ViewHandle {
  return {
    setProp(prop: string, value: unknown): void {
      setTransientProp(registry, id, prop, value);
    },

    call(method: string, ...args: unknown[]): void {
      debug.log(`Calling method ${method} on ${id}`, args);

      const registration = registry.components.get(id);
      if (!registration?.ref) {
        debug.warn(`No ref available for component ${id}`);
        return;
      }

      // Call method on the ref if it exists
      const target = registration.ref as any;
      if (typeof target[method] === 'function') {
        target[method](...args);
      } else {
        debug.warn(`Method ${method} not found on component ${id}`);
      }
    },
  };
}

/**
 * Get all registered component IDs
 */
export function getAllComponentIds(registry: ViewRegistry): string[] {
  return Array.from(registry.components.keys());
}

/**
 * Check if a component is registered
 */
export function hasComponent(registry: ViewRegistry, id: string): boolean {
  return registry.components.has(id);
}

/**
 * Get component info by ID
 */
export function getComponentInfo(registry: ViewRegistry, id: string): { id: string; type: string } | null {
  const registration = registry.components.get(id);
  if (!registration) return null;

  return {
    id: registration.id,
    type: registration.type,
  };
}
