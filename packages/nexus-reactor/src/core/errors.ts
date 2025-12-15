/**
 * @nexus/reactor - Error Classes
 * 
 * Custom error classes for different failure modes in the Reactor.
 */

import type { SourceLocation } from './types';
import { ERROR_CODES } from './constants';

/**
 * Base class for all Nexus Reactor errors
 */
export class NexusError extends Error {
  public readonly code: string;
  public readonly path?: string[];
  public readonly loc?: SourceLocation;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    options?: {
      path?: string[];
      loc?: SourceLocation;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'NexusError';
    this.code = code;
    this.path = options?.path;
    this.loc = options?.loc;
    this.details = options?.details;
  }

  /**
   * Format error for display
   */
  toString(): string {
    let str = `[${this.code}] ${this.message}`;
    
    if (this.path?.length) {
      str += `\n  Path: ${this.path.join(' > ')}`;
    }
    
    if (this.loc) {
      str += `\n  Location: line ${this.loc.startLine}, column ${this.loc.startColumn}`;
    }
    
    return str;
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      path: this.path,
      loc: this.loc,
      details: this.details,
    };
  }
}

/**
 * Error thrown during NXML parsing
 */
export class ParseError extends NexusError {
  constructor(
    message: string,
    options?: {
      loc?: SourceLocation;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(ERROR_CODES.PARSE_ERROR, message, {
      ...options,
      path: ['parser'],
    });
    this.name = 'ParseError';
  }

  static invalidXML(reason: string, loc?: SourceLocation): ParseError {
    return new ParseError(`Invalid XML: ${reason}`, { loc });
  }

  static unexpectedToken(token: string, expected: string, loc?: SourceLocation): ParseError {
    return new ParseError(`Unexpected token "${token}", expected ${expected}`, { loc });
  }

  static unclosedTag(tagName: string, loc?: SourceLocation): ParseError {
    return new ParseError(`Unclosed tag: <${tagName}>`, { loc });
  }
}

/**
 * Error thrown during AST validation
 */
export class ValidationError extends NexusError {
  public readonly severity: 'error' | 'warning';

  constructor(
    code: string,
    message: string,
    options?: {
      path?: string[];
      loc?: SourceLocation;
      severity?: 'error' | 'warning';
      details?: Record<string, unknown>;
    }
  ) {
    super(code, message, options);
    this.name = 'ValidationError';
    this.severity = options?.severity ?? 'error';
  }

  static duplicateState(name: string, path?: string[]): ValidationError {
    return new ValidationError(
      ERROR_CODES.DUPLICATE_STATE,
      `Duplicate state/computed name: "${name}"`,
      { path }
    );
  }

  static duplicateTool(name: string, path?: string[]): ValidationError {
    return new ValidationError(
      ERROR_CODES.DUPLICATE_TOOL,
      `Duplicate tool name: "${name}"`,
      { path }
    );
  }

  static duplicateViewId(id: string, path?: string[]): ValidationError {
    return new ValidationError(
      ERROR_CODES.DUPLICATE_VIEW_ID,
      `Duplicate view id: "${id}"`,
      { path }
    );
  }

  static undefinedStateRef(name: string, path?: string[]): ValidationError {
    return new ValidationError(
      ERROR_CODES.UNDEFINED_STATE_REFERENCE,
      `Reference to undefined state: "${name}"`,
      { path }
    );
  }

  static undefinedToolRef(name: string, path?: string[]): ValidationError {
    return new ValidationError(
      ERROR_CODES.UNDEFINED_TOOL_REFERENCE,
      `Reference to undefined tool: "${name}"`,
      { path }
    );
  }

  static invalidIdentifier(name: string, path?: string[]): ValidationError {
    return new ValidationError(
      ERROR_CODES.INVALID_IDENTIFIER,
      `Invalid identifier: "${name}"`,
      { path }
    );
  }

  static forbiddenGlobal(name: string, path?: string[]): ValidationError {
    return new ValidationError(
      ERROR_CODES.FORBIDDEN_GLOBAL,
      `Handler code contains forbidden global: "${name}"`,
      { path }
    );
  }

  static invalidScopeReference(path?: string[]): ValidationError {
    return new ValidationError(
      ERROR_CODES.INVALID_SCOPE_REFERENCE,
      `$scope reference used outside of <Iterate> context`,
      { path }
    );
  }

