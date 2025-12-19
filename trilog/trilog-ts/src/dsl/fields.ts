/**
 * TriLog Field Definitions and Decorators
 *
 * Provides field types and decorators for defining TriLog schemas
 */

import 'reflect-metadata';

/**
 * Field options for configuration
 */
export interface FieldOptions {
  default?: any;
  required?: boolean;
  indexed?: boolean;
  nullable?: boolean;
  minValue?: number;
  maxValue?: number;
  maxLength?: number;
  description?: string;
}

/**
 * Field class representing a schema field
 */
export class Field {
  constructor(
    public type: string,
    public options: FieldOptions = {}
  ) {}

  /**
   * Validate a value against field constraints
   */
  validate(value: any): boolean {
    // Null/undefined checks
    if (value === null || value === undefined) {
      if (this.options.required && !this.options.nullable) {
        throw new Error(`Field is required and cannot be null`);
      }
      return true;
    }

    // Type-specific validation
    switch (this.type) {
      case 'integer':
        if (!Number.isInteger(value)) {
          throw new Error(`Value must be an integer`);
        }
        if (this.options.minValue !== undefined && value < this.options.minValue) {
          throw new Error(`Value must be >= ${this.options.minValue}`);
        }
        if (this.options.maxValue !== undefined && value > this.options.maxValue) {
          throw new Error(`Value must be <= ${this.options.maxValue}`);
        }
        break;

      case 'float':
        if (typeof value !== 'number') {
          throw new Error(`Value must be a number`);
        }
        if (this.options.minValue !== undefined && value < this.options.minValue) {
          throw new Error(`Value must be >= ${this.options.minValue}`);
        }
        if (this.options.maxValue !== undefined && value > this.options.maxValue) {
          throw new Error(`Value must be <= ${this.options.maxValue}`);
        }
        break;

      case 'string':
        if (typeof value !== 'string') {
          throw new Error(`Value must be a string`);
        }
        if (this.options.maxLength && value.length > this.options.maxLength) {
          throw new Error(`String length must be <= ${this.options.maxLength}`);
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new Error(`Value must be a boolean`);
        }
        break;

      case 'timestamp':
        if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') {
          throw new Error(`Value must be a Date, ISO string, or timestamp`);
        }
        break;

      case 'list':
        if (!Array.isArray(value)) {
          throw new Error(`Value must be an array`);
        }
        break;

      case 'dict':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          throw new Error(`Value must be an object`);
        }
        break;
    }

    return true;
  }

  /**
   * Convert value to OpenTelemetry-compatible format
   */
  toOtelValue(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }

    switch (this.type) {
      case 'timestamp':
        if (value instanceof Date) {
          return value.toISOString();
        }
        if (typeof value === 'number') {
          return new Date(value).toISOString();
        }
        return value; // Already a string

      case 'list':
      case 'dict':
        return JSON.stringify(value);

      default:
        return value;
    }
  }

  /**
   * Get schema representation
   */
  toSchema(): Record<string, any> {
    return {
      type: this.type,
      ...this.options
    };
  }
}

/**
 * Metadata key for storing field information
 */
const TRILOG_FIELDS_KEY = Symbol('trilog:fields');

/**
 * Store field metadata on a class
 */
function storeFieldMetadata(target: any, propertyKey: string, field: Field): void {
  if (!target.constructor[TRILOG_FIELDS_KEY]) {
    target.constructor[TRILOG_FIELDS_KEY] = {};
  }
  target.constructor[TRILOG_FIELDS_KEY][propertyKey] = field;
}

/**
 * Get field metadata from a class
 */
export function getFieldMetadata(target: any): Record<string, Field> {
  return target[TRILOG_FIELDS_KEY] || {};
}

/**
 * Create a field decorator
 */
function createFieldDecorator(type: string, options?: FieldOptions) {
  return function (target: any, propertyKey: string) {
    const field = new Field(type, options || {});
    storeFieldMetadata(target, propertyKey, field);

    // Store metadata for reflection
    Reflect.defineMetadata('trilog:field', field, target, propertyKey);
    Reflect.defineMetadata('trilog:field:type', type, target, propertyKey);
  };
}

/**
 * Field decorators
 */
export const field = {
  /**
   * Integer field decorator
   */
  integer: (options?: FieldOptions) => createFieldDecorator('integer', options),

  /**
   * Float field decorator
   */
  float: (options?: FieldOptions) => createFieldDecorator('float', options),

  /**
   * String field decorator
   */
  string: (options?: FieldOptions) => createFieldDecorator('string', options),

  /**
   * Boolean field decorator
   */
  boolean: (options?: FieldOptions) => createFieldDecorator('boolean', options),

  /**
   * Timestamp field decorator
   */
  timestamp: (options?: FieldOptions) => createFieldDecorator('timestamp', options),

  /**
   * List field decorator
   */
  list: (options?: FieldOptions) => createFieldDecorator('list', options),

  /**
   * Dict field decorator
   */
  dict: (options?: FieldOptions) => createFieldDecorator('dict', options),

  /**
   * Reference field decorator (for foreign keys)
   */
  reference: (options?: FieldOptions) => createFieldDecorator('reference', options),
};

/**
 * Export field metadata key for use in base classes
 */
export const FIELDS_METADATA_KEY = TRILOG_FIELDS_KEY;
