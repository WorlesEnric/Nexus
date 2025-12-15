/**
 * Nexus Workspace Kernel
 * 
 * Main entry point that bootstraps the server and all subsystems.
 */

import { loadConfig, initConfig, getConfig } from './config';
import { initPanelManager, getPanelManager } from './panel';
import { initExecutor, shutdownExecutor, getExecutor } from './executor';
import { initExtensions, shutdownExtensions } from './extensions';
import { Server } from './server';
import { logger } from './logger';
import type { AppConfig, DeepPartial } from './types';

/** Application instance */
let server: Server | null = null;
let isShuttingDown = false;

/**
 * Start the Workspace Kernel
 */
export async function start(configOverrides?: DeepPartial<AppConfig>): Promise<Server> {
  logger.info('Starting Nexus Workspace Kernel');

  // Load configuration
  const config = initConfig(configOverrides);
  logger.info(
    {
      httpPort: config.server.httpPort,
      wsPort: config.server.wsPort,
      maxInstances: config.runtime.maxInstances,
    },
    'Configuration loaded'
  );

  // Initialize subsystems
  logger.debug('Initializing panel manager');
  initPanelManager({
    suspensionTimeoutMs: config.runtime.timeoutMs * 2,
  });

  logger.debug('Initializing WASM executor');
  await initExecutor(config.runtime);

  logger.debug('Initializing extensions');
  await initExtensions(config.extensions);

  // Create and start server
  logger.debug('Creating server');
  server = new Server(config);
  await server.start();

  // Setup graceful shutdown
  setupGracefulShutdown();

  logger.info('Nexus Workspace Kernel started successfully');
  return server;
}

/**
 * Stop the Workspace Kernel
 */
export async function stop(): Promise<void> {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress');
    return;
  }

  isShuttingDown = true;
  logger.info('Stopping Nexus Workspace Kernel');

  try {
    // Stop server
    if (server) {
      await server.stop();
      server = null;
    }

    // Shutdown subsystems
    await shutdownExtensions();
    await shutdownExecutor();
    await getPanelManager().shutdown();

    logger.info('Nexus Workspace Kernel stopped');
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'Error during shutdown'
    );
    throw err;
  } finally {
    isShuttingDown = false;
  }
}

/**
 * Setup graceful shutdown on process signals
 */
function setupGracefulShutdown(): void {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info({ signal }, 'Received shutdown signal');
      try {
        await stop();
        process.exit(0);
      } catch (err) {
        logger.error({ error: err }, 'Shutdown failed');
        process.exit(1);
      }
    });
  }

  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    logger.fatal({ error: err.message, stack: err.stack }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    process.exit(1);
  });
}

/**
 * Get the current server instance
 */
export function getServer(): Server | null {
  return server;
}

// Re-export commonly used items
export { getConfig } from './config';
export { getPanelManager } from './panel';
export { getExecutor } from './executor';
export { getExtensionManager } from './extensions';
export { logger } from './logger';
export * from './types';

// Run as main module
if (require.main === module) {
  start().catch((err) => {
    logger.fatal({ error: err.message }, 'Failed to start');
    process.exit(1);
  });
}
