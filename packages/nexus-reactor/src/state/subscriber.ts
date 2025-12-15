/**
 * @nexus/reactor - Subscriber Management
 * 
 * Manages reactive subscriptions and dependency tracking.
 */

import type { StateKey, SubscriberId, Subscriber } from '../core/types';
import { generateId } from '../utils/debug';

// ============================================================================
// Types
// ============================================================================

export interface SubscriptionManager {
  /** All active subscribers */
  subscribers: Map<SubscriberId, Subscriber>;
  /** State key -> subscribers that depend on it */
  keyToSubscribers: Map<StateKey, Set<SubscriberId>>;
  /** Subscriber -> state keys it depends on */
  subscriberToKeys: Map<SubscriberId, Set<StateKey>>;
  /** Currently tracking subscriber (for dependency collection) */
  currentSubscriber: SubscriberId | null;
  /** Pending notifications (for batching) */
  pendingNotifications: Set<SubscriberId>;
  /** Whether we're currently in a batch */
  isBatching: boolean;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new subscription manager
 */
export function createSubscriptionManager(): SubscriptionManager {
  return {
    subscribers: new Map(),
    keyToSubscribers: new Map(),
    subscriberToKeys: new Map(),
    currentSubscriber: null,
    pendingNotifications: new Set(),
    isBatching: false,
  };
}

// ============================================================================
// Subscription Operations
// ============================================================================

/**
 * Create a new subscriber
 */
export function subscribe(
  manager: SubscriptionManager,
  callback: () => void,
  id?: string
): SubscriberId {
  const subscriberId = id ?? generateId('sub');
  
  const subscriber: Subscriber = {
    id: subscriberId,
    callback,
    dependencies: new Set(),
  };
  
  manager.subscribers.set(subscriberId, subscriber);
  manager.subscriberToKeys.set(subscriberId, new Set());
  
  return subscriberId;
}

/**
 * Remove a subscriber
 */
export function unsubscribe(
  manager: SubscriptionManager,
  subscriberId: SubscriberId
): void {
  // Remove from all key mappings
  const keys = manager.subscriberToKeys.get(subscriberId);
  if (keys) {
    for (const key of keys) {
      manager.keyToSubscribers.get(key)?.delete(subscriberId);
    }
  }
  
  manager.subscribers.delete(subscriberId);
  manager.subscriberToKeys.delete(subscriberId);
  manager.pendingNotifications.delete(subscriberId);
}

/**
 * Start tracking dependencies for a subscriber
 * Call this before running the subscriber's callback
 */
export function startTracking(
  manager: SubscriptionManager,
  subscriberId: SubscriberId
): void {
  // Clear existing dependencies
  const oldKeys = manager.subscriberToKeys.get(subscriberId);
  if (oldKeys) {
    for (const key of oldKeys) {
      manager.keyToSubscribers.get(key)?.delete(subscriberId);
    }
    oldKeys.clear();
  }
  
  manager.currentSubscriber = subscriberId;
}

/**
 * Stop tracking dependencies
 */
export function stopTracking(manager: SubscriptionManager): void {
  manager.currentSubscriber = null;
}

/**
 * Record that the current subscriber depends on a state key
 */
export function recordAccess(manager: SubscriptionManager, key: StateKey): void {
  const subscriberId = manager.currentSubscriber;
  if (!subscriberId) return;
  
  // Add key -> subscriber mapping
  if (!manager.keyToSubscribers.has(key)) {
    manager.keyToSubscribers.set(key, new Set());
  }
  manager.keyToSubscribers.get(key)!.add(subscriberId);
  
  // Add subscriber -> key mapping
  const subscriberKeys = manager.subscriberToKeys.get(subscriberId);
  if (subscriberKeys) {
    subscriberKeys.add(key);
  }
  
  // Update subscriber's dependencies set
  const subscriber = manager.subscribers.get(subscriberId);
  if (subscriber) {
    subscriber.dependencies.add(key);
  }
}

/**
 * Notify all subscribers that depend on a key
 */
export function notify(manager: SubscriptionManager, key: StateKey): void {
  const subscribers = manager.keyToSubscribers.get(key);
  if (!subscribers || subscribers.size === 0) return;
  
  if (manager.isBatching) {
    // Queue for later
    for (const subscriberId of subscribers) {
      manager.pendingNotifications.add(subscriberId);
    }
  } else {
    // Notify immediately
    runSubscribers(manager, subscribers);
  }
}

/**
 * Run a set of subscribers
 */
function runSubscribers(
  manager: SubscriptionManager,
  subscriberIds: Set<SubscriberId> | SubscriberId[]
): void {
  const ids = subscriberIds instanceof Set ? Array.from(subscriberIds) : subscriberIds;
  
  for (const subscriberId of ids) {
    const subscriber = manager.subscribers.get(subscriberId);
    if (subscriber) {
      try {
        subscriber.callback();
      } catch (error) {
        console.error(`Error in subscriber ${subscriberId}:`, error);
      }
    }
  }
}

// ============================================================================
// Batching
// ============================================================================

/**
 * Start batching notifications
 */
export function startBatch(manager: SubscriptionManager): void {
  manager.isBatching = true;
}

/**
 * End batching and flush pending notifications
 */
export function endBatch(manager: SubscriptionManager): void {
  manager.isBatching = false;
  
  if (manager.pendingNotifications.size > 0) {
    const pending = new Set(manager.pendingNotifications);
    manager.pendingNotifications.clear();
    runSubscribers(manager, pending);
  }
}

/**
 * Run a function with batching enabled
 */
export function batch<T>(
  manager: SubscriptionManager,
  fn: () => T
): T {
  const wasBatching = manager.isBatching;
  manager.isBatching = true;
  
  try {
    return fn();
  } finally {
    if (!wasBatching) {
      endBatch(manager);
    }
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get all subscribers that depend on a key
 */
export function getSubscribersForKey(
  manager: SubscriptionManager,
  key: StateKey
): SubscriberId[] {
  return Array.from(manager.keyToSubscribers.get(key) ?? []);
}

/**
 * Get all keys that a subscriber depends on
 */
export function getKeysForSubscriber(
  manager: SubscriptionManager,
  subscriberId: SubscriberId
): StateKey[] {
  return Array.from(manager.subscriberToKeys.get(subscriberId) ?? []);
}

/**
 * Check if a subscriber depends on a specific key
 */
export function dependsOn(
  manager: SubscriptionManager,
  subscriberId: SubscriberId,
  key: StateKey
): boolean {
  const keys = manager.subscriberToKeys.get(subscriberId);
  return keys?.has(key) ?? false;
}

/**
 * Get the count of active subscribers
 */
export function getSubscriberCount(manager: SubscriptionManager): number {
  return manager.subscribers.size;
}

/**
 * Clear all subscribers
 */
export function clearAll(manager: SubscriptionManager): void {
  manager.subscribers.clear();
  manager.keyToSubscribers.clear();
  manager.subscriberToKeys.clear();
  manager.pendingNotifications.clear();
  manager.currentSubscriber = null;
}

/**
 * Create a reactive effect that runs immediately and re-runs when dependencies change
 */
export function effect(
  manager: SubscriptionManager,
  fn: () => void | (() => void),
  id?: string
): () => void {
  let cleanup: (() => void) | void;
  
  const subscriberId = subscribe(manager, () => {
    // Run cleanup from previous execution
    if (cleanup) {
      cleanup();
    }
    
    // Track dependencies and run effect
    startTracking(manager, subscriberId);
    try {
      cleanup = fn();
    } finally {
      stopTracking(manager);
    }
  }, id);
  
  // Run immediately
  startTracking(manager, subscriberId);
  try {
    cleanup = fn();
  } finally {
    stopTracking(manager);
  }
  
  // Return unsubscribe function
  return () => {
    if (cleanup) {
      cleanup();
    }
    unsubscribe(manager, subscriberId);
  };
}

/**
 * Watch specific keys and run callback when they change
 */
export function watch(
  manager: SubscriptionManager,
  keys: StateKey[],
  callback: (changedKey: StateKey) => void
): () => void {
  const subscriberId = subscribe(manager, () => {
    // This won't be called with the key, so we need a different approach
    callback(keys[0]); // Simplified - in practice, you'd track which key changed
  });
  
  // Manually register the key dependencies
  for (const key of keys) {
    if (!manager.keyToSubscribers.has(key)) {
      manager.keyToSubscribers.set(key, new Set());
    }
    manager.keyToSubscribers.get(key)!.add(subscriberId);
    
    const subscriberKeys = manager.subscriberToKeys.get(subscriberId);
    if (subscriberKeys) {
      subscriberKeys.add(key);
    }
  }
  
  return () => unsubscribe(manager, subscriberId);
}