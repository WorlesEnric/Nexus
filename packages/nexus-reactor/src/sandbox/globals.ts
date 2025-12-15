/**
 * @nexus/reactor - Sandbox Globals
 *
 * Type definitions and utilities for sandbox global APIs
 */

import type { RuntimeValue, ViewAPI, EmitFunction, LogFunction } from '../core/types';

/**
 * Type definitions for the sandbox globals
 */

/**
 * $state - Reactive state proxy
 * Read/write access to panel state
 */
export type StateAPI = Record<string, RuntimeValue>;

/**
 * $args - Tool arguments
 * Read-only object containing arguments passed to the tool
 */
export type ArgsAPI = Readonly<Record<string, unknown>>;

/**
 * $view - Imperative view manipulation
 * Access to registered components by ID
 */
export type { ViewAPI };

/**
 * $emit - Event emitter
 * Sends events to the host system (toast, modal, etc.)
 */
export type { EmitFunction };

/**
 * $ext - Extensions API
 * Access to registered extensions (http, fs, etc.)
 */
export type ExtensionsAPI = Record<string, unknown>;

/**
 * $log - Safe logging
 * Logs to the panel's LogStream
 */
export type { LogFunction };

/**
 * Complete sandbox global context
 */
export interface SandboxGlobals {
  /** Reactive state proxy (read/write) */
  $state: StateAPI;

  /** Tool arguments (read-only) */
  $args: ArgsAPI;

  /** Imperative view API */
  $view: ViewAPI;

  /** Event emitter */
  $emit: EmitFunction;

  /** Extensions API */
  $ext: ExtensionsAPI;

  /** Safe logger */
  $log: LogFunction;
}

/**
 * Get the names of all sandbox globals
 */
export function getSandboxGlobalNames(): string[] {
  return ['$state', '$args', '$view', '$emit', '$ext', '$log'];
}

/**
 * Check if a name is a sandbox global
 */
export function isSandboxGlobal(name: string): boolean {
  return getSandboxGlobalNames().includes(name);
}

/**
 * Get documentation for a sandbox global
 */
export function getGlobalDocumentation(name: string): string | null {
  const docs: Record<string, string> = {
    $state: 'Reactive state proxy. Read/write access to panel state values.',
    $args: 'Tool arguments. Read-only object containing arguments passed to the tool.',
    $view: 'Imperative view API. Access registered components by ID to manipulate them imperatively.',
    $emit: 'Event emitter. Send events to the host system (e.g., toast, modal, navigate).',
    $ext: 'Extensions API. Access registered extensions (e.g., $ext.http.get(...)).',
    $log: 'Safe logger. Log messages to the panel\'s LogStream without using console.',
  };

  return docs[name] ?? null;
}

/**
 * Get all global documentation
 */
export function getAllGlobalDocumentation(): Record<string, string> {
  return {
    $state: 'Reactive state proxy. Read/write access to panel state values.',
    $args: 'Tool arguments. Read-only object containing arguments passed to the tool.',
    $view: 'Imperative view API. Access registered components by ID to manipulate them imperatively.',
    $emit: 'Event emitter. Send events to the host system (e.g., toast, modal, navigate).',
    $ext: 'Extensions API. Access registered extensions (e.g., $ext.http.get(...)).',
    $log: 'Safe logger. Log messages to the panel\'s LogStream without using console.',
  };
}

/**
 * Standard emit event types
 */
export const STANDARD_EMIT_EVENTS = {
  /** Show a toast notification */
  TOAST: 'toast',

  /** Show a modal dialog */
  MODAL: 'modal',

  /** Navigate to a different panel or URL */
  NAVIGATE: 'navigate',

  /** System error (logged automatically) */
  ERROR: 'system:error',

  /** System log (logged automatically) */
  LOG: 'system:log',
} as const;

/**
 * Get standard emit event names
 */
export function getStandardEmitEvents(): string[] {
  return Object.values(STANDARD_EMIT_EVENTS);
}

/**
 * Check if an event is a standard emit event
 */
export function isStandardEmitEvent(event: string): boolean {
  return getStandardEmitEvents().includes(event);
}
