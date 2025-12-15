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
function deepMerge<T>(
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
        targetValue,
        sourceValue as DeepPartial<typeof targetValue>
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

  const config: any = {};

  // Server config
  const server: any = {};
  if (env['HTTP_PORT']) server.httpPort = parseInt(env['HTTP_PORT'], 10);
  if (env['WS_PORT']) server.wsPort = parseInt(env['WS_PORT'], 10);
  if (env['HOST']) server.host = env['HOST'];
  if (env['JWT_SECRET']) server.jwtSecret = env['JWT_SECRET'];
  if (env['AUTH_ENABLED']) server.authEnabled = env['AUTH_ENABLED'] === 'true';
  if (env['CORS_ORIGINS']) server.corsOrigins = env['CORS_ORIGINS'].split(',');
  if (env['BODY_LIMIT']) server.bodyLimit = env['BODY_LIMIT'];
  if (Object.keys(server).length > 0) config.server = server;

  // Runtime config
  const runtime: any = {};
  if (env['MAX_INSTANCES']) runtime.maxInstances = parseInt(env['MAX_INSTANCES'], 10);
  if (env['MIN_INSTANCES']) runtime.minInstances = parseInt(env['MIN_INSTANCES'], 10);
  if (env['MEMORY_LIMIT_MB']) runtime.memoryLimitBytes = parseInt(env['MEMORY_LIMIT_MB'], 10) * 1024 * 1024;
  if (env['TIMEOUT_MS']) runtime.timeoutMs = parseInt(env['TIMEOUT_MS'], 10);
  if (env['MAX_HOST_CALLS']) runtime.maxHostCalls = parseInt(env['MAX_HOST_CALLS'], 10);
  if (env['CACHE_DIR']) runtime.cacheDir = env['CACHE_DIR'];
  if (Object.keys(runtime).length > 0) config.runtime = runtime;

  // Extensions config
  const httpExt: any = {};
  if (env['HTTP_MAX_CONCURRENT']) httpExt.maxConcurrent = parseInt(env['HTTP_MAX_CONCURRENT'], 10);
  if (env['HTTP_TIMEOUT']) httpExt.defaultTimeout = parseInt(env['HTTP_TIMEOUT'], 10);
  if (env['HTTP_ALLOWED_DOMAINS']) httpExt.allowedDomains = env['HTTP_ALLOWED_DOMAINS'].split(',');
  if (Object.keys(httpExt).length > 0) {
    config.extensions = { http: httpExt };
  }

  // Logging config
  const logging: any = {};
  if (env['LOG_LEVEL']) logging.level = env['LOG_LEVEL'] as AppConfig['logging']['level'];
  if (env['LOG_PRETTY']) logging.pretty = env['LOG_PRETTY'] === 'true';
  if (Object.keys(logging).length > 0) config.logging = logging;

  return config;
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
  let config: AppConfig = { ...defaultConfig };

  // Merge environment variables
  const envConfig = removeUndefined(loadFromEnv()) as DeepPartial<AppConfig>;
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
