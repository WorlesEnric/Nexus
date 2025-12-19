/**
 * TriLog Context Anchoring
 *
 * The "Anchor" is the mechanism that ties all logs within a scope
 * to a specific TriLog Object. It uses OpenTelemetry Baggage for
 * context propagation, ensuring that even nested function calls
 * inherit the object ID.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { context, propagation, trace, Context, ROOT_CONTEXT } from '@opentelemetry/api';
import { TrilogObject } from '../dsl/base';

/**
 * Anchor context data
 */
export class AnchorContext {
  constructor(
    public objId: string,
    public objType: typeof TrilogObject,
    public createdAt: Date = new Date(),
    public parent?: AnchorContext,
    public metadata: Record<string, any> = {}
  ) {}

  /**
   * Get the type name
   */
  get typeName(): string {
    return this.objType.getTypeName();
  }

  /**
   * Get the OTel prefix
   */
  get otelPrefix(): string {
    return this.objType.getOtelPrefix();
  }

  /**
   * Convert to OpenTelemetry baggage entries
   */
  toBaggage(): Record<string, string> {
    return {
      'trilog.obj.id': this.objId,
      'trilog.obj.type': this.typeName,
      'trilog.anchor.created_at': this.createdAt.toISOString(),
    };
  }
}

/**
 * AsyncLocalStorage for anchor context
 */
const anchorStorage = new AsyncLocalStorage<AnchorContext>();

/**
 * Anchor function to bind logs to a specific object
 *
 * All logs and telemetry emitted within this context will automatically
 * be associated with the specified object ID. This uses OpenTelemetry
 * baggage for context propagation.
 *
 * @param objIdOrInstance - Object ID string or TrilogObject instance
 * @param objType - Object class (optional if passing instance)
 * @param fn - Function to execute with anchor context
 * @param metadata - Additional metadata to attach
 *
 * @example
 * anchor('cart_123', ShoppingCart, () => {
 *   logger.stateChange({ itemCount: 5 });
 *   // Nested async operations work automatically
 *   await processItems();
 * });
 *
 * @example
 * // Using with an object instance
 * const cart = new ShoppingCart('cart_123');
 * anchor(cart, undefined, () => {
 *   logger.stateChange(cart.toOtelAttributes());
 * });
 */
export function anchor<T>(
  objIdOrInstance: string | TrilogObject,
  objType?: typeof TrilogObject,
  fn?: () => T | Promise<T>,
  metadata?: Record<string, any>
): T | Promise<T> {
  // Extract objId and type
  let actualId: string;
  let actualType: typeof TrilogObject;

  if (typeof objIdOrInstance === 'string') {
    actualId = objIdOrInstance;
    if (!objType) {
      throw new Error('objType is required when passing objId as string');
    }
    actualType = objType;
  } else {
    actualId = objIdOrInstance.id;
    actualType = (objIdOrInstance.constructor as typeof TrilogObject);
  }

  if (!fn) {
    throw new Error('Function is required');
  }

  // Get parent anchor (if any)
  const parent = anchorStorage.getStore();

  // Create new anchor context
  const anchorCtx = new AnchorContext(
    actualId,
    actualType,
    new Date(),
    parent,
    metadata || {}
  );

  // Set OpenTelemetry baggage
  let otelCtx = context.active();
  const baggage = anchorCtx.toBaggage();
  for (const [key, value] of Object.entries(baggage)) {
    otelCtx = propagation.setBaggage(otelCtx, key, value, otelCtx);
  }

  // Run function with both OTel context and AsyncLocalStorage
  return context.with(otelCtx, () => {
    return anchorStorage.run(anchorCtx, fn);
  });
}

/**
 * Get the current anchor context
 *
 * @returns The active AnchorContext, or undefined if not anchored
 */
export function getCurrentAnchor(): AnchorContext | undefined {
  return anchorStorage.getStore();
}

/**
 * Get the current object ID from context
 *
 * This works even if called from code that doesn't have
 * direct access to the AnchorContext.
 *
 * @returns The current object ID, or undefined if not anchored
 */
export function getCurrentObjId(): string | undefined {
  const anchor = getCurrentAnchor();
  if (anchor) {
    return anchor.objId;
  }

  // Fallback to baggage
  const baggage = propagation.getBaggage(context.active());
  if (baggage) {
    const entry = baggage.getEntry('trilog.obj.id');
    return entry?.value;
  }

  return undefined;
}

/**
 * Get the current object type from context
 *
 * @returns The current object type name, or undefined if not anchored
 */
export function getCurrentObjType(): string | undefined {
  const anchor = getCurrentAnchor();
  if (anchor) {
    return anchor.typeName;
  }

  // Fallback to baggage
  const baggage = propagation.getBaggage(context.active());
  if (baggage) {
    const entry = baggage.getEntry('trilog.obj.type');
    return entry?.value;
  }

  return undefined;
}

/**
 * Get the full anchor stack (for nested anchors)
 *
 * @returns Array of anchor contexts from root to current
 */
export function getAnchorStack(): AnchorContext[] {
  const stack: AnchorContext[] = [];
  let current = getCurrentAnchor();

  while (current) {
    stack.unshift(current);
    current = current.parent;
  }

  return stack;
}

/**
 * Get the anchor depth (number of nested anchors)
 *
 * @returns The depth of anchor nesting
 */
export function getAnchorDepth(): number {
  return getAnchorStack().length;
}

/**
 * Get the root anchor context
 *
 * @returns The root AnchorContext, or undefined if not anchored
 */
export function getRootAnchor(): AnchorContext | undefined {
  const stack = getAnchorStack();
  return stack.length > 0 ? stack[0] : undefined;
}

/**
 * Decorator version of anchor (for class methods)
 *
 * @param objIdParam - Name of the parameter containing the object ID
 * @param objType - Object class type
 *
 * @example
 * class CartService {
 *   @anchored('cartId', ShoppingCart)
 *   async addItem(cartId: string, item: Item) {
 *     // All logs here are anchored to cartId
 *     logger.stateChange({ itemCount: this.getItemCount() });
 *   }
 * }
 */
export function anchored(objIdParam: string, objType: typeof TrilogObject) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      // Try to extract objId from arguments
      const paramNames = getParameterNames(originalMethod);
      const paramIndex = paramNames.indexOf(objIdParam);

      if (paramIndex === -1 || paramIndex >= args.length) {
        throw new Error(`Cannot find parameter '${objIdParam}' in method arguments`);
      }

      const objId = args[paramIndex];

      // Execute with anchor context
      return anchor(objId, objType, () => {
        return originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}

/**
 * Helper to extract parameter names from function
 */
function getParameterNames(fn: Function): string[] {
  const code = fn.toString();
  const match = code.match(/\(([^)]*)\)/);
  if (!match) return [];

  return match[1]
    .split(',')
    .map(param => param.trim().split('=')[0].trim())
    .filter(param => param.length > 0);
}
