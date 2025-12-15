/**
 * @nexus/reactor - Debug Utilities
 * 
 * Logging and debugging helpers.
 */

let debugEnabled = false;

/**
 * Enable or disable debug mode
 */
export function setDebugMode(enabled: boolean): void {
  debugEnabled = enabled;
}

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(): boolean {
  return debugEnabled;
}

/**
 * Create a namespaced debugger
 */
export function createDebugger(namespace: string) {
  const prefix = `[nexus:${namespace}]`;
  
  return {
    log(...args: unknown[]): void {
      if (debugEnabled) {
        console.log(prefix, ...args);
      }
    },
    
    warn(...args: unknown[]): void {
      if (debugEnabled) {
        console.warn(prefix, ...args);
      }
    },
    
    error(...args: unknown[]): void {
      // Errors always logged
      console.error(prefix, ...args);
    },
    
    group(label: string): void {
      if (debugEnabled) {
        console.group(`${prefix} ${label}`);
      }
    },
    
    groupEnd(): void {
      if (debugEnabled) {
        console.groupEnd();
      }
    },
    
    time(label: string): void {
      if (debugEnabled) {
        console.time(`${prefix} ${label}`);
      }
    },
    
    timeEnd(label: string): void {
      if (debugEnabled) {
        console.timeEnd(`${prefix} ${label}`);
      }
    },
    
    table(data: unknown): void {
      if (debugEnabled) {
        console.log(prefix);
        console.table(data);
      }
    },
  };
}

/**
 * Performance timing utility
 */
export function measureTime<T>(label: string, fn: () => T): T {
  if (!debugEnabled) {
    return fn();
  }
  
  const start = performance.now();
  try {
    return fn();
  } finally {
    const end = performance.now();
    console.log(`[nexus:perf] ${label}: ${(end - start).toFixed(2)}ms`);
  }
}

/**
 * Async performance timing utility
 */
export async function measureTimeAsync<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!debugEnabled) {
    return fn();
  }
  
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const end = performance.now();
    console.log(`[nexus:perf] ${label}: ${(end - start).toFixed(2)}ms`);
  }
}

/**
 * Assert a condition (throws in debug mode, logs in production)
 */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    const error = new Error(`Assertion failed: ${message}`);
    if (debugEnabled) {
      throw error;
    } else {
      console.error(error);
    }
  }
}

/**
 * Create a deferred promise for testing
 */
export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  
  return { promise, resolve, reject };
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

/**
 * Generate a unique ID
 */
export function generateId(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): T {
  let lastCall = 0;
  return ((...args: unknown[]) => {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      return fn(...args);
    }
  }) as T;
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}