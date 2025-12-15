/**
 * @nexus/reactor - Main Reactor Class
 * 
 * The NexusReactor is the isomorphic execution engine responsible for
 * transforming static NXML definitions into living, interactive applications.
 */

import React from 'react';
import type {
  ReactorConfig,
  NexusPanelAST,
  RuntimeValue,
  ToolResult,
  SandboxContext,
} from './core/types';
import { ReactorEventEmitter, LogStream } from './core/events';
import { parse } from './parser/parser';
import { validate, validateOrThrow } from './parser/validator';
import { createStateStore, subscribe, getSnapshot, type StateStore } from './state/store';
import { createSandboxExecutor, createViewAPI, createEmitFunction, createLogFunction, type SandboxExecutor } from './sandbox/executor';
import { processLayout } from './layout/engine';
import { createViewRegistry, getViewHandle, type ViewRegistry } from './view/registry';
import { createPanelComponent } from './view/hydrator';
import { createMCPBridge, type MCPBridge } from './mcp/bridge';
import { createDebugger, setDebugMode } from './utils/debug';

const debug = createDebugger('reactor');

export class NexusReactor {
  public readonly ast: NexusPanelAST;
  public readonly state: StateStore;
  public readonly sandbox: SandboxExecutor;
  public readonly view: ViewRegistry;
  public readonly mcp: MCPBridge;
  public readonly events: ReactorEventEmitter;
  public readonly logStream: LogStream;

  private readonly extensions: Record<string, unknown>;
  private mounted = false;
  private panelComponent: React.FC | null = null;

  constructor(config: ReactorConfig) {
    if (config.debug) {
      setDebugMode(true);
    }

    debug.log('Initializing NexusReactor');

    // Initialize event system
    this.events = new ReactorEventEmitter();
    this.logStream = new LogStream();

    // Parse NXML source
    debug.log('Parsing NXML source');
    this.ast = parse(config.source);

    // Validate AST
    debug.log('Validating AST');
    const validation = validate(this.ast);
    if (!validation.valid) {
      debug.error('Validation failed:', validation.errors);
      validateOrThrow(this.ast); // This will throw with full details
    }
    if (validation.warnings.length > 0) {
      debug.warn('Validation warnings:', validation.warnings);
    }

    // Process layout
    debug.log('Processing layout');
    const processedView = processLayout(this.ast.view);
    this.ast.view = processedView;

    // Create state store
    debug.log('Creating state store');
    this.state = createStateStore(this.ast.data, config.initialState);

    // Store extensions
    this.extensions = config.extensions ?? {};

    // Create sandbox executor
    debug.log('Creating sandbox executor');
    this.sandbox = createSandboxExecutor();

    // Create view registry
    debug.log('Creating view registry');
    this.view = createViewRegistry();

    // Create MCP bridge
    debug.log('Creating MCP bridge');
    this.mcp = createMCPBridge(this.ast, this.state, this.executeTool.bind(this));

    // Subscribe to state changes for events
    subscribe(this.state, () => {
      this.events.emit('stateChange', { state: getSnapshot(this.state) });
    });
  }

  /**
   * Mount the reactor - run lifecycle hooks
   */
  async mount(): Promise<void> {
    if (this.mounted) {
      debug.warn('Reactor already mounted');
      return;
    }

    debug.log('Mounting reactor');

    // Execute mount lifecycle
    const mountLifecycle = this.ast.logic.lifecycles.find(l => l.on === 'mount');
    if (mountLifecycle) {
      debug.log('Executing mount lifecycle');
      const context = this.createSandboxContext({});
      await this.sandbox.executeHandler(mountLifecycle.handler.code, context);
    }

    this.mounted = true;
    this.events.emit('mount', { panelId: this.ast.meta.id });
  }

  /**
   * Unmount the reactor - cleanup
   */
  async unmount(): Promise<void> {
    if (!this.mounted) {
      debug.warn('Reactor not mounted');
      return;
    }

    debug.log('Unmounting reactor');

    // Execute unmount lifecycle
    const unmountLifecycle = this.ast.logic.lifecycles.find(l => l.on === 'unmount');
    if (unmountLifecycle) {
      debug.log('Executing unmount lifecycle');
      const context = this.createSandboxContext({});
      await this.sandbox.executeHandler(unmountLifecycle.handler.code, context);
    }

    this.mounted = false;
    this.events.emit('unmount', { panelId: this.ast.meta.id });
  }

  /**
   * Execute a tool by name
   */
  async executeTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    debug.log(`Executing tool: ${name}`, args);

    const tool = this.ast.logic.tools.find(t => t.name === name);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    try {
      this.events.emit('toolExecute', { tool: name, args });
      
      const context = this.createSandboxContext(args);
      const result = await this.sandbox.executeTool(tool, args, context);
      
      return {
        success: true,
        value: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      debug.error(`Tool execution failed: ${name}`, error);
      
      this.events.emit('error', { tool: name, error: errorMessage });
      this.logStream.error(`Tool '${name}' failed: ${errorMessage}`);
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get the React component for rendering the panel
   */
  getComponent(): React.FC {
    if (!this.panelComponent) {
      this.panelComponent = createPanelComponent(
        this.ast.view,
        this.state,
        this.view,
        this.executeTool.bind(this)
      );
    }
    return this.panelComponent;
  }

  /**
   * Get the current state snapshot
   */
  getState(): Record<string, RuntimeValue> {
    return getSnapshot(this.state);
  }

  /**
   * Set state values
   */
  setState(values: Record<string, RuntimeValue>): void {
    for (const [key, value] of Object.entries(values)) {
      this.state.proxy[key] = value;
    }
  }

  /**
   * Get MCP tools definition
   */
  getTools() {
    return this.mcp.getTools();
  }

  /**
   * Read an MCP resource
   */
  readResource(uri: string) {
    return this.mcp.readResource(uri);
  }

  /**
   * Create sandbox context for handler execution
   */
  private createSandboxContext(args: Record<string, unknown>): SandboxContext {
    const viewAPI = createViewAPI(this.view.components as any);
    
    const emit = createEmitFunction((event, payload) => {
      this.events.emit('emit', { event, payload });
      
      // Handle built-in events
      if (event === 'toast') {
        this.logStream.info(`Toast: ${payload}`);
      }
    });

    const log = createLogFunction((message, data) => {
      this.logStream.info(message, data);
    });

    return {
      $state: this.state.proxy,
      $args: args,
      $view: viewAPI,
      $emit: emit,
      $ext: this.extensions,
      $log: log,
    };
  }
}

// Re-export commonly used types and functions
export type { ReactorConfig, NexusPanelAST, RuntimeValue, ToolResult };
export { parse } from './parser/parser';
export { validate, validateOrThrow } from './parser/validator';