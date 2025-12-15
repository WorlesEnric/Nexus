/**
 * WASM Executor Integration
 * 
 * Bridges the Node.js workspace kernel to the Rust WASM runtime via N-API.
 */

import type {
  ExecutionContext,
  ExecutionResult,
  AsyncResult,
  ExecutionMetrics,
  RuntimeConfig,
  PanelId,
  HandlerName,
  PanelState,
  VariableScope,
  StateMutation,
  EmittedEvent,
  ViewCommand,
  SuspensionDetails,
  ExecutionError,
} from './types';
import { logger } from './logger';

/**
 * N-API binding interface
 * This is the interface exposed by the Rust nexus-wasm-bridge library
 */
interface WasmBridgeNative {
  /** Create a new runtime instance */
  createRuntime(config: NativeRuntimeConfig): NativeRuntime;
}

interface NativeRuntimeConfig {
  maxInstances: number;
  memoryLimitBytes: number;
  timeoutMs: number;
  maxHostCalls: number;
  cacheDir?: string;
}

interface NativeRuntime {
  /** Execute a handler */
  execute(
    handlerCode: string,
    context: NativeExecutionContext,
    timeoutMs: number
  ): Promise<NativeExecutionResult>;
  
  /** Execute pre-compiled bytecode */
  executeCompiled(
    bytecode: Buffer,
    context: NativeExecutionContext,
    timeoutMs: number
  ): Promise<NativeExecutionResult>;
  
  /** Pre-compile handler to bytecode */
  precompile(handlerCode: string): Promise<Buffer>;
  
  /** Resume a suspended handler */
  resume(suspensionId: string, result: NativeAsyncResult): Promise<NativeExecutionResult>;
  
  /** Get runtime statistics */
  getStats(): NativeRuntimeStats;
  
  /** Get Prometheus metrics */
  getMetrics(): string;
  
  /** Shutdown the runtime */
  shutdown(): Promise<void>;
}

interface NativeExecutionContext {
  panelId: string;
  handlerName: string;
  state: Buffer; // MessagePack encoded
  args: Buffer;  // MessagePack encoded
  scope: Buffer; // MessagePack encoded
  capabilities: string[];
}

interface NativeExecutionResult {
  status: 'success' | 'suspended' | 'error';
  returnValue?: Buffer;       // MessagePack encoded
  stateMutations: Buffer;     // MessagePack encoded array
  events: Buffer;             // MessagePack encoded array
  viewCommands: Buffer;       // MessagePack encoded array
  suspension?: {
    suspensionId: string;
    extensionName: string;
    method: string;
    args: Buffer;             // MessagePack encoded
  };
  error?: {
    code: string;
    message: string;
    line?: number;
    column?: number;
    sourceSnippet?: string;
  };
  metrics: {
    executionTimeUs: number;
    memoryUsedBytes: number;
    memoryPeakBytes: number;
    hostCalls: number;
    cacheHit: boolean;
  };
}

interface NativeAsyncResult {
  success: boolean;
  value?: Buffer;  // MessagePack encoded
  error?: string;
}

interface NativeRuntimeStats {
  totalExecutions: number;
  activeInstances: number;
  availableInstances: number;
  cacheHitRate: number;
  avgExecutionTimeUs: number;
  totalMemoryBytes: number;
}

// MessagePack utilities - we'll use @msgpack/msgpack
let msgpack: typeof import('@msgpack/msgpack') | null = null;

async function getMsgpack() {
  if (!msgpack) {
    msgpack = await import('@msgpack/msgpack');
  }
  return msgpack;
}

function encodeValue(value: unknown): Buffer {
  // Synchronous encode - msgpack is loaded by init time
  if (!msgpack) {
    throw new Error('MessagePack not initialized');
  }
  return Buffer.from(msgpack.encode(value));
}

function decodeValue<T>(buffer: Buffer): T {
  if (!msgpack) {
    throw new Error('MessagePack not initialized');
  }
  return msgpack.decode(buffer) as T;
}

/**
 * WASM Executor - manages execution through the Rust runtime
 */
export class WasmExecutor {
  private runtime: NativeRuntime | null = null;
  private config: RuntimeConfig;
  private mockMode: boolean = false;

  constructor(config: RuntimeConfig) {
    this.config = config;
  }

