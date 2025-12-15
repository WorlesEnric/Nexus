/**
 * @nexus/reactor - Sandbox Executor
 */

import type { SandboxContext, RuntimeValue, ToolNode, ViewAPI, EmitFunction, LogFunction } from '../core/types';
import { FORBIDDEN_GLOBALS } from '../core/constants';
import { SandboxError } from '../core/errors';
import { createDebugger } from '../utils/debug';

const debug = createDebugger('sandbox');

export interface SandboxExecutor {
  executeHandler(code: string, context: SandboxContext): Promise<unknown>;
  executeTool(tool: ToolNode, args: Record<string, unknown>, context: Omit<SandboxContext, '$args'>): Promise<unknown>;
}

export function createSandboxExecutor(): SandboxExecutor {
  return {
    executeHandler,
    executeTool,
  };
}

async function executeHandler(code: string, context: SandboxContext): Promise<unknown> {
  if (!code.trim()) return undefined;

  debug.log('Executing handler:', code.slice(0, 100) + (code.length > 100 ? '...' : ''));

  try {
    const handler = createHandler(code, context);
    return await handler();
  } catch (error) {
    throw SandboxError.executionError('handler', error as Error);
  }
}

async function executeTool(
  tool: ToolNode,
  args: Record<string, unknown>,
  context: Omit<SandboxContext, '$args'>
): Promise<unknown> {
  debug.log(`Executing tool: ${tool.name}`, args);

  // Validate and coerce args
  const processedArgs: Record<string, unknown> = {};
  for (const argDef of tool.args) {
    if (args[argDef.name] !== undefined) {
      processedArgs[argDef.name] = args[argDef.name];
    } else if (argDef.default !== undefined) {
      processedArgs[argDef.name] = argDef.default;
    } else if (argDef.required !== false) {
      throw new SandboxError(`Missing required argument: ${argDef.name}`, { toolName: tool.name });
    }
  }

  const fullContext: SandboxContext = {
    ...context,
    $args: processedArgs,
  };

  try {
    return await executeHandler(tool.handler.code, fullContext);
  } catch (error) {
    if (error instanceof SandboxError) throw error;
    throw SandboxError.executionError(tool.name, error as Error);
  }
}

function createHandler(code: string, context: SandboxContext): () => Promise<unknown> {
  const contextKeys = ['$state', '$args', '$view', '$emit', '$ext', '$log'];
  const contextValues = [
    context.$state,
    context.$args,
    context.$view,
    context.$emit,
    context.$ext,
    context.$log,
  ];

  // Reserved words that cannot be used as variable names in strict mode
  const reservedWords = ['eval', 'arguments'];
  
  // Shadow non-reserved forbidden globals using let declarations
  const safeGlobals = FORBIDDEN_GLOBALS.filter(g => !reservedWords.includes(g));
  const shadowDeclarations = safeGlobals
    .map(g => `let ${g} = undefined;`)
    .join('\n      ');

  const body = `
    "use strict";
    return (async function() {
      ${shadowDeclarations}
      try {
        ${code}
      } catch (e) {
        throw e;
      }
    })();
  `;

  try {
    const factory = new Function(
      ...contextKeys,
      body
    );

    return () => factory(...contextValues);
  } catch (error) {
    throw new SandboxError(`Failed to compile handler: ${(error as Error).message}`, {
      handlerCode: code,
      cause: error as Error,
    });
  }
}

export function createViewAPI(registry: Map<string, ViewHandle>): ViewAPI {
  return {
    getElementById(id: string) {
      return registry.get(id) ?? null;
    },
  };
}

export interface ViewHandle {
  setProp(prop: string, value: unknown): void;
  call(method: string, ...args: unknown[]): void;
}

export function createEmitFunction(emitter: (event: string, payload?: unknown) => void): EmitFunction {
  return (event: string, payload?: unknown) => {
    debug.log(`Emit: ${event}`, payload);
    emitter(event, payload);
  };
}

export function createLogFunction(logger: (message: string, data?: unknown) => void): LogFunction {
  return (...args: unknown[]) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    logger(message);
  };
}

export function createSandboxContext(
  state: Record<string, RuntimeValue>,
  args: Record<string, unknown>,
  viewAPI: ViewAPI,
  emit: EmitFunction,
  ext: Record<string, unknown>,
  log: LogFunction
): SandboxContext {
  return {
    $state: state,
    $args: args,
    $view: viewAPI,
    $emit: emit,
    $ext: ext,
    $log: log,
  };
}