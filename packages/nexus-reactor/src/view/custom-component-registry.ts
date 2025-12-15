/**
 * @nexus/reactor - Custom Component Registry
 *
 * Manages a cache of loaded custom components to avoid redundant fetches.
 * Provides lifecycle management and cache invalidation.
 */

import React from 'react';
import {
  loadCustomComponent,
  type ComponentLoadResult,
  type LoaderOptions,
} from './custom-component-loader';

export interface RegistryEntry {
  /**
   * The loaded React component
   */
  component: React.ComponentType<any>;

  /**
   * Module source (for cache key)
   */
  module: string;

  /**
   * Component name within the module
   */
  componentName: string;

  /**
   * When the component was loaded
   */
  loadedAt: Date;

  /**
   * Number of times this component has been requested
   */
  accessCount: number;

  /**
   * Last time this component was accessed
   */
  lastAccessedAt: Date;

  /**
   * Module metadata
   */
  metadata?: ComponentLoadResult['metadata'];
}

export interface RegistryStats {
  /**
   * Total number of cached components
   */
  size: number;

  /**
   * Total cache hits
   */
  hits: number;

  /**
   * Total cache misses
   */
  misses: number;

  /**
   * Cache hit rate (0-1)
   */
  hitRate: number;

  /**
   * Memory estimate (rough, based on entry count)
   */
  estimatedMemoryKB: number;
}

/**
 * Global custom component registry
 * Singleton pattern for component caching
 */
class CustomComponentRegistry {
  private cache: Map<string, RegistryEntry> = new Map();
  private loading: Map<string, Promise<RegistryEntry>> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
  };

  /**
   * Get a component from the registry, loading if necessary
   *
   * @param module - Module path
   * @param componentName - Component name to extract
   * @param options - Loader options
   * @returns The loaded component
   */
  async getComponent(
    module: string,
    componentName: string,
    options: LoaderOptions = {}
  ): Promise<React.ComponentType<any>> {
    const cacheKey = this.getCacheKey(module, componentName);

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.stats.hits++;
      cached.accessCount++;
      cached.lastAccessedAt = new Date();
      return cached.component;
    }

    // Check if already loading (deduplicate parallel requests)
    const existingLoad = this.loading.get(cacheKey);
    if (existingLoad) {
      const entry = await existingLoad;
      return entry.component;
    }

    // Load component
    this.stats.misses++;
    const loadPromise = this.loadAndCache(module, componentName, options);
    this.loading.set(cacheKey, loadPromise);

    try {
      const entry = await loadPromise;
      return entry.component;
    } finally {
      this.loading.delete(cacheKey);
    }
  }

  /**
   * Load a component and add it to the cache
   */
  private async loadAndCache(
    module: string,
    componentName: string,
    options: LoaderOptions
  ): Promise<RegistryEntry> {
    const result = await loadCustomComponent(module, componentName, options);
    const now = new Date();

    const entry: RegistryEntry = {
      component: result.component,
      module,
      componentName,
      loadedAt: now,
      accessCount: 1,
      lastAccessedAt: now,
      metadata: result.metadata,
    };

    const cacheKey = this.getCacheKey(module, componentName);
    this.cache.set(cacheKey, entry);

    return entry;
  }

  /**
   * Check if a component is in the cache
   */
  has(module: string, componentName: string): boolean {
    const cacheKey = this.getCacheKey(module, componentName);
    return this.cache.has(cacheKey);
  }

  /**
   * Remove a component from the cache
   */
  invalidate(module: string, componentName: string): boolean {
    const cacheKey = this.getCacheKey(module, componentName);
    return this.cache.delete(cacheKey);
  }

  /**
   * Clear all cached components
   */
  clear(): void {
    this.cache.clear();
    this.loading.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * Get all cached entries
   */
  entries(): RegistryEntry[] {
    return Array.from(this.cache.values());
  }

  /**
   * Get registry statistics
   */
  getStats(): RegistryStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      estimatedMemoryKB: this.cache.size * 50, // Rough estimate: 50KB per component
    };
  }

  /**
   * Prune cache based on strategy
   * Removes least recently used entries
   */
  prune(options: { maxSize?: number; maxAge?: number } = {}): number {
    const { maxSize, maxAge } = options;
    let prunedCount = 0;

    if (maxAge) {
      const cutoffTime = Date.now() - maxAge;
      for (const [key, entry] of this.cache.entries()) {
        if (entry.lastAccessedAt.getTime() < cutoffTime) {
          this.cache.delete(key);
          prunedCount++;
        }
      }
    }

    if (maxSize && this.cache.size > maxSize) {
      // Sort by last accessed (oldest first)
      const sorted = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].lastAccessedAt.getTime() - b[1].lastAccessedAt.getTime()
      );

      const toRemove = sorted.slice(0, this.cache.size - maxSize);
      for (const [key] of toRemove) {
        this.cache.delete(key);
        prunedCount++;
      }
    }

    return prunedCount;
  }

  /**
   * Preload a component into the cache
   */
  async preload(
    module: string,
    componentName: string,
    options: LoaderOptions = {}
  ): Promise<void> {
    await this.getComponent(module, componentName, options);
  }

  /**
   * Generate cache key from module and component name
   */
  private getCacheKey(module: string, componentName: string): string {
    return `${module}#${componentName}`;
  }

  /**
   * Get detailed information about a cached component
   */
  getEntry(module: string, componentName: string): RegistryEntry | undefined {
    const cacheKey = this.getCacheKey(module, componentName);
    return this.cache.get(cacheKey);
  }
}

// Singleton instance
const registry = new CustomComponentRegistry();

/**
 * Get the global custom component registry
 */
export function getCustomComponentRegistry(): CustomComponentRegistry {
  return registry;
}

/**
 * Convenience function to get a component from the registry
 */
export async function getCustomComponent(
  module: string,
  componentName: string,
  options: LoaderOptions = {}
): Promise<React.ComponentType<any>> {
  return registry.getComponent(module, componentName, options);
}

/**
 * Convenience function to check if a component is cached
 */
export function hasCustomComponent(module: string, componentName: string): boolean {
  return registry.has(module, componentName);
}

/**
 * Convenience function to invalidate a component
 */
export function invalidateCustomComponent(module: string, componentName: string): boolean {
  return registry.invalidate(module, componentName);
}

/**
 * Convenience function to preload a component
 */
export async function preloadCustomComponent(
  module: string,
  componentName: string,
  options: LoaderOptions = {}
): Promise<void> {
  await registry.preload(module, componentName, options);
}

// Export the registry instance as default
export default registry;
