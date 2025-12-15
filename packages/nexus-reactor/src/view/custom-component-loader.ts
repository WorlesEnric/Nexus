/**
 * @nexus/reactor - Custom Component Loader
 *
 * Dynamically loads external React components for use in NXML panels.
 * Supports multiple loading strategies:
 * - npm packages: "@nexus-panels/figma-x6-editor"
 * - local files: "./components/MyComponent"
 * - CDN URLs: "https://cdn.example.com/panel.js"
 */

import React from 'react';

export interface ComponentLoadResult {
  /**
   * The loaded React component
   */
  component: React.ComponentType<any>;

  /**
   * Module metadata (for debugging/inspection)
   */
  metadata?: {
    source: string;
    loadedAt: Date;
    exports?: string[];
  };
}

export interface LoaderOptions {
  /**
   * Base path for resolving relative paths
   */
  basePath?: string;

  /**
   * Timeout for CDN loads (ms)
   */
  timeout?: number;

  /**
   * Custom module resolver (for advanced use cases)
   */
  resolver?: (module: string) => Promise<any>;
}

/**
 * Load a custom component from various sources
 *
 * @param module - Module path (@nexus-panels/foo, ./components/Bar, or https://...)
 * @param componentName - Named export to extract from the module
 * @param options - Loader configuration
 * @returns Promise resolving to the component
 */
export async function loadCustomComponent(
  module: string,
  componentName: string,
  options: LoaderOptions = {}
): Promise<ComponentLoadResult> {
  const { resolver } = options;

  // Use custom resolver if provided
  if (resolver) {
    const loaded = await resolver(module);
    const component = loaded[componentName] || loaded.default;
    if (!component) {
      throw new Error(`Component "${componentName}" not found in module "${module}"`);
    }
    return {
      component,
      metadata: {
        source: module,
        loadedAt: new Date(),
        exports: Object.keys(loaded),
      },
    };
  }

  // Determine loading strategy based on module path
  if (module.startsWith('http://') || module.startsWith('https://')) {
    return loadFromCDN(module, componentName, options);
  } else if (module.startsWith('./') || module.startsWith('../')) {
    return loadFromLocalFile(module, componentName, options);
  } else {
    return loadFromNPM(module, componentName, options);
  }
}

/**
 * Load component from npm package
 * Uses dynamic import to load the package
 */
async function loadFromNPM(
  packageName: string,
  componentName: string,
  _options: LoaderOptions
): Promise<ComponentLoadResult> {
  try {
    // Dynamic import of npm package
    const loaded = await import(/* webpackIgnore: true */ packageName);
    const component = loaded[componentName] || loaded.default;

    if (!component) {
      throw new Error(
        `Component "${componentName}" not found in package "${packageName}". ` +
        `Available exports: ${Object.keys(loaded).join(', ')}`
      );
    }

    if (typeof component !== 'function') {
      throw new Error(
        `Export "${componentName}" from "${packageName}" is not a React component`
      );
    }

    return {
      component,
      metadata: {
        source: packageName,
        loadedAt: new Date(),
        exports: Object.keys(loaded),
      },
    };
  } catch (error) {
    throw new Error(
      `Failed to load component from npm package "${packageName}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Load component from local file
 * Resolves relative paths and uses dynamic import
 */
async function loadFromLocalFile(
  filePath: string,
  componentName: string,
  options: LoaderOptions
): Promise<ComponentLoadResult> {
  const { basePath = '.' } = options;

  try {
    // Resolve relative path
    const resolvedPath = new URL(filePath, `file://${basePath}/`).pathname;

    // Dynamic import of local file
    const loaded = await import(/* webpackIgnore: true */ resolvedPath);
    const component = loaded[componentName] || loaded.default;

    if (!component) {
      throw new Error(
        `Component "${componentName}" not found in "${filePath}". ` +
        `Available exports: ${Object.keys(loaded).join(', ')}`
      );
    }

    if (typeof component !== 'function') {
      throw new Error(
        `Export "${componentName}" from "${filePath}" is not a React component`
      );
    }

    return {
      component,
      metadata: {
        source: resolvedPath,
        loadedAt: new Date(),
        exports: Object.keys(loaded),
      },
    };
  } catch (error) {
    throw new Error(
      `Failed to load component from local file "${filePath}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Load component from CDN URL
 * Fetches the script, evaluates it, and extracts the component
 */
async function loadFromCDN(
  url: string,
  componentName: string,
  options: LoaderOptions
): Promise<ComponentLoadResult> {
  const { timeout = 10000 } = options;

  try {
    // Fetch the script with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const scriptContent = await response.text();

    // Create a module namespace to capture exports
    const moduleNamespace: Record<string, any> = {};
    const moduleExports = moduleNamespace;

    // Evaluate the script in a controlled context
    // This is a simplified approach - production would need more security
    const scriptFunction = new Function(
      'module',
      'exports',
      'require',
      'React',
      scriptContent
    );

    scriptFunction(
      { exports: moduleExports },
      moduleExports,
      (name: string) => {
        if (name === 'react') return React;
        throw new Error(`CDN modules cannot require "${name}"`);
      },
      React
    );

    const component = moduleExports[componentName] || moduleExports.default;

    if (!component) {
      throw new Error(
        `Component "${componentName}" not found in CDN module. ` +
        `Available exports: ${Object.keys(moduleExports).join(', ')}`
      );
    }

    if (typeof component !== 'function') {
      throw new Error(
        `Export "${componentName}" from CDN is not a React component`
      );
    }

    return {
      component,
      metadata: {
        source: url,
        loadedAt: new Date(),
        exports: Object.keys(moduleExports),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`CDN load timeout after ${timeout}ms: ${url}`);
    }
    throw new Error(
      `Failed to load component from CDN "${url}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Validate that a value is a valid React component
 */
export function isReactComponent(value: any): value is React.ComponentType<any> {
  return (
    typeof value === 'function' &&
    (value.prototype?.isReactComponent || // Class component
      typeof value === 'function') // Function component (all functions could be)
  );
}

/**
 * Preload a component without rendering it
 * Useful for warming up the cache
 */
export async function preloadComponent(
  module: string,
  componentName: string,
  options: LoaderOptions = {}
): Promise<void> {
  await loadCustomComponent(module, componentName, options);
}
