/**
 * @nexus/reactor - WASM Bridge Type Definitions
 *
 * Type definitions for the nexus-wasm-bridge N-API module (implemented in Rust).
 * These types provide compile-time safety when calling the native WASM runtime.
 */

import type { RuntimeValue, CapabilityToken } from '../core/types';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the WASM runtime
 */
export interface RuntimeConfig {
  /** Maximum number of concurrent WASM instances in pool */
  maxInstances: number;

  /** Memory limit per instance in bytes (default: 32MB) */
  memoryLimitBytes: number;

  /** Stack size per instance in bytes (default: 1MB) */
  stackSizeBytes: number;

  /** Enable SIMD instructions (default: true) */
  enableSIMD: boolean;

  /** Enable bulk memory operations (default: true) */
  enableBulkMemory: boolean;

  /** Path to QuickJS WASM module (optional, uses bundled if not provided) */
  quickjsModulePath?: string;

  /** Enable AOT compilation for hot handlers (default: false) */
  enableAOT: boolean;

  /** Compilation cache directory (default: .nexus-cache/) */
  cacheDir?: string;
}

// ============================================================================
// Execution Context and Results
// ============================================================================

/**
 * Execution context passed to WASM handler
 */
export interface WasmContext {
  /** Panel ID for logging and metrics */
  panelId: string;

  /** Tool or lifecycle handler name */
  handlerName: string;

  /** Snapshot of current state */
  stateSnapshot: Record<string, RuntimeValue>;

  /** Tool arguments (empty for lifecycle handlers) */
  args: Record<string, unknown>;

  /** Capability tokens granted to this handler */
  capabilities: CapabilityToken[];

  /** Scope variables (from If/Iterate context) */
  scope: Record<string, unknown>;

  /** Extension registry (name -> available methods) */
  extensionRegistry: Record<string, string[]>;
}

/**
 * Result returned from WASM handler execution
 */
export interface WasmResult {
  /** Execution status */
  status: 'success' | 'error' | 'suspended';

  /** Return value from handler (if status === 'success') */
  returnValue?: unknown;

  /** State mutations to apply IMMEDIATELY (critical for async UI updates) */
  stateMutations: StateMutation[];

  /** Events to emit IMMEDIATELY */
  events: EmittedEvent[];

  /** View commands to execute IMMEDIATELY */
  viewCommands: ViewCommand[];

  /** Suspension details (if status === 'suspended') */
  suspension?: SuspensionDetails;

  /** Error details (if status === 'error') */
  error?: WasmError;

  /** Execution metrics */
  metrics: ExecutionMetrics;
}

/**
 * Suspension details for async operations
 *
 * When a handler calls an async extension (e.g., await $ext.http.get()),
 * the WASM execution suspends and returns this information to JavaScript.
 * JavaScript performs the actual I/O, then resumes WASM with the result.
 */
export interface SuspensionDetails {
  /** Unique suspension ID for resuming */
  suspensionId: string;

  /** Extension name (e.g., 'http') */
  extensionName: string;

  /** Method name (e.g., 'get') */
  method: string;

  /** Method arguments */
  args: unknown[];
}

/**
 * State mutation record
 */
export interface StateMutation {
  /** State key to mutate */
  key: string;

  /** New value */
  value: RuntimeValue;

  /** Operation type */
  operation: 'set' | 'delete';
}

/**
 * Event emission record
 */
export interface EmittedEvent {
  /** Event name */
  name: string;

  /** Event payload */
  payload: unknown;
}

/**
 * View command record
 */
export interface ViewCommand {
  /** Command type */
  type: 'setFilter' | 'scrollTo' | 'focus' | 'custom';

  /** Target component ID */
  componentId?: string;

  /** Command arguments */
  args: Record<string, unknown>;
}


// ============================================================================
// Error Handling
// ============================================================================

/**
 * Error details from WASM execution
 */
