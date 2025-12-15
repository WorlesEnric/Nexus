/**
 * @nexus/reactor - WASM Sandbox Executor
 *
 * This executor uses the nexus-wasm-bridge (Rust/N-API) to run handler code
 * in isolated WasmEdge containers with true sandboxing.
 */

import type {
  SandboxContext,
  RuntimeValue,
  HandlerNode,
  ToolNode,
  ViewAPI,
  EmitFunction,
  CapabilityToken,
} from '../core/types';
import type {
  WasmRuntime,
  RuntimeConfig,
  WasmContext,
  WasmResult,
  StateMutation,
  EmittedEvent,
  ViewCommand,
  ExecutionMetrics,
} from './wasm-bridge.types';
import { HANDLER_TIMEOUT_MS } from '../core/constants';
import { SandboxError } from '../core/errors';
import { createDebugger } from '../utils/debug';

const debug = createDebugger('sandbox:wasm');

// Default runtime configuration
export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  maxInstances: 10,
  memoryLimitBytes: 32 * 1024 * 1024, // 32 MB
  stackSizeBytes: 1024 * 1024, // 1 MB
  enableSIMD: true,
  enableBulkMemory: true,
  enableAOT: false,
  cacheDir: '.nexus-cache',
};

/**
 * WASM-based sandbox executor
 */
export class WasmSandboxExecutor {
  private runtime: WasmRuntime | null = null;
  private config: RuntimeConfig;
  private metricsCallback?: (metrics: ExecutionMetrics) => void;

  constructor(config: Partial<RuntimeConfig> = {}) {
    this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
  }

  /**
   * Initialize the WASM runtime (lazy initialization)
   */
  private async ensureRuntime(): Promise<WasmRuntime> {
    if (this.runtime) {
      return this.runtime;
    }

    debug.log('Initializing WASM runtime...');

    try {
      // NOTE: This will fail until the Rust implementation is complete
      // For now, this serves as the type-safe interface
      // @ts-expect-error - @nexus/wasm-bridge is not yet implemented
      const { WasmRuntime: WasmRuntimeImpl } = await import('@nexus/wasm-bridge');
      const runtime = new WasmRuntimeImpl(this.config);
      this.runtime = runtime;
      debug.log('WASM runtime initialized successfully');
      return runtime;
    } catch (error) {
      throw new SandboxError(
        'Failed to initialize WASM runtime. Ensure @nexus/wasm-bridge is built and installed.',
        {
          cause: error as Error,
          details: {
            hint: 'Run: cd runtime/nexus-wasm-bridge && cargo build --release',
          },
        }
      );
    }
  }