  /**
   * Initialize the executor
   */
  async init(): Promise<void> {
    // Load MessagePack
    await getMsgpack();

    // Try to load the native module
    try {
      const native = await this.loadNativeModule();
      this.runtime = native.createRuntime({
        maxInstances: this.config.maxInstances,
        memoryLimitBytes: this.config.memoryLimitBytes,
        timeoutMs: this.config.timeoutMs,
        maxHostCalls: this.config.maxHostCalls,
        cacheDir: this.config.cacheDir,
      });
      logger.info('WASM runtime initialized');
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Failed to load native WASM runtime, using mock mode'
      );
      this.mockMode = true;
    }
  }

  /**
   * Load the native N-API module
   */
  private async loadNativeModule(): Promise<WasmBridgeNative> {
    // Try different paths for the native module
    const paths = [
      '../nexus-wasm-bridge/target/release/libnexus_wasm_bridge.node',
      '../nexus-wasm-bridge/target/debug/libnexus_wasm_bridge.node',
      'nexus-wasm-bridge',
      '@nexus/wasm-bridge',
    ];

    for (const path of paths) {
      try {
        // Dynamic require for native module
        const mod = require(path);
        return mod as WasmBridgeNative;
      } catch {
        continue;
      }
    }

    throw new Error('Native WASM bridge module not found');
  }

  /**
   * Execute a handler
   */
  async execute(
    handlerCode: string,
    context: ExecutionContext,
    timeoutMs?: number
  ): Promise<ExecutionResult> {
    const timeout = timeoutMs ?? this.config.timeoutMs;

    if (this.mockMode) {
      return this.mockExecute(handlerCode, context);
    }

    if (!this.runtime) {
      throw new Error('Runtime not initialized');
    }

    const nativeContext = this.encodeContext(context);
    const nativeResult = await this.runtime.execute(handlerCode, nativeContext, timeout);

    return this.decodeResult(nativeResult);
  }

  /**
   * Execute pre-compiled bytecode
   */
  async executeCompiled(
    bytecode: Buffer,
    context: ExecutionContext,
    timeoutMs?: number
  ): Promise<ExecutionResult> {
    const timeout = timeoutMs ?? this.config.timeoutMs;

    if (this.mockMode) {
      return this.mockExecute('/* compiled */', context);
    }

    if (!this.runtime) {
      throw new Error('Runtime not initialized');
    }

    const nativeContext = this.encodeContext(context);
    const nativeResult = await this.runtime.executeCompiled(
      bytecode,
      nativeContext,
      timeout
    );

    return this.decodeResult(nativeResult);
  }

  /**
   * Pre-compile handler code to bytecode
   */
  async precompile(handlerCode: string): Promise<Buffer> {
    if (this.mockMode) {
      // Return the source as mock "bytecode"
      return Buffer.from(handlerCode, 'utf-8');
    }

    if (!this.runtime) {
      throw new Error('Runtime not initialized');
    }

    return this.runtime.precompile(handlerCode);
  }

  /**
   * Resume a suspended handler
   */
  async resume(suspensionId: string, result: AsyncResult): Promise<ExecutionResult> {
    if (this.mockMode) {
      return this.mockResumeResult(result);
    }

    if (!this.runtime) {
      throw new Error('Runtime not initialized');
    }

    const nativeResult: NativeAsyncResult = {
      success: result.success,
      value: result.value !== undefined ? encodeValue(result.value) : undefined,
      error: result.error,
    };

    const executionResult = await this.runtime.resume(suspensionId, nativeResult);
    return this.decodeResult(executionResult);
  }

  /**
   * Get runtime statistics
   */
  getStats(): {
    totalExecutions: number;
    activeInstances: number;
    availableInstances: number;
    cacheHitRate: number;
    avgExecutionTimeUs: number;
    totalMemoryBytes: number;
  } {
    if (this.mockMode || !this.runtime) {
      return {
        totalExecutions: 0,
        activeInstances: 0,
        availableInstances: this.config.maxInstances,
        cacheHitRate: 0,
        avgExecutionTimeUs: 0,
        totalMemoryBytes: 0,
      };
    }

    return this.runtime.getStats();
  }

  /**
   * Get Prometheus metrics
   */
  getMetrics(): string {
    if (this.mockMode || !this.runtime) {
      return '# WASM runtime in mock mode\n';
    }

    return this.runtime.getMetrics();
  }

  /**
   * Shutdown the executor
   */
  async shutdown(): Promise<void> {
    if (this.runtime) {
      await this.runtime.shutdown();
      this.runtime = null;
    }
    logger.info('WASM executor shutdown');
  }

  /**
   * Check if running in mock mode
   */
  isMockMode(): boolean {
    return this.mockMode;
  }

  /**
   * Encode execution context for native call
   */
  private encodeContext(context: ExecutionContext): NativeExecutionContext {
    return {
      panelId: context.panelId,
      handlerName: context.handlerName,
      state: encodeValue(context.state),
      args: encodeValue(context.args),
      scope: encodeValue(context.scope),
      capabilities: context.capabilities,
    };
  }

  /**
   * Decode native execution result
   */
  private decodeResult(native: NativeExecutionResult): ExecutionResult {
    const result: ExecutionResult = {
      status: native.status,
      stateMutations: decodeValue<StateMutation[]>(native.stateMutations),
      events: decodeValue<EmittedEvent[]>(native.events),
      viewCommands: decodeValue<ViewCommand[]>(native.viewCommands),
      metrics: native.metrics,
    };

    if (native.returnValue) {
      result.returnValue = decodeValue(native.returnValue);
    }

    if (native.suspension) {
      result.suspension = {
        suspensionId: native.suspension.suspensionId,
        extensionName: native.suspension.extensionName,
        method: native.suspension.method,
        args: decodeValue<unknown[]>(native.suspension.args),
      };
    }

    if (native.error) {
      result.error = {
        code: native.error.code,
        message: native.error.message,
        location: native.error.line
          ? {
              line: native.error.line,
              column: native.error.column ?? 0,
              sourceSnippet: native.error.sourceSnippet,
            }
          : undefined,
      };
    }

    return result;
  }

  /**
   * Mock execution for development/testing
   */
  private mockExecute(
    handlerCode: string,
    context: ExecutionContext
  ): ExecutionResult {
    const startTime = Date.now();

    try {
      // Very basic mock: just detect some simple patterns
      const mutations: StateMutation[] = [];
      const events: EmittedEvent[] = [];
      let returnValue: unknown = undefined;

      // Check for state.set calls
      const setMatches = handlerCode.matchAll(/\$state\.set\s*\(\s*['"](\w+)['"]\s*,\s*(.+?)\s*\)/g);
      for (const match of setMatches) {
        mutations.push({ op: 'set', key: match[1], value: match[2] });
      }

      // Check for emit calls
      const emitMatches = handlerCode.matchAll(/\$emit\s*\(\s*['"](\w+)['"]/g);
      for (const match of emitMatches) {
        events.push({ name: match[1], payload: {}, timestamp: Date.now() });
      }

      // Check for return statement
      const returnMatch = handlerCode.match(/return\s+(.+?);?\s*$/m);
      if (returnMatch) {
        try {
          returnValue = JSON.parse(returnMatch[1]);
        } catch {
          returnValue = returnMatch[1];
        }
      }

      return {
        status: 'success',
        returnValue,
        stateMutations: mutations,
        events,
        viewCommands: [],
        metrics: {
          executionTimeUs: (Date.now() - startTime) * 1000,
          memoryUsedBytes: 0,
          memoryPeakBytes: 0,
          hostCalls: mutations.length + events.length,
          cacheHit: false,
        },
      };
    } catch (err) {
      return {
        status: 'error',
        stateMutations: [],
        events: [],
        viewCommands: [],
        error: {
          code: 'MOCK_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
        metrics: {
          executionTimeUs: (Date.now() - startTime) * 1000,
          memoryUsedBytes: 0,
          memoryPeakBytes: 0,
          hostCalls: 0,
          cacheHit: false,
        },
      };
    }
  }

  /**
   * Mock resume result
   */
  private mockResumeResult(result: AsyncResult): ExecutionResult {
    return {
      status: result.success ? 'success' : 'error',
      returnValue: result.value,
      stateMutations: [],
      events: [],
      viewCommands: [],
      error: result.error
        ? { code: 'ASYNC_ERROR', message: result.error }
        : undefined,
      metrics: {
        executionTimeUs: 100,
        memoryUsedBytes: 0,
        memoryPeakBytes: 0,
        hostCalls: 0,
        cacheHit: true,
      },
    };
  }
}

/** Singleton executor instance */
let executorInstance: WasmExecutor | null = null;

/**
 * Get the executor instance
 */
export function getExecutor(): WasmExecutor {
  if (!executorInstance) {
    throw new Error('Executor not initialized - call initExecutor first');
  }
  return executorInstance;
}

/**
 * Initialize the executor
 */
export async function initExecutor(config: RuntimeConfig): Promise<WasmExecutor> {
  executorInstance = new WasmExecutor(config);
  await executorInstance.init();
  return executorInstance;
}

/**
 * Shutdown and reset the executor
 */
export async function shutdownExecutor(): Promise<void> {
  if (executorInstance) {
    await executorInstance.shutdown();
    executorInstance = null;
  }
}
