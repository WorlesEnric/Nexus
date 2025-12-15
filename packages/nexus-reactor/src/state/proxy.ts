/**
 * @nexus/reactor - Reactive Proxy
 * 
 * Proxy-based reactivity implementation for state tracking.
 */

import type { RuntimeValue, StateKey, SubscriberId } from '../core/types';
import { MAX_RECURSION_DEPTH } from '../core/constants';
import { StateError, SandboxError } from '../core/errors';
import { createDebugger } from '../utils/debug';

const debug = createDebugger('Proxy');

// ============================================================================
// Types
// ============================================================================

export interface DependencyTracker {
  /** Currently active subscriber (component or computed) */
  activeSubscriber: SubscriberId | null;
  /** Map of state keys to their subscribers */
  dependencies: Map<StateKey, Set<SubscriberId>>;
  /** Map of subscribers to their dependencies */
  subscriberDeps: Map<SubscriberId, Set<StateKey>>;
  /** Callbacks for each subscriber */
  callbacks: Map<SubscriberId, () => void>;
  /** Current update depth for loop detection */
  updateDepth: number;
}

export interface ProxyOptions {
  /** Callback when state is accessed (for dependency tracking) */
  onGet?: (key: StateKey) => void;
  /** Callback when state is changed */
  onSet?: (key: StateKey, value: RuntimeValue, oldValue: RuntimeValue) => void;
  /** Type definitions for validation */
  types?: Map<string, string>;
  /** Whether this is a read-only proxy (for computed values) */
  readOnly?: boolean;
}

// ============================================================================
// Dependency Tracker
// ============================================================================

/**
 * Create a new dependency tracker
 */
export function createDependencyTracker(): DependencyTracker {
  return {
    activeSubscriber: null,
    dependencies: new Map(),
    subscriberDeps: new Map(),
    callbacks: new Map(),
    updateDepth: 0,
  };
}

/**
 * Begin tracking dependencies for a subscriber
 */
export function startTracking(
  tracker: DependencyTracker,
  subscriberId: SubscriberId,
  callback: () => void
): void {
  // Clear old dependencies for this subscriber
  const oldDeps = tracker.subscriberDeps.get(subscriberId);
  if (oldDeps) {
    for (const key of oldDeps) {
      tracker.dependencies.get(key)?.delete(subscriberId);
    }
  }
  
  tracker.subscriberDeps.set(subscriberId, new Set());
  tracker.callbacks.set(subscriberId, callback);
  tracker.activeSubscriber = subscriberId;
}

/**
 * Stop tracking dependencies
 */
export function stopTracking(tracker: DependencyTracker): void {
  tracker.activeSubscriber = null;
}

/**
 * Record a dependency access
 */
export function recordDependency(tracker: DependencyTracker, key: StateKey): void {
  const subscriber = tracker.activeSubscriber;
  if (!subscriber) return;

  // Add to dependencies map
  if (!tracker.dependencies.has(key)) {
    tracker.dependencies.set(key, new Set());
  }
  tracker.dependencies.get(key)!.add(subscriber);

  // Add to subscriber's deps
  if (!tracker.subscriberDeps.has(subscriber)) {
    tracker.subscriberDeps.set(subscriber, new Set());
  }
  tracker.subscriberDeps.get(subscriber)!.add(key);

  debug.log(`Dependency: ${subscriber} -> ${key}`);
}

/**
 * Notify all subscribers of a state change
 */
export function notifySubscribers(tracker: DependencyTracker, key: StateKey): void {
  const subscribers = tracker.dependencies.get(key);
  if (!subscribers || subscribers.size === 0) return;

  // Check for infinite loops
  tracker.updateDepth++;
  if (tracker.updateDepth > MAX_RECURSION_DEPTH) {
    tracker.updateDepth = 0;
    throw SandboxError.recursionLimit(MAX_RECURSION_DEPTH);
  }

  debug.log(`Notifying ${subscribers.size} subscribers for key: ${key}`);

  // Collect and run callbacks
  const callbacksToRun: Array<() => void> = [];
  for (const subscriberId of subscribers) {
    const callback = tracker.callbacks.get(subscriberId);
    if (callback) {
      callbacksToRun.push(callback);
    }
  }

  // Run callbacks outside the loop to avoid modification during iteration
  for (const callback of callbacksToRun) {
    try {
      callback();
    } catch (error) {
      console.error('Error in subscriber callback:', error);
    }
  }

  tracker.updateDepth--;
}

/**
 * Remove a subscriber and its dependencies
 */
export function removeSubscriber(
  tracker: DependencyTracker,
  subscriberId: SubscriberId
): void {
  const deps = tracker.subscriberDeps.get(subscriberId);
  if (deps) {
    for (const key of deps) {
      tracker.dependencies.get(key)?.delete(subscriberId);
    }
  }
  tracker.subscriberDeps.delete(subscriberId);
  tracker.callbacks.delete(subscriberId);
}

// ============================================================================
// Reactive Proxy
// ============================================================================