  /**
   * Execute a handler in the WASM sandbox
   */
  async executeHandler(handler: HandlerNode, context: SandboxContext): Promise<unknown> {
    const runtime = await this.ensureRuntime();

    debug.log('Executing handler in WASM:', handler.code.slice(0, 100));

    // Build WASM context
    const wasmContext: WasmContext = {
      panelId: (context as any).panelId || 'unknown',
      handlerName: (context as any).handlerName || 'handler',
      stateSnapshot: this.serializeState(context.$state),
      args: context.$args || {},
      capabilities: handler.capabilities || this.inferCapabilities(handler),
      scope: (context as any).$scope || {},
      extensionRegistry: this.buildExtensionRegistry(context.$ext),
    };

    // Start execution
    let result: WasmResult;

    try {
      if (handler._compiledBytecode) {
        // Use pre-compiled bytecode
        debug.log('Using pre-compiled bytecode');
        result = await runtime.executeCompiledHandler(
          handler._compiledBytecode,
          wasmContext,
          handler.timeoutMs || HANDLER_TIMEOUT_MS
        );
      } else {
        // Compile on-demand
        debug.log('Compiling handler on-demand');
        result = await runtime.executeHandler(
          handler.code,
          wasmContext,
          handler.timeoutMs || HANDLER_TIMEOUT_MS
        );
      }
    } catch (error) {
      throw new SandboxError('WASM execution failed', {
        cause: error as Error,
        handlerCode: handler.code,
      });
    }

    // SUSPEND/RESUME LOOP - Critical for async UI updates!
    while (result.status === 'suspended') {
      debug.log(`Handler suspended for async operation: ${result.suspension!.extensionName}.${result.suspension!.method}`);

      // 1. APPLY INTERMEDIATE MUTATIONS IMMEDIATELY
      //    This is what fixes the "Blind Interval" problem!
      this.applyStateMutations(result.stateMutations, context.$state);
      this.emitEvents(result.events, context.$emit);
      this.executeViewCommands(result.viewCommands, context.$view);

      // 2. Execute the async I/O in JavaScript
      const suspension = result.suspension!;
      let ioResult: { success: true; value: unknown } | { success: false; error: string };

      try {
        const ext = context.$ext[suspension.extensionName];
        if (!ext || typeof ext !== 'object') {
          throw new Error(`Extension '${suspension.extensionName}' not found`);
        }

        const method = (ext as any)[suspension.method];
        if (typeof method !== 'function') {
          throw new Error(
            `Method '${suspension.method}' not found on extension '${suspension.extensionName}'`
          );
        }

        // Perform the actual I/O
        debug.log(`Executing extension call: ${suspension.extensionName}.${suspension.method}`);
        const value = await method.apply(ext, suspension.args);
        ioResult = { success: true, value };
      } catch (error) {
        debug.error(`Extension call failed: ${suspension.extensionName}.${suspension.method}`, error);
        ioResult = { success: false, error: (error as Error).message };
      }

      // 3. Resume WASM execution with the I/O result
      debug.log(`Resuming handler with ${ioResult.success ? 'success' : 'error'}`);
      result = await runtime.resumeHandler(suspension.suspensionId, ioResult);
    }

    // Final result handling
    if (result.status === 'error' && result.error) {
      throw new SandboxError(
        `Handler execution failed: ${result.error.message}`,
        {
          details: {
            code: result.error.code,
            stack: result.error.stack,
            location: result.error.location,
          },
        }
      );
    }

    // Apply final mutations
    this.applyStateMutations(result.stateMutations, context.$state);
    this.emitEvents(result.events, context.$emit);
    this.executeViewCommands(result.viewCommands, context.$view);

    // Record metrics
    if (this.metricsCallback) {
      this.metricsCallback(result.metrics);
    }

    debug.log(
      `Handler executed successfully in ${result.metrics.durationUs / 1000}ms`,
      `(cache ${result.metrics.cacheHit ? 'hit' : 'miss'})`
    );

    return result.returnValue;
  }

  /**
   * Execute a tool (convenience method)
   */
  async executeTool(
    tool: ToolNode,
    args: Record<string, unknown>,
    context: Omit<SandboxContext, '$args'>
  ): Promise<unknown> {
    debug.log(`Executing tool: ${tool.name}`, args);

    // Validate and process args
    const processedArgs: Record<string, unknown> = {};
    for (const argDef of tool.args) {
      if (args[argDef.name] !== undefined) {
        processedArgs[argDef.name] = args[argDef.name];
      } else if (argDef.default !== undefined) {
        processedArgs[argDef.name] = argDef.default;
      } else if (argDef.required !== false) {
        throw new SandboxError(`Missing required argument: ${argDef.name}`, {
          toolName: tool.name,
        });
      }
    }

    const fullContext: SandboxContext = {
      ...context,
      $args: processedArgs,
    };

    try {
      return await this.executeHandler(tool.handler, fullContext);
    } catch (error) {
      if (error instanceof SandboxError) throw error;
      throw SandboxError.executionError(tool.name, error as Error);
    }
  }

