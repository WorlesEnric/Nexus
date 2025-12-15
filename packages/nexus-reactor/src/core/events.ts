/**
 * @nexus/reactor - Event System
 * 
 * Internal event emitter for reactor lifecycle and state events.
 */

import type { ReactorEventType, ReactorEvent, ReactorEventHandler } from './types';

/**
 * Type-safe event emitter for Reactor events
 */
export class ReactorEventEmitter {
  private handlers: Map<ReactorEventType, Set<ReactorEventHandler>>;
  private allHandlers: Set<ReactorEventHandler>;

  constructor() {
    this.handlers = new Map();
    this.allHandlers = new Set();
  }

  /**
   * Subscribe to a specific event type
   */
  on(type: ReactorEventType, handler: ReactorEventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /**
   * Subscribe to all events
   */
  onAll(handler: ReactorEventHandler): () => void {
    this.allHandlers.add(handler);
    return () => {
      this.allHandlers.delete(handler);
    };
  }

  /**
   * Subscribe to an event once
   */
  once(type: ReactorEventType, handler: ReactorEventHandler): () => void {
    const wrapper: ReactorEventHandler = (event) => {
      handler(event);
      this.off(type, wrapper);
    };
    return this.on(type, wrapper);
  }

  /**
   * Unsubscribe from a specific event type
   */
  off(type: ReactorEventType, handler: ReactorEventHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  /**
   * Emit an event
   */
  emit(type: ReactorEventType, payload?: unknown): void {
    const event: ReactorEvent = {
      type,
      payload,
      timestamp: Date.now(),
    };

    // Notify type-specific handlers
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in event handler for "${type}":`, error);
        }
      }
    }

    // Notify global handlers
    for (const handler of this.allHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(`Error in global event handler:`, error);
      }
    }
  }

  /**
   * Remove all handlers for a specific event type
   */
  removeAllListeners(type?: ReactorEventType): void {
    if (type) {
      this.handlers.delete(type);
    } else {
      this.handlers.clear();
      this.allHandlers.clear();
    }
  }

  /**
   * Get the number of listeners for an event type
   */
  listenerCount(type: ReactorEventType): number {
    return (this.handlers.get(type)?.size ?? 0) + this.allHandlers.size;
  }

  /**
   * Check if there are any listeners for an event type
   */
  hasListeners(type: ReactorEventType): boolean {
    return this.listenerCount(type) > 0;
  }
}

/**
 * Log stream for panel debugging
 */
export class LogStream {
  private logs: LogEntry[];
  private maxEntries: number;
  private listeners: Set<(entry: LogEntry) => void>;

  constructor(maxEntries = 1000) {
    this.logs = [];
    this.maxEntries = maxEntries;
    this.listeners = new Set();
  }

  /**
   * Add a log entry
   */
  log(level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      level,
      message,
      data,
    };

    this.logs.push(entry);

    // Trim if over max
    if (this.logs.length > this.maxEntries) {
      this.logs = this.logs.slice(-this.maxEntries);
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (error) {
        console.error('Error in log listener:', error);
      }
    }
  }

  /**
   * Convenience methods for different log levels
   */
  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  /**
   * Subscribe to new log entries
   */
  subscribe(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get all log entries
   */
  getAll(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get entries filtered by level
   */
  getByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter((entry) => entry.level === level);
  }

  /**
   * Get entries since a timestamp
   */
  getSince(timestamp: number): LogEntry[] {
    return this.logs.filter((entry) => entry.timestamp >= timestamp);
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Get the latest N entries
   */
  getLatest(count: number): LogEntry[] {
    return this.logs.slice(-count);
  }
}

/**
 * Log entry structure
 */
export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: unknown;
}

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Create a scoped event emitter for a specific panel
 */
export function createPanelEventEmitter(panelId: string): PanelEventEmitter {
  return new PanelEventEmitter(panelId);
}

/**
 * Panel-scoped event emitter with automatic event prefixing
 */
export class PanelEventEmitter extends ReactorEventEmitter {
  constructor(public readonly panelId: string) {
    super();
  }

  /**
   * Emit with panel context
   */
  emitWithContext(type: ReactorEventType, payload?: unknown): void {
    this.emit(type, {
      panelId: this.panelId,
      data: payload,
    });
  }
}

/**
 * Shared event bus for cross-panel communication
 */
export const globalEventBus = new ReactorEventEmitter();