/**
 * Extension System
 * 
 * Manages built-in and custom extensions that handlers can call
 * via the $ext.name.method() interface.
 */

import type { Extension, HttpExtensionConfig } from './types';
import { logger } from './logger';

/**
 * Extension Manager - registry and dispatcher for extensions
 */
export class ExtensionManager {
  private extensions: Map<string, Extension> = new Map();

  /**
   * Register an extension
   */
  register(extension: Extension): void {
    if (this.extensions.has(extension.name)) {
      throw new Error(`Extension ${extension.name} already registered`);
    }

    this.extensions.set(extension.name, extension);
    logger.info(
      { name: extension.name, methods: extension.methods },
      'Extension registered'
    );
  }

  /**
   * Unregister an extension
   */
  unregister(name: string): boolean {
    return this.extensions.delete(name);
  }

  /**
   * Check if extension exists
   */
  has(name: string): boolean {
    return this.extensions.has(name);
  }

  /**
   * Get extension by name
   */
  get(name: string): Extension | undefined {
    return this.extensions.get(name);
  }

  /**
   * Get available methods for an extension
   */
  getMethods(name: string): string[] {
    return this.extensions.get(name)?.methods ?? [];
  }

  /**
   * List all registered extensions
   */
  list(): string[] {
    return Array.from(this.extensions.keys());
  }

  /**
   * Call an extension method
   */
  async call(extensionName: string, method: string, args: unknown[]): Promise<unknown> {
    const extension = this.extensions.get(extensionName);
    if (!extension) {
      throw new Error(`Extension ${extensionName} not found`);
    }

    if (!extension.methods.includes(method)) {
      throw new Error(`Method ${method} not found on extension ${extensionName}`);
    }

    logger.debug(
      { extension: extensionName, method, argCount: args.length },
      'Calling extension method'
    );

    return extension.call(method, args);
  }

  /**
   * Initialize all extensions
   */
  async init(): Promise<void> {
    for (const [name, extension] of this.extensions) {
      if (extension.init) {
        logger.debug({ name }, 'Initializing extension');
        await extension.init();
      }
    }
  }

  /**
   * Shutdown all extensions
   */
  async shutdown(): Promise<void> {
    for (const [name, extension] of this.extensions) {
      if (extension.shutdown) {
        logger.debug({ name }, 'Shutting down extension');
        await extension.shutdown();
      }
    }
  }
}

/**
 * HTTP Extension - provides HTTP client capabilities
 */
