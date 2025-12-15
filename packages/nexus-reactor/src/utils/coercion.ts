/**
 * @nexus/reactor - Type Coercion Utilities
 * 
 * Utilities for coercing values between NXML types.
 */

import type { NXMLPrimitiveType, RuntimeValue } from '../core/types';
import { TRUTHY_STRINGS, FALSY_STRINGS } from '../core/constants';

/**
 * Get the default value for an NXML type
 */
export function getDefaultForType(type: NXMLPrimitiveType): RuntimeValue {
  switch (type) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'list':
      return [];
    case 'object':
      return {};
    default:
      return undefined;
  }
}

/**
 * Parse a default value string to the appropriate runtime type
 * Used when parsing NXML default attributes
 */
export function parseDefaultValue(
  value: string | undefined,
  type: NXMLPrimitiveType
): RuntimeValue {
  if (value === undefined || value === '') {
    return getDefaultForType(type);
  }

  switch (type) {
    case 'string':
      return value;

    case 'number': {
      const num = Number(value);
      return isNaN(num) ? 0 : num;
    }

    case 'boolean': {
      const lower = value.toLowerCase().trim();
      if (TRUTHY_STRINGS.includes(lower)) return true;
      if (FALSY_STRINGS.includes(lower)) return false;
      return Boolean(value);
    }

    case 'list': {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // If not valid JSON, try to parse as comma-separated
        if (value.includes(',')) {
          return value.split(',').map((s) => s.trim());
        }
        return [];
      }
    }

    case 'object': {
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null ? parsed : {};
      } catch {
        return {};
      }
    }

    default:
      return value;
  }
}

/**
 * Coerce a runtime value to a specific type
 */
export function coerceToType(
  value: unknown,
  type: NXMLPrimitiveType
): RuntimeValue {
  if (value === undefined || value === null) {
    return getDefaultForType(type);
  }

  switch (type) {
    case 'string':
      return coerceToString(value);

    case 'number':
      return coerceToNumber(value);

    case 'boolean':
      return coerceToBoolean(value);

    case 'list':
      return coerceToList(value);

    case 'object':
      return coerceToObject(value);

    default:
      return value as RuntimeValue;
  }
}

/**
 * Coerce value to string
 */
export function coerceToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Coerce value to number
 */
export function coerceToNumber(value: unknown): number {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  if (typeof value === 'string') {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
}

/**
 * Coerce value to boolean
 */
export function coerceToBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (TRUTHY_STRINGS.includes(lower)) return true;
    if (FALSY_STRINGS.includes(lower)) return false;
  }
  return Boolean(value);
}

/**
 * Coerce value to list (array)
 */
export function coerceToList(value: unknown): RuntimeValue[] {
  if (Array.isArray(value)) return value as RuntimeValue[];
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [value];
    }
  }
  return [value as RuntimeValue];
}

/**
 * Coerce value to object
 */
export function coerceToObject(
  value: unknown
): Record<string, RuntimeValue> {
  if (value === null || value === undefined) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, RuntimeValue>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Not valid JSON
    }
  }
  return {};
}

/**
 * Validate that a value matches an NXML type
 */
export function validateValueType(
  value: unknown,
  type: NXMLPrimitiveType
): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'list':
      return Array.isArray(value);
    case 'object':
      return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      );
    default:
      return true;
  }
}

/**
 * Get the NXML type of a runtime value
 */
export function getValueType(value: unknown): NXMLPrimitiveType | 'unknown' {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'object') return 'object';
  return 'unknown';
}

/**
 * Deep clone a runtime value
 */
export function cloneValue(value: RuntimeValue): RuntimeValue {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }
  
  const clone: Record<string, RuntimeValue> = {};
  for (const [key, val] of Object.entries(value)) {
    clone[key] = cloneValue(val);
  }
  return clone;
}

/**
 * Deep compare two runtime values for equality
 */
export function valuesEqual(a: RuntimeValue, b: RuntimeValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (a === undefined || b === undefined) return a === b;
  
  const typeA = typeof a;
  const typeB = typeof b;
  
  if (typeA !== typeB) return false;
  
  if (typeA !== 'object') return a === b;
  
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => valuesEqual(val, b[i]));
  }
  
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  
  if (keysA.length !== keysB.length) return false;
  
  return keysA.every((key) =>
    valuesEqual(
      (a as Record<string, RuntimeValue>)[key],
      (b as Record<string, RuntimeValue>)[key]
    )
  );
}