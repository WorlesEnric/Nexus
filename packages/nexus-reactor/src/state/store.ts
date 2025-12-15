/**
 * @nexus/reactor - State Store
 */

import type { RuntimeValue, DataAST, NXMLPrimitiveType, StateKey, SubscriberId } from '../core/types';
import { StateError } from '../core/errors';
import { getDefaultForType, cloneValue } from '../utils/coercion';
import { evaluateExpression } from '../utils/expression';
import { createDebugger } from '../utils/debug';

const debug = createDebugger('state');

export interface StateStore {
  proxy: Record<string, RuntimeValue>;
  target: Record<string, RuntimeValue>;
  types: Map<string, NXMLPrimitiveType>;
  computedDefs: Map<string, string>;
  computedCache: Map<string, RuntimeValue>;
  subscribers: Map<StateKey, Set<SubscriberId>>;
  subscriberCallbacks: Map<SubscriberId, () => void>;
  currentSubscriber: SubscriberId | null;
  updateDepth: number;
}

export function createStateStore(data: DataAST, initialValues?: Record<string, RuntimeValue>): StateStore {
  const target: Record<string, RuntimeValue> = {};
  const types = new Map<string, NXMLPrimitiveType>();
  const computedDefs = new Map<string, string>();

  // Initialize state values
  for (const state of data.states) {
    types.set(state.name, state.type);
    target[state.name] = initialValues?.[state.name] ?? state.default ?? getDefaultForType(state.type);
  }

  // Register computed definitions
  for (const computed of data.computed) {
    computedDefs.set(computed.name, computed.value);
  }

  const store: StateStore = {
    proxy: {} as Record<string, RuntimeValue>,
    target,
    types,
    computedDefs,
    computedCache: new Map(),
    subscribers: new Map(),
    subscriberCallbacks: new Map(),
    currentSubscriber: null,
    updateDepth: 0,
  };

  // Create the reactive proxy
  store.proxy = createStateProxy(store);

  return store;
}

function createStateProxy(store: StateStore): Record<string, RuntimeValue> {
  return new Proxy(store.target, {
    get(obj, prop) {
      if (typeof prop !== 'string') return Reflect.get(obj, prop);

      // Track dependency
      if (store.currentSubscriber) {
        trackDependency(store, prop, store.currentSubscriber);
      }

      // Check if it's a computed value
      if (store.computedDefs.has(prop)) {
        return getComputedValue(store, prop);
      }

      const value = obj[prop];
      
      // Wrap nested objects/arrays
      if (value !== null && typeof value === 'object') {
        return createNestedProxy(store, value, prop);
      }

      return value;
    },

    set(obj, prop, value) {
      if (typeof prop !== 'string') return Reflect.set(obj, prop, value);

      // Prevent writing to computed values
      if (store.computedDefs.has(prop)) {
        throw StateError.readOnlyComputed(prop);
      }

      const oldValue = obj[prop];
      const expectedType = store.types.get(prop);

      // Type check if type is defined
      if (expectedType && !validateType(value, expectedType)) {
        debug.warn(`Type mismatch for ${prop}: expected ${expectedType}, got ${typeof value}`);
      }

      obj[prop] = value as RuntimeValue;

      // Notify subscribers if value changed
      if (!valuesEqual(oldValue, value as RuntimeValue)) {
        invalidateComputed(store);
        notifySubscribers(store, prop);
      }

      return true;
    },

    has(obj, prop) {
      if (typeof prop === 'string' && store.computedDefs.has(prop)) return true;
      return Reflect.has(obj, prop);
    },

    ownKeys(obj) {
      return [...Reflect.ownKeys(obj), ...store.computedDefs.keys()];
    },
  });
}

function createNestedProxy(store: StateStore, target: RuntimeValue, parentKey: string): RuntimeValue {
  if (target === null || typeof target !== 'object') return target;

  return new Proxy(target as object, {
    get(obj, prop) {
      if (typeof prop !== 'string' && typeof prop !== 'number') return Reflect.get(obj, prop);
      
      if (store.currentSubscriber) {
        trackDependency(store, parentKey, store.currentSubscriber);
      }

      const value = Reflect.get(obj, prop);
      if (value !== null && typeof value === 'object') {
        return createNestedProxy(store, value, parentKey);
      }
      return value;
    },

    set(obj, prop, value) {
      const oldValue = Reflect.get(obj, prop);
      Reflect.set(obj, prop, value);
      if (!valuesEqual(oldValue as RuntimeValue, value as RuntimeValue)) {
        invalidateComputed(store);
        notifySubscribers(store, parentKey);
      }
      return true;
    },
  }) as RuntimeValue;
}

function getComputedValue(store: StateStore, name: string): RuntimeValue {
  // Check cache
  if (store.computedCache.has(name)) {
    return store.computedCache.get(name)!;
  }

  const expr = store.computedDefs.get(name);
  if (!expr) return undefined;

  // Evaluate the expression
  const value = evaluateExpression(expr, { $state: store.proxy }) as RuntimeValue;
  store.computedCache.set(name, value);
  
  return value;
}

function invalidateComputed(store: StateStore): void {
  store.computedCache.clear();
}

function trackDependency(store: StateStore, key: StateKey, subscriberId: SubscriberId): void {
  if (!store.subscribers.has(key)) {
    store.subscribers.set(key, new Set());
  }
  store.subscribers.get(key)!.add(subscriberId);
}

function notifySubscribers(store: StateStore, key: StateKey): void {
  store.updateDepth++;
  
  if (store.updateDepth > 50) {
    store.updateDepth = 0;
    throw new Error('Maximum update depth exceeded - possible infinite loop');
  }

  const subs = store.subscribers.get(key);
  if (subs) {
    for (const subId of subs) {
      const callback = store.subscriberCallbacks.get(subId);
      if (callback) {
        try {
          callback();
        } catch (error) {
          console.error(`Error in subscriber ${subId}:`, error);
        }
      }
    }
  }

  store.updateDepth--;
}

function validateType(value: unknown, type: NXMLPrimitiveType): boolean {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'list': return Array.isArray(value);
    case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
    default: return true;
  }
}

function valuesEqual(a: RuntimeValue, b: RuntimeValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (a === undefined || b === undefined) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function subscribe(store: StateStore, callback: () => void, id?: string): string {
  const subscriberId = id ?? `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  store.subscriberCallbacks.set(subscriberId, callback);
  return subscriberId;
}

export function unsubscribe(store: StateStore, subscriberId: SubscriberId): void {
  store.subscriberCallbacks.delete(subscriberId);
  for (const subs of store.subscribers.values()) {
    subs.delete(subscriberId);
  }
}

export function getSnapshot(store: StateStore): Record<string, RuntimeValue> {
  return cloneValue(store.target) as Record<string, RuntimeValue>;
}

export function setState(store: StateStore, values: Record<string, RuntimeValue>): void {
  for (const [key, value] of Object.entries(values)) {
    store.proxy[key] = value;
  }
}

export function trackAccess<T>(store: StateStore, subscriberId: string, fn: () => T): T {
  const prev = store.currentSubscriber;
  store.currentSubscriber = subscriberId;
  try {
    return fn();
  } finally {
    store.currentSubscriber = prev;
  }
}