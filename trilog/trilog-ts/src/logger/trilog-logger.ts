/**
 * TriLog Logger
 *
 * Enhanced logger with automatic context enrichment for TriLog
 */

import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { getCurrentAnchor } from '../context/anchor';

/**
 * Log severity levels
 */
export enum LogSeverity {
  TRACE = 'TRACE',
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

/**
 * TriLog logger with automatic context enrichment
 *
 * All log methods automatically include anchor context if available.
 *
 * @example
 * const logger = new TriLogLogger('shopping-cart');
 *
 * anchor('cart_123', ShoppingCart, () => {
 *   logger.stateChange({ itemCount: 5, totalValue: 99.99 });
 *   logger.event('item_added', { sku: 'WIDGET-001' });
 *   logger.info('Cart updated successfully');
 * });
 */
export class TriLogLogger {
  private logger: ReturnType<typeof logs.getLogger>;

  constructor(private name: string) {
    this.logger = logs.getLogger(name);
  }

  /**
   * Log a state change event
   *
   * Used when object fields are modified. The changes are automatically
   * prefixed with the object's OTel prefix from the anchor context.
   *
   * @param changes - Field changes as key-value pairs
   * @param additionalAttrs - Additional attributes to include
   *
   * @example
   * logger.stateChange({ itemCount: 5, totalValue: 99.99 });
   */
  stateChange(changes: Record<string, any>, additionalAttrs?: Record<string, any>): void {
    const anchor = getCurrentAnchor();

    if (!anchor) {
      console.warn('[TriLog] No anchor context - logs may not be properly attributed');
    }

    const attributes: Record<string, any> = {
      'trilog.event.type': 'state_change',
      ...this.enrichWithAnchor(),
      ...this.prefixAttributes(changes, anchor?.otelPrefix),
      ...(additionalAttrs || {}),
    };

    this.emit('State change', LogSeverity.INFO, attributes);
  }

  /**
   * Log a domain event
   *
   * Used for significant events that happen in the system (e.g., "item_added",
   * "payment_completed").
   *
   * @param eventName - Name of the event
   * @param data - Event data
   *
   * @example
   * logger.event('item_added', { sku: 'WIDGET-001', quantity: 2 });
   */
  event(eventName: string, data?: Record<string, any>): void {
    const attributes: Record<string, any> = {
      'trilog.event.type': 'event',
      'trilog.event.name': eventName,
      ...this.enrichWithAnchor(),
      ...(data || {}),
    };

    this.emit(eventName, LogSeverity.INFO, attributes);
  }

  /**
   * Log an action/command
   *
   * Used for operations or commands being executed (e.g., "checkout",
   * "send_notification").
   *
   * @param actionName - Name of the action
   * @param data - Action data
   *
   * @example
   * logger.action('checkout', { payment_method: 'credit_card' });
   */
  action(actionName: string, data?: Record<string, any>): void {
    const attributes: Record<string, any> = {
      'trilog.event.type': 'action',
      'trilog.action.name': actionName,
      ...this.enrichWithAnchor(),
      ...(data || {}),
    };

    this.emit(actionName, LogSeverity.INFO, attributes);
  }

  /**
   * Log an info message
   *
   * @param message - Log message
   * @param attributes - Additional attributes
   */
  info(message: string, attributes?: Record<string, any>): void {
    this.emit(message, LogSeverity.INFO, {
      ...this.enrichWithAnchor(),
      ...(attributes || {}),
    });
  }

  /**
   * Log a debug message
   *
   * @param message - Log message
   * @param attributes - Additional attributes
   */
  debug(message: string, attributes?: Record<string, any>): void {
    this.emit(message, LogSeverity.DEBUG, {
      ...this.enrichWithAnchor(),
      ...(attributes || {}),
    });
  }

  /**
   * Log a warning message
   *
   * @param message - Log message
   * @param attributes - Additional attributes
   */
  warn(message: string, attributes?: Record<string, any>): void {
    this.emit(message, LogSeverity.WARN, {
      ...this.enrichWithAnchor(),
      ...(attributes || {}),
    });
  }

  /**
   * Log an error message
   *
   * @param message - Error message
   * @param error - Error object
   * @param attributes - Additional attributes
   */
  error(message: string, error?: Error, attributes?: Record<string, any>): void {
    const errorAttrs: Record<string, any> = {};

    if (error) {
      errorAttrs['error.type'] = error.name;
      errorAttrs['error.message'] = error.message;
      errorAttrs['error.stack'] = error.stack;
    }

    this.emit(message, LogSeverity.ERROR, {
      ...this.enrichWithAnchor(),
      ...errorAttrs,
      ...(attributes || {}),
    });
  }

  /**
   * Emit a log record
   *
   * @param body - Log body/message
   * @param severity - Log severity
   * @param attributes - Log attributes
   */
  private emit(body: string, severity: LogSeverity, attributes: Record<string, any>): void {
    this.logger.emit({
      severityNumber: this.severityToNumber(severity),
      severityText: severity,
      body,
      attributes,
      timestamp: Date.now(),
    });
  }

  /**
   * Enrich attributes with anchor context
   */
  private enrichWithAnchor(): Record<string, any> {
    const anchor = getCurrentAnchor();

    if (!anchor) {
      return {};
    }

    return anchor.toBaggage();
  }

  /**
   * Prefix attributes with object's OTel prefix
   *
   * @param changes - Attribute changes
   * @param prefix - OTel prefix
   */
  private prefixAttributes(
    changes: Record<string, any>,
    prefix?: string
  ): Record<string, any> {
    if (!prefix) {
      return changes;
    }

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(changes)) {
      // Don't prefix if key already has a prefix
      if (key.includes('.')) {
        result[key] = value;
      } else {
        result[`${prefix}.${key}`] = value;
      }
    }

    return result;
  }

  /**
   * Convert severity enum to OpenTelemetry severity number
   */
  private severityToNumber(severity: LogSeverity): SeverityNumber {
    const mapping: Record<LogSeverity, SeverityNumber> = {
      [LogSeverity.TRACE]: SeverityNumber.TRACE,
      [LogSeverity.DEBUG]: SeverityNumber.DEBUG,
      [LogSeverity.INFO]: SeverityNumber.INFO,
      [LogSeverity.WARN]: SeverityNumber.WARN,
      [LogSeverity.ERROR]: SeverityNumber.ERROR,
      [LogSeverity.FATAL]: SeverityNumber.FATAL,
    };

    return mapping[severity] || SeverityNumber.INFO;
  }
}

/**
 * Create a new TriLog logger
 *
 * @param name - Logger name (typically the module/file name)
 *
 * @example
 * const logger = createLogger('shopping-cart-service');
 */
export function createLogger(name: string): TriLogLogger {
  return new TriLogLogger(name);
}
