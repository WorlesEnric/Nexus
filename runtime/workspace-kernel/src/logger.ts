/**
 * Logger configuration for Workspace Kernel
 */

import pino from 'pino';

/** Logger configuration options */
interface LoggerConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  pretty: boolean;
}

/** Default logger config (can be overridden) */
let loggerConfig: LoggerConfig = {
  level: (process.env['LOG_LEVEL'] as LoggerConfig['level']) ?? 'info',
  pretty: process.env['NODE_ENV'] !== 'production',
};

/** Create logger instance */
function createLogger(config: LoggerConfig): pino.Logger {
  const options: pino.LoggerOptions = {
    level: config.level,
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (config.pretty) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(options);
}

/** Global logger instance */
let loggerInstance: pino.Logger | null = null;

/** Get or create the logger */
export function getLogger(): pino.Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger(loggerConfig);
  }
  return loggerInstance;
}

/** Configure the logger (should be called before first use) */
export function configureLogger(config: Partial<LoggerConfig>): void {
  loggerConfig = { ...loggerConfig, ...config };
  // Reset instance so next call creates new logger with updated config
  loggerInstance = null;
}

/** Create a child logger with additional context */
export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return getLogger().child(bindings);
}

/** Reset logger (for testing) */
export function resetLogger(): void {
  loggerInstance = null;
}

/** 
 * Proxy logger that lazily initializes the actual logger.
 * This allows imports to work before config is ready.
 */
export const logger: pino.Logger = new Proxy({} as pino.Logger, {
  get(_target, prop: keyof pino.Logger) {
    const instance = getLogger();
    const value = instance[prop];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

export { pino };
