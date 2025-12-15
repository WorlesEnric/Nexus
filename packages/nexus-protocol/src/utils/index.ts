/**
 * @fileoverview Utility module exports
 * @module @nexus/protocol/utils
 * 
 * Common utilities for working with Nexus Protocol types.
 */

export type {
  DeepReadonly,
  DeepPartial,
  RequireKeys,
  OptionalKeys,
  Result,
  Success,
  Failure,
} from './types';

export {
  generateId,
  generateShortId,
  deepClone,
  deepMerge,
  pick,
  omit,
  groupBy,
  uniqueBy,
  arrayDiff,
  camelToKebab,
  kebabToCamel,
  truncate,
  isSuccess,
  isFailure,
  success,
  failure,
  retry,
  withTimeout,
} from './types';