/**
 * Create a reactive proxy for state
 */
export function createReactiveProxy(
  target: Record<string, RuntimeValue>,
  options: ProxyOptions = {}
): Record<string, RuntimeValue> {
  const { onGet, onSet, types, readOnly } = options;

  const handler: ProxyHandler<Record<string, RuntimeValue>> = {
    get(obj, prop) {
      if (typeof prop !== 'string') return Reflect.get(obj, prop);
      
      const value = obj[prop];
      
      // Track the dependency
      if (onGet) {
        onGet(prop);
      }

      // If value is an object or array, wrap it in a proxy too
      if (value !== null && typeof value === 'object') {
        return createNestedProxy(value, prop, options);
      }

      return value;
    },

    set(obj, prop, value) {
      if (typeof prop !== 'string') return Reflect.set(obj, prop, value);
      
      if (readOnly) {
        throw StateError.readOnlyComputed(prop);
      }

      const oldValue = obj[prop];
      
      // Type validation if types are defined
      if (types?.has(prop)) {
        const expectedType = types.get(prop)!;
        if (!validateType(value, expectedType)) {
          throw StateError.typeMismatch(prop, expectedType, typeof value);
        }
      }

      // Set the value
      obj[prop] = value as RuntimeValue;

      // Notify if changed
      if (onSet && !valuesEqual(oldValue, value as RuntimeValue)) {
        onSet(prop, value as RuntimeValue, oldValue);
      }

      return true;
    },

    deleteProperty(obj, prop) {
      if (typeof prop !== 'string') return Reflect.deleteProperty(obj, prop);
      
      if (readOnly) {
        throw StateError.readOnlyComputed(prop);
      }

      const oldValue = obj[prop];
      delete obj[prop];

      if (onSet && oldValue !== undefined) {
        onSet(prop, undefined, oldValue);
      }

      return true;
    },

    has(obj, prop) {
      return Reflect.has(obj, prop);
    },

    ownKeys(obj) {
      return Reflect.ownKeys(obj);
    },

    getOwnPropertyDescriptor(obj, prop) {
      return Reflect.getOwnPropertyDescriptor(obj, prop);
    },
  };

  return new Proxy(target, handler);
}

/**
 * Create a nested proxy for objects and arrays within state
 */
function createNestedProxy(
  target: RuntimeValue,
  parentKey: string,
  options: ProxyOptions
): RuntimeValue {
  if (target === null || typeof target !== 'object') {
    return target;
  }

  const { onGet, onSet, readOnly } = options;

  const handler: ProxyHandler<object> = {
    get(obj, prop) {
      if (typeof prop !== 'string' && typeof prop !== 'number') {
        return Reflect.get(obj, prop);
      }

      const value = Reflect.get(obj, prop);

      // Track nested access
      if (onGet) {
        onGet(`${parentKey}.${String(prop)}`);
      }

      // Recursively proxy nested objects
      if (value !== null && typeof value === 'object') {
        return createNestedProxy(value, `${parentKey}.${String(prop)}`, options);
      }

      return value;
    },

    set(obj, prop, value) {
      if (readOnly) {
        throw StateError.readOnlyComputed(parentKey);
      }

      const oldValue = Reflect.get(obj, prop);
      Reflect.set(obj, prop, value);

      // Notify on the parent key when nested values change
      if (onSet && !valuesEqual(oldValue as RuntimeValue, value as RuntimeValue)) {
        onSet(parentKey, undefined as unknown as RuntimeValue, undefined as RuntimeValue);
      }

      return true;
    },

    deleteProperty(obj, prop) {
      if (readOnly) {
        throw StateError.readOnlyComputed(parentKey);
      }

      Reflect.deleteProperty(obj, prop);

      if (onSet) {
        onSet(parentKey, undefined as unknown as RuntimeValue, undefined as RuntimeValue);
      }

      return true;
    },
  };

  return new Proxy(target as object, handler) as RuntimeValue;
}

// ============================================================================
// Utility Functions
// ============================================================================

function validateType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'list':
      return Array.isArray(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    default:
      return true;
  }
}

function valuesEqual(a: RuntimeValue, b: RuntimeValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (a === undefined || b === undefined) return a === b;
  
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  
  // For objects and arrays, do a shallow comparison
  // Deep comparison could be expensive for large objects
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => val === b[i]);
  }
  
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  
  if (keysA.length !== keysB.length) return false;
  
  return keysA.every(
    (key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key]
  );
}

/**
 * Create a read-only proxy that throws on write attempts
 */
export function createReadOnlyProxy<T extends object>(target: T): T {
  return new Proxy(target, {
    set() {
      throw new Error('Cannot modify read-only object');
    },
    deleteProperty() {
      throw new Error('Cannot delete from read-only object');
    },
  });
}

/**
 * Unwrap a proxy to get the raw target
 * Note: This only works with our own proxies that store the target
 */
export function unwrapProxy<T>(proxy: T): T {
  // In a real implementation, we'd need to track the mapping
  // For now, just return as-is
  return proxy;
}