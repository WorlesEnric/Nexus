/**
 * TriLog OpenTelemetry Setup
 *
 * Provides helpers for initializing OpenTelemetry SDK with TriLog configuration
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import {
  LoggerProvider,
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
} from '@opentelemetry/sdk-logs';

/**
 * OpenTelemetry setup options
 */
export interface OtelSetupOptions {
  /**
   * Service name for this application
   */
  serviceName: string;

  /**
   * OTel Collector endpoint (gRPC)
   * @default 'http://localhost:4317'
   */
  collectorEndpoint?: string;

  /**
   * Service version
   */
  serviceVersion?: string;

  /**
   * Deployment environment
   */
  environment?: string;

  /**
   * Enable console logging for debugging
   * @default false
   */
  enableConsoleExporter?: boolean;

  /**
   * Additional resource attributes
   */
  resourceAttributes?: Record<string, string>;
}

/**
 * Global SDK instance
 */
let sdkInstance: NodeSDK | null = null;

/**
 * Setup OpenTelemetry for TriLog
 *
 * Initializes the OpenTelemetry SDK with OTLP log exporter configured
 * to send logs to the TriLog collector.
 *
 * @param options - Setup options
 * @returns The initialized NodeSDK instance
 *
 * @example
 * setupOtel({
 *   serviceName: 'my-app',
 *   collectorEndpoint: 'http://trilog-otel-collector.trilog-system.svc.cluster.local:4317',
 *   environment: 'production',
 * });
 */
export function setupOtel(options: OtelSetupOptions): NodeSDK {
  if (sdkInstance) {
    console.warn('OpenTelemetry SDK already initialized. Returning existing instance.');
    return sdkInstance;
  }

  const {
    serviceName,
    collectorEndpoint = 'http://localhost:4317',
    serviceVersion = '1.0.0',
    environment = 'development',
    enableConsoleExporter = false,
    resourceAttributes = {},
  } = options;

  // Create resource with service information
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
    'trilog.sdk.language': 'typescript',
    'trilog.sdk.version': '1.0.0',
    ...resourceAttributes,
  });

  // Create OTLP log exporter
  const otlpExporter = new OTLPLogExporter({
    url: collectorEndpoint,
    // Add any additional exporter configuration here
  });

  // Create logger provider
  const loggerProvider = new LoggerProvider({
    resource,
  });

  // Add batch processor with OTLP exporter
  loggerProvider.addLogRecordProcessor(
    new BatchLogRecordProcessor(otlpExporter, {
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
      scheduledDelayMillis: 1000,
    })
  );

  // Optionally add console exporter for debugging
  if (enableConsoleExporter) {
    loggerProvider.addLogRecordProcessor(
      new BatchLogRecordProcessor(new ConsoleLogRecordExporter())
    );
  }

  // Create and configure SDK
  const sdk = new NodeSDK({
    resource,
    logRecordProcessor: new BatchLogRecordProcessor(otlpExporter),
  });

  // Start the SDK
  sdk.start();

  // Handle graceful shutdown
  const shutdownHandler = () => {
    sdk
      .shutdown()
      .then(() => console.log('TriLog OpenTelemetry SDK shutdown successfully'))
      .catch((error) => console.error('Error shutting down TriLog OpenTelemetry SDK', error))
      .finally(() => process.exit(0));
  };

  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);

  // Store global instance
  sdkInstance = sdk;

  console.log(`TriLog OpenTelemetry initialized: ${serviceName} -> ${collectorEndpoint}`);

  return sdk;
}

/**
 * Get the current SDK instance
 *
 * @returns The NodeSDK instance or null if not initialized
 */
export function getOtelSDK(): NodeSDK | null {
  return sdkInstance;
}

/**
 * Shutdown OpenTelemetry SDK
 *
 * Flushes any pending telemetry and cleanly shuts down the SDK.
 */
export async function shutdownOtel(): Promise<void> {
  if (!sdkInstance) {
    console.warn('OpenTelemetry SDK not initialized');
    return;
  }

  try {
    await sdkInstance.shutdown();
    console.log('OpenTelemetry SDK shutdown successfully');
    sdkInstance = null;
  } catch (error) {
    console.error('Error shutting down OpenTelemetry SDK:', error);
    throw error;
  }
}

/**
 * Quick setup for Kubernetes deployments
 *
 * Uses standard Kubernetes service discovery to find the TriLog collector.
 *
 * @param serviceName - Your service name
 * @param namespace - TriLog namespace (default: 'trilog-system')
 *
 * @example
 * setupOtelKubernetes('my-app');
 */
export function setupOtelKubernetes(
  serviceName: string,
  namespace: string = 'trilog-system'
): NodeSDK {
  const collectorEndpoint = `http://trilog-otel-collector.${namespace}.svc.cluster.local:4317`;

  return setupOtel({
    serviceName,
    collectorEndpoint,
    environment: process.env.NODE_ENV || 'development',
  });
}

/**
 * Quick setup for local development
 *
 * Assumes TriLog is running locally (e.g., via docker-compose or port-forward).
 *
 * @param serviceName - Your service name
 *
 * @example
 * setupOtelLocal('my-app');
 */
export function setupOtelLocal(serviceName: string): NodeSDK {
  return setupOtel({
    serviceName,
    collectorEndpoint: 'http://localhost:4317',
    environment: 'development',
    enableConsoleExporter: true, // Enable console output for debugging
  });
}