  static undeclaredExtension(alias: string, path?: string[]): ValidationError {
    return new ValidationError(
      ERROR_CODES.UNDECLARED_EXTENSION,
      `Usage of undeclared extension: "$ext.${alias}"`,
      { path }
    );
  }
}

/**
 * Error thrown during sandbox execution
 */
export class SandboxError extends NexusError {
  public readonly toolName?: string;
  public readonly handlerCode?: string;

  constructor(
    message: string,
    options?: {
      toolName?: string;
      handlerCode?: string;
      cause?: Error;
      details?: Record<string, unknown>;
    }
  ) {
    super(ERROR_CODES.SANDBOX_ERROR, message, {
      path: options?.toolName ? ['sandbox', options.toolName] : ['sandbox'],
      details: options?.details,
      cause: options?.cause,
    });
    this.name = 'SandboxError';
    this.toolName = options?.toolName;
    this.handlerCode = options?.handlerCode;
  }

  static timeout(toolName: string, timeoutMs: number): SandboxError {
    return new SandboxError(
      `Handler execution timed out after ${timeoutMs}ms`,
      { toolName }
    );
  }

  static recursionLimit(depth: number): SandboxError {
    return new SandboxError(
      `Maximum recursion depth (${depth}) exceeded - possible infinite loop`,
      { details: { depth } }
    );
  }

  static executionError(toolName: string, error: Error): SandboxError {
    return new SandboxError(
      `Error executing handler: ${error.message}`,
      { toolName, cause: error }
    );
  }
}

/**
 * Error thrown when state operations fail
 */
export class StateError extends NexusError {
  constructor(
    message: string,
    options?: {
      path?: string[];
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super('STATE_ERROR', message, options);
    this.name = 'StateError';
  }

  static typeMismatch(
    key: string,
    expected: string,
    received: string
  ): StateError {
    return new StateError(
      `Type mismatch for "${key}": expected ${expected}, received ${received}`,
      { path: ['state', key], details: { expected, received } }
    );
  }

  static undefinedState(key: string): StateError {
    return new StateError(
      `Attempt to access undefined state: "${key}"`,
      { path: ['state', key] }
    );
  }

  static readOnlyComputed(key: string): StateError {
    return new StateError(
      `Cannot write to computed value: "${key}"`,
      { path: ['computed', key] }
    );
  }
}

/**
 * Error thrown during view operations
 */
export class ViewError extends NexusError {
  constructor(
    message: string,
    options?: {
      path?: string[];
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super('VIEW_ERROR', message, options);
    this.name = 'ViewError';
  }

  static componentNotFound(id: string): ViewError {
    return new ViewError(
      `Component with id "${id}" not found in ViewRegistry`,
      { path: ['view', id] }
    );
  }

  static invalidMethod(componentId: string, method: string): ViewError {
    return new ViewError(
      `Component "${componentId}" does not support method "${method}"`,
      { path: ['view', componentId] }
    );
  }
}

/**
 * Aggregate error for collecting multiple validation errors
 */
export class AggregateValidationError extends Error {
  public readonly errors: ValidationError[];
  public readonly warnings: ValidationError[];

  constructor(errors: ValidationError[], warnings: ValidationError[] = []) {
    const errorCount = errors.length;
    const warningCount = warnings.length;
    super(
      `Validation failed with ${errorCount} error(s) and ${warningCount} warning(s)`
    );
    this.name = 'AggregateValidationError';
    this.errors = errors;
    this.warnings = warnings;
  }

  /**
   * Check if validation passed (no errors, warnings allowed)
   */
  get isValid(): boolean {
    return this.errors.length === 0;
  }

  /**
   * Get all issues (errors + warnings)
   */
  get allIssues(): ValidationError[] {
    return [...this.errors, ...this.warnings];
  }

  toString(): string {
    const lines = [this.message];
    
    if (this.errors.length > 0) {
      lines.push('\nErrors:');
      this.errors.forEach((e, i) => {
        lines.push(`  ${i + 1}. ${e.toString()}`);
      });
    }
    
    if (this.warnings.length > 0) {
      lines.push('\nWarnings:');
      this.warnings.forEach((w, i) => {
        lines.push(`  ${i + 1}. ${w.toString()}`);
      });
    }
    
    return lines.join('\n');
  }
}