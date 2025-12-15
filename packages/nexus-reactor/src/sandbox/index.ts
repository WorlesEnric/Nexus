/**
 * @nexus/reactor - Sandbox Module
 */

export {
    createSandboxExecutor,
    createViewAPI,
    createEmitFunction,
    createLogFunction,
    createSandboxContext,
    type SandboxExecutor,
    type ViewHandle,
  } from './executor';

export {
    WasmSandboxExecutor,
    createWasmSandboxExecutor,
    DEFAULT_RUNTIME_CONFIG,
  } from './executor-wasm';

export type {
    WasmRuntime,
    RuntimeConfig,
    WasmContext,
    WasmResult,
    StateMutation,
    EmittedEvent,
    ViewCommand,
    SuspensionDetails,
    WasmError,
    ErrorCode,
    ExecutionMetrics,
    RuntimeStats,
  } from './wasm-bridge.types';