export interface WasmError {
  /** Error code */
  code: ErrorCode;

  /** Human-readable message */
  message: string;

  /** JavaScript stack trace (source-mapped) */
  stack?: string;

  /** Source location */
  location?: SourceLocation;

  /** Handler code snippet around error */
  snippet?: string;
}

export type ErrorCode =
  | 'TIMEOUT'
  | 'MEMORY_LIMIT'
  | 'PERMISSION_DENIED'
  | 'EXECUTION_ERROR'
  | 'COMPILATION_ERROR'
  | 'INVALID_HANDLER'
  | 'INTERNAL_ERROR'
  | 'RESOURCE_LIMIT';

export interface SourceLocation {
  line: number;
  column: number;
}

// ============================================================================
// Metrics
// ============================================================================

/**
 * Execution metrics
 */
export interface ExecutionMetrics {
  /** Execution duration in microseconds */
  durationUs: number;

  /** Memory used in bytes */
  memoryUsedBytes: number;

  /** Peak memory in bytes */
  memoryPeakBytes: number;

  /** Host function call counts */
  hostCalls: Record<string, number>;

  /** Approximate CPU instruction count */
  instructionCount: number;

  /** Compilation time (if not cached) */
  compilationTimeUs?: number;

  /** Whether compilation cache was hit */
  cacheHit: boolean;
}

/**
 * Runtime statistics
 */
export interface RuntimeStats {
  /** Total handlers executed */
  totalExecutions: number;

  /** Active WASM instances */
  activeInstances: number;

  /** Available instances in pool */
  availableInstances: number;

  /** Cache hit rate (0-1) */
  cacheHitRate: number;

  /** Average execution time in microseconds */
  avgExecutionTimeUs: number;

  /** Total memory used by all instances */
  totalMemoryBytes: number;
}

// ============================================================================
// WASM Runtime Class (N-API Interface)
// ============================================================================

/**
 * Main runtime class exposed via N-API
 *
 * NOTE: This is implemented in Rust (runtime/nexus-wasm-bridge).
 * These are TypeScript type definitions for compile-time safety.
 */
export declare class WasmRuntime {
  /**
   * Create a new WASM runtime instance
   */
  constructor(config: RuntimeConfig);

  /**
   * Execute a handler in WASM sandbox
   *
   * @param handlerCode - JavaScript handler code string
   * @param context - Execution context
   * @param timeoutMs - Maximum execution time (0 = no timeout)
   * @returns Promise resolving to execution result
   */
  executeHandler(
    handlerCode: string,
    context: WasmContext,
    timeoutMs: number
  ): Promise<WasmResult>;

  /**
   * Pre-compile handler code to bytecode
   *
   * @param handlerCode - JavaScript handler code string
   * @returns Compiled bytecode
   */
  precompileHandler(handlerCode: string): Promise<Uint8Array>;

  /**
   * Execute pre-compiled handler bytecode
   *
   * @param bytecode - Pre-compiled bytecode
   * @param context - Execution context
   * @param timeoutMs - Maximum execution time
   * @returns Promise resolving to execution result
   */
  executeCompiledHandler(
    bytecode: Uint8Array,
    context: WasmContext,
    timeoutMs: number
  ): Promise<WasmResult>;

  /**
   * Resume a suspended handler execution
   *
   * When a handler suspends (awaiting an async extension call),
   * JavaScript performs the I/O and calls this method to continue execution.
   *
   * @param suspensionId - Suspension ID from WasmResult.suspension
   * @param result - Result value or error from the async operation
   * @returns Promise resolving to next execution result (may suspend again)
   */
  resumeHandler(
    suspensionId: string,
    result: { success: true; value: unknown } | { success: false; error: string }
  ): Promise<WasmResult>;

  /**
   * Get runtime statistics
   */
  getStats(): RuntimeStats;

  /**
   * Shutdown runtime and cleanup resources
   */
  shutdown(): Promise<void>;
}