  /**
   * Pre-compile a handler for faster execution
   */
  async precompileHandler(handler: HandlerNode): Promise<void> {
    const runtime = await this.ensureRuntime();

    debug.log('Pre-compiling handler...');

    try {
      handler._compiledBytecode = await runtime.precompileHandler(handler.code);
      debug.log('Handler pre-compiled successfully');
    } catch (error) {
      debug.warn('Failed to pre-compile handler:', error);
      // Non-fatal: handler will be compiled on-demand
    }
  }

  /**
   * Set metrics callback for monitoring
   */
  onMetrics(callback: (metrics: ExecutionMetrics) => void): void {
    this.metricsCallback = callback;
  }

  /**
   * Get runtime statistics
   */
  async getStats() {
    const runtime = await this.ensureRuntime();
    return runtime.getStats();
  }

  /**
   * Shutdown the runtime and cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.runtime) {
      debug.log('Shutting down WASM runtime...');
      await this.runtime.shutdown();
      this.runtime = null;
      debug.log('WASM runtime shutdown complete');
    }
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  /**
   * Serialize state for passing to WASM
   */
  private serializeState(state: Record<string, RuntimeValue>): Record<string, RuntimeValue> {
    // Deep clone to prevent mutations
    // Use structuredClone if available, otherwise JSON roundtrip
    if (typeof structuredClone !== 'undefined') {
      return structuredClone(state);
    }
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * Build extension registry (name -> method list)
   */
  private buildExtensionRegistry(
    extensions: Record<string, unknown>
  ): Record<string, string[]> {
    const registry: Record<string, string[]> = {};
    for (const [name, ext] of Object.entries(extensions)) {
      if (typeof ext === 'object' && ext !== null) {
        registry[name] = Object.keys(ext).filter(
          (key) => typeof (ext as any)[key] === 'function'
        );
      }
    }
    return registry;
  }

  /**
   * Infer capabilities from handler code (fallback if not declared)
   */
  private inferCapabilities(_handler: HandlerNode): CapabilityToken[] {
    // For now, grant all capabilities if not declared
    // TODO: Implement static analysis to infer required capabilities
    debug.warn('Handler has no declared capabilities, granting all (unsafe!)');
    return ['state:read:*', 'state:write:*', 'events:emit:*', 'view:update:*', 'ext:*'];
  }

  /**
   * Apply state mutations from WASM result
   */
  private applyStateMutations(
    mutations: StateMutation[],
    stateProxy: Record<string, RuntimeValue>
  ): void {
    for (const mutation of mutations) {
      if (mutation.operation === 'set') {
        stateProxy[mutation.key] = mutation.value;
      } else if (mutation.operation === 'delete') {
        delete stateProxy[mutation.key];
      }
    }
    debug.log(`Applied ${mutations.length} state mutations`);
  }

  /**
   * Emit events from WASM result
   */
  private emitEvents(events: EmittedEvent[], emitFn: EmitFunction): void {
    for (const event of events) {
      emitFn(event.name, event.payload);
    }
    debug.log(`Emitted ${events.length} events`);
  }

  /**
   * Execute view commands from WASM result
   */
  private executeViewCommands(commands: ViewCommand[], viewAPI: ViewAPI): void {
    for (const cmd of commands) {
      // View API is minimal, so we need to extend it based on command type
      const view = viewAPI as any;

      switch (cmd.type) {
        case 'setFilter':
          if (view.setFilter) {
            view.setFilter(cmd.componentId, cmd.args.value);
          }
          break;
        case 'scrollTo':
          if (view.scrollTo) {
            view.scrollTo(cmd.componentId, cmd.args.position);
          }
          break;
        case 'focus':
          if (view.focus) {
            view.focus(cmd.componentId);
          }
          break;
        case 'custom':
          // Custom commands can be handled by extending ViewAPI
          debug.warn('Custom view command not implemented:', cmd);
          break;
      }
    }
    debug.log(`Executed ${commands.length} view commands`);
  }

}

/**
 * Create a WASM sandbox executor (factory function)
 */
export function createWasmSandboxExecutor(
  config: Partial<RuntimeConfig> = {}
): WasmSandboxExecutor {
  return new WasmSandboxExecutor(config);
}
