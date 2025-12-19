/**
 * TriLog Setup for Graph Studio Frontend
 *
 * Initializes OpenTelemetry and TriLog for the React application.
 * Configures the OTLP exporter to send logs to the TriLog collector.
 */

import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, context } from '@opentelemetry/api';

let initialized = false;

/**
 * Initialize TriLog for the frontend application.
 *
 * Sets up OpenTelemetry with HTTP transport (browsers can't use gRPC).
 * Detects OTLP endpoint from environment or uses default localhost.
 */
export function initializeTriLog() {
  if (initialized) {
    console.log('TriLog already initialized');
    return;
  }

  // Get OTLP endpoint from environment
  // @ts-ignore - Vite environment variables
  const endpoint = import.meta.env.VITE_OTEL_ENDPOINT || 'http://localhost:4318/v1/traces';

  // Create resource with service metadata
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: 'graphstudio-frontend',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    'deployment.environment': import.meta.env.MODE || 'development',
    'trilog.registry.name': 'graphstudio',
    'trilog.registry.version': '1.0.0',
  });

  // Configure tracer provider
  const provider = new WebTracerProvider({
    resource,
  });

  // Add OTLP exporter (HTTP for browser compatibility)
  const exporter = new OTLPTraceExporter({
    url: endpoint,
  });

  provider.addSpanProcessor(new BatchSpanProcessor(exporter));

  // Register provider
  provider.register();

  initialized = true;
  console.log('✓ TriLog initialized (frontend)');
  console.log(`  OTLP Endpoint: ${endpoint}`);
  console.log(`  Environment: ${import.meta.env.MODE}`);
}

/**
 * Create a simple logger for structured frontend logging.
 *
 * This provides a lightweight logging interface that works with
 * OpenTelemetry spans for distributed tracing.
 */
export const logger = {
  /**
   * Log an informational message
   */
  info(message: string, attributes?: Record<string, any>) {
    const span = trace.getTracer('graphstudio-frontend').startSpan(message);
    if (attributes) {
      span.setAttributes(attributes);
    }
    span.end();
    console.log(`[INFO] ${message}`, attributes);
  },

  /**
   * Log a warning message
   */
  warn(message: string, attributes?: Record<string, any>) {
    const span = trace.getTracer('graphstudio-frontend').startSpan(message);
    if (attributes) {
      span.setAttributes({ severity: 'warning', ...attributes });
    }
    span.end();
    console.warn(`[WARN] ${message}`, attributes);
  },

  /**
   * Log an error message
   */
  error(message: string, error?: Error, attributes?: Record<string, any>) {
    const span = trace.getTracer('graphstudio-frontend').startSpan(message);
    const attrs = {
      severity: 'error',
      ...attributes,
      ...(error ? { 'error.message': error.message, 'error.stack': error.stack } : {}),
    };
    span.setAttributes(attrs);
    span.end();
    console.error(`[ERROR] ${message}`, error, attributes);
  },

  /**
   * Log an event
   */
  event(eventName: string, attributes?: Record<string, any>) {
    const span = trace.getTracer('graphstudio-frontend').startSpan(eventName);
    if (attributes) {
      span.setAttributes({ 'event.name': eventName, ...attributes });
    }
    span.end();
    console.log(`[EVENT] ${eventName}`, attributes);
  },

  /**
   * Log a state change
   */
  stateChange(attributes: Record<string, any>) {
    const span = trace.getTracer('graphstudio-frontend').startSpan('state_change');
    span.setAttributes({ 'event.type': 'state_change', ...attributes });
    span.end();
    console.log('[STATE_CHANGE]', attributes);
  },
};

/**
 * Simple anchor function for object context binding.
 *
 * In the frontend, this is a simplified version that just adds
 * attributes to the current span context.
 */
export function anchor<T>(objId: string, objType: string, fn: () => T): T {
  const span = trace.getTracer('graphstudio-frontend').startSpan('anchored_operation');
  span.setAttributes({
    'trilog.obj.id': objId,
    'trilog.obj.type': objType,
  });

  try {
    return fn();
  } finally {
    span.end();
  }
}