export class HttpExtension implements Extension {
  readonly name = 'http';
  readonly methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'request'];

  private config: HttpExtensionConfig;
  private activeRequests = 0;
  private pendingQueue: Array<() => void> = [];

  constructor(config: HttpExtensionConfig = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 10,
      defaultTimeout: config.defaultTimeout ?? 30000,
      userAgent: config.userAgent ?? 'Nexus-Runtime/1.0',
      ...(config.allowedDomains !== undefined && { allowedDomains: config.allowedDomains }),
    };
  }

  async init(): Promise<void> {
    logger.info(
      { maxConcurrent: this.config.maxConcurrent, timeout: this.config.defaultTimeout },
      'HTTP extension initialized'
    );
  }

  async shutdown(): Promise<void> {
    // Cancel pending requests by rejecting the queue
    while (this.pendingQueue.length > 0) {
      // Just clear - actual cancellation would need AbortControllers
    }
    this.pendingQueue = [];
  }

  async call(method: string, args: unknown[]): Promise<unknown> {
    switch (method) {
      case 'get':
        return this.get(args[0] as string, args[1] as RequestOptions | undefined);
      case 'post':
        return this.post(args[0] as string, args[1], args[2] as RequestOptions | undefined);
      case 'put':
        return this.put(args[0] as string, args[1], args[2] as RequestOptions | undefined);
      case 'patch':
        return this.patch(args[0] as string, args[1], args[2] as RequestOptions | undefined);
      case 'delete':
        return this.delete(args[0] as string, args[1] as RequestOptions | undefined);
      case 'head':
        return this.head(args[0] as string, args[1] as RequestOptions | undefined);
      case 'options':
        return this.options(args[0] as string, args[1] as RequestOptions | undefined);
      case 'request':
        return this.request(args[0] as RequestConfig);
      default:
        throw new Error(`Unknown HTTP method: ${method}`);
    }
  }

  /**
   * GET request
   */
  async get(url: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.request({ method: 'GET', url, ...options });
  }

  /**
   * POST request
   */
  async post(url: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse> {
    return this.request({ method: 'POST', url, body, ...options });
  }

  /**
   * PUT request
   */
  async put(url: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse> {
    return this.request({ method: 'PUT', url, body, ...options });
  }

  /**
   * PATCH request
   */
  async patch(url: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse> {
    return this.request({ method: 'PATCH', url, body, ...options });
  }

  /**
   * DELETE request
   */
  async delete(url: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.request({ method: 'DELETE', url, ...options });
  }

  /**
   * HEAD request
   */
  async head(url: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.request({ method: 'HEAD', url, ...options });
  }

  /**
   * OPTIONS request
   */
  async options(url: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.request({ method: 'OPTIONS', url, ...options });
  }

  /**
   * Generic request
   */
  async request(config: RequestConfig): Promise<HttpResponse> {
    // Validate URL domain if restricted
    if (this.config.allowedDomains && this.config.allowedDomains.length > 0) {
      const url = new URL(config.url);
      if (!this.config.allowedDomains.includes(url.hostname)) {
        throw new Error(`Domain ${url.hostname} not in allowed list`);
      }
    }

    // Wait for available slot
    await this.acquireSlot();

    try {
      const controller = new AbortController();
      const timeout = config.timeout ?? this.config.defaultTimeout!;

      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        // Build fetch options
        const headers = new Headers(config.headers);
        if (!headers.has('User-Agent')) {
          headers.set('User-Agent', this.config.userAgent!);
        }

        let body: string | undefined;
        if (config.body !== undefined) {
          if (typeof config.body === 'string') {
            body = config.body;
          } else {
            body = JSON.stringify(config.body);
            if (!headers.has('Content-Type')) {
              headers.set('Content-Type', 'application/json');
            }
          }
        }

        const response = await fetch(config.url, {
          method: config.method ?? 'GET',
          headers,
          ...(body !== undefined && { body }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Parse response
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        let data: unknown;
        const contentType = response.headers.get('content-type');

        if (contentType?.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        return {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          data,
          ok: response.ok,
        };
      } catch (err) {
        clearTimeout(timeoutId);

        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw err;
      }
    } finally {
      this.releaseSlot();
    }
  }

  /**
   * Acquire a request slot (for concurrency control)
   */
  private async acquireSlot(): Promise<void> {
    if (this.activeRequests < this.config.maxConcurrent!) {
      this.activeRequests++;
      return;
    }

    // Wait for a slot
    return new Promise<void>((resolve) => {
      this.pendingQueue.push(() => {
        this.activeRequests++;
        resolve();
      });
    });
  }

  /**
   * Release a request slot
   */
  private releaseSlot(): void {
    this.activeRequests--;

    // Wake up next waiting request
    const next = this.pendingQueue.shift();
    if (next) {
      next();
    }
  }
}

/** Request options */
interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

/** Full request configuration */
interface RequestConfig extends RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  body?: unknown;
}

/** HTTP response */
interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  ok: boolean;
}

/** Singleton extension manager */
let extensionManagerInstance: ExtensionManager | null = null;

/**
 * Get the extension manager instance
 */
export function getExtensionManager(): ExtensionManager {
  if (!extensionManagerInstance) {
    extensionManagerInstance = new ExtensionManager();
  }
  return extensionManagerInstance;
}

/**
 * Initialize extension manager with default extensions
 */
export async function initExtensions(config: {
  http?: HttpExtensionConfig;
}): Promise<ExtensionManager> {
  const manager = getExtensionManager();

  // Register built-in extensions
  if (config.http !== undefined || !manager.has('http')) {
    manager.register(new HttpExtension(config.http));
  }

  await manager.init();
  return manager;
}

/**
 * Shutdown and reset extension manager
 */
export async function shutdownExtensions(): Promise<void> {
  if (extensionManagerInstance) {
    await extensionManagerInstance.shutdown();
    extensionManagerInstance = null;
  }
}
