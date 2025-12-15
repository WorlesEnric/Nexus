/**
 * Configuration management for Workspace Kernel
 */

import type { AppConfig, DeepPartial } from './types';

/** Default configuration */
const defaultConfig: AppConfig = {
  server: {
    httpPort: 3000,
    wsPort: 3001,
    host: '0.0.0.0',
    authEnabled: false,
    corsOrigins: ['*'],
    bodyLimit: '1mb',
  },
  runtime: {
    maxInstances: 10,
    minInstances: 2,
    memoryLimitBytes: 32 * 1024 * 1024, // 32MB
    timeoutMs: 5000,
    maxHostCalls: 1000,
    cacheDir: '/tmp/nexus-cache',
    maxCacheSizeBytes: 64 * 1024 * 1024, // 64MB
  },
  extensions: {
    http: {
      maxConcurrent: 10,
      defaultTimeout: 30000,
      userAgent: 'Nexus-Runtime/1.0',
    },
  },
  logging: {
    level: 'info',
    pretty: process.env['NODE_ENV'] !== 'production',
  },
};

/**
 * Deep merge two objects
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: DeepPartial<T>
): T {
  const result = { ...target };

  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as DeepPartial<Record<string, unknown>>
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Load configuration from environment variables
 */
function loadFromEnv(): DeepPartial<AppConfig> {
  const env = process.env;

  return {
    server: {
      httpPort: env['HTTP_PORT'] ? parseInt(env['HTTP_PORT'], 10) : undefined,
      wsPort: env['WS_PORT'] ? parseInt(env['WS_PORT'], 10) : undefined,
      host: env['HOST'],
      jwtSecret: env['JWT_SECRET'],
      authEnabled: env['AUTH_ENABLED'] === 'true',
      corsOrigins: env['CORS_ORIGINS']?.split(','),
      bodyLimit: env['BODY_LIMIT'],
    },
    runtime: {
      maxInstances: env['MAX_INSTANCES']
        ? parseInt(env['MAX_INSTANCES'], 10)
        : undefined,
      minInstances: env['MIN_INSTANCES']
        ? parseInt(env['MIN_INSTANCES'], 10)
        : undefined,
      memoryLimitBytes: env['MEMORY_LIMIT_MB']
        ? parseInt(env['MEMORY_LIMIT_MB'], 10) * 1024 * 1024
        : undefined,
      timeoutMs: env['TIMEOUT_MS']
        ? parseInt(env['TIMEOUT_MS'], 10)
        : undefined,
      maxHostCalls: env['MAX_HOST_CALLS']
        ? parseInt(env['MAX_HOST_CALLS'], 10)
        : undefined,
      cacheDir: env['CACHE_DIR'],
    },
    extensions: {
      http: {
        maxConcurrent: env['HTTP_MAX_CONCURRENT']
          ? parseInt(env['HTTP_MAX_CONCURRENT'], 10)
          : undefined,
        defaultTimeout: env['HTTP_TIMEOUT']
          ? parseInt(env['HTTP_TIMEOUT'], 10)
          : undefined,
        allowedDomains: env['HTTP_ALLOWED_DOMAINS']?.split(','),
      },
    },
    logging: {
      level: env['LOG_LEVEL'] as AppConfig['logging']['level'],
      pretty: env['LOG_PRETTY'] === 'true',
    },
  };
}

/**
 * Remove undefined values from an object (for cleaner merging)
 */
function removeUndefined<T extends Record<string, unknown>>(obj: T): DeepPartial<T> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const cleaned = removeUndefined(value as Record<string, unknown>);
      if (Object.keys(cleaned).length > 0) {
        result[key] = cleaned;
      }
    } else {
      result[key] = value;
    }
  }

  return result as DeepPartial<T>;
}

/**
 * Load and validate configuration
 */
export function loadConfig(overrides?: DeepPartial<AppConfig>): AppConfig {
  // Start with defaults
  let config = { ...defaultConfig };

  // Merge environment variables
  const envConfig = removeUndefined(loadFromEnv());
  config = deepMerge(config, envConfig);

  // Merge explicit overrides
  if (overrides) {
    config = deepMerge(config, overrides);
  }

  // Validate
  validateConfig(config);

  return config;
}

/**
 * Validate configuration
 */
function validateConfig(config: AppConfig): void {
  // Server validation
  if (config.server.httpPort < 1 || config.server.httpPort > 65535) {
    throw new Error(`Invalid HTTP port: ${config.server.httpPort}`);
  }
  if (config.server.wsPort < 1 || config.server.wsPort > 65535) {
    throw new Error(`Invalid WebSocket port: ${config.server.wsPort}`);
  }
  if (config.server.authEnabled && !config.server.jwtSecret) {
    throw new Error('JWT secret required when authentication is enabled');
  }

  // Runtime validation
  if (config.runtime.maxInstances < 1) {
    throw new Error(`Invalid max instances: ${config.runtime.maxInstances}`);
  }
  if (config.runtime.memoryLimitBytes < 1024 * 1024) {
    throw new Error('Memory limit must be at least 1MB');
  }
  if (config.runtime.timeoutMs < 100) {
    throw new Error('Timeout must be at least 100ms');
  }

  // Logging validation
  const validLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLevels.includes(config.logging.level)) {
    throw new Error(`Invalid log level: ${config.logging.level}`);
  }
}

/**
 * Global configuration instance (loaded on first access)
 */
let globalConfig: AppConfig | null = null;

/**
 * Get the global configuration
 */
export function getConfig(): AppConfig {
  if (!globalConfig) {
    globalConfig = loadConfig();
  }
  return globalConfig;
}

/**
 * Initialize configuration with overrides
 */
export function initConfig(overrides?: DeepPartial<AppConfig>): AppConfig {
  globalConfig = loadConfig(overrides);
  return globalConfig;
}

/**
 * Reset configuration (for testing)
 */
export function resetConfig(): void {
  globalConfig = null;
}

export { defaultConfig };
