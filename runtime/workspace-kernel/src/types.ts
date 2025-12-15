/**
 * TypeScript type definitions for Workspace Kernel
 */

import { z } from 'zod';
import type { WebSocket } from 'ws';

// ===== Panel Types =====

/** Panel ID */
export type PanelId = string;

/** Handler name */
export type HandlerName = string;

/** Panel state (arbitrary JSON-like object) */
export type PanelState = Record<string, unknown>;

/** Variable scope */
export type VariableScope = Record<string, unknown>;

/** Panel configuration */
export interface PanelConfig {
  /** Unique panel ID */
  id: PanelId;
  /** Panel kind/type */
  kind: string;
  /** Display title */
  title?: string;
  /** Tool/handler definitions */
  tools: ToolDefinition[];
  /** Initial state */
  initialState?: PanelState;
  /** Capabilities granted to this panel */
  capabilities?: string[];
  /** Panel metadata */
  metadata?: Record<string, unknown>;
}

/** Tool/handler definition */
export interface ToolDefinition {
  /** Tool name */
  name: string;
  /** Handler JavaScript code */
  handler: string;
  /** Trigger definition */
  trigger: TriggerDefinition;
  /** Description */
  description?: string;
  /** Required capabilities (inferred if not provided) */
  capabilities?: string[];
}

/** Trigger definition */
export type TriggerDefinition =
  | { type: 'manual' }
  | { type: 'interval'; ms: number }
  | { type: 'event'; pattern: string }
  | { type: 'cron'; expression: string }
  | { type: 'state_change'; path: string };

/** Panel status */
export type PanelStatus = 'initializing' | 'running' | 'suspended' | 'error' | 'stopped';

/** Active panel instance */
export interface PanelInstance {
  /** Panel configuration */
  config: PanelConfig;
  /** Current status */
  status: PanelStatus;
  /** Current state */
  state: PanelState;
  /** Variable scope */
  scope: VariableScope;
  /** Connected WebSocket clients */
  clients: Set<WebSocketClient>;
  /** Active suspension IDs */
  suspensions: Map<string, SuspensionContext>;
  /** Created timestamp */
  createdAt: Date;
  /** Last activity timestamp */
  lastActivity: Date;
}

// ===== Execution Types =====

/** Handler execution context */
export interface ExecutionContext {
  panelId: PanelId;
  handlerName: HandlerName;
  state: PanelState;
  args: unknown;
  scope: VariableScope;
  capabilities: string[];
}

/** Execution result */
export interface ExecutionResult {
  status: 'success' | 'suspended' | 'error';
  returnValue?: unknown;
  stateMutations: StateMutation[];
  events: EmittedEvent[];
  viewCommands: ViewCommand[];
  suspension?: SuspensionDetails;
  error?: ExecutionError;
  metrics: ExecutionMetrics;
}

/** State mutation */
export interface StateMutation {
  op: 'set' | 'delete';
  key: string;
  value?: unknown;
}

/** Emitted event */
export interface EmittedEvent {
  name: string;
  payload: unknown;
  timestamp: number;
}

/** View command */
export interface ViewCommand {
  viewId: string;
  command: string;
  params: Record<string, unknown>;
}

/** Suspension details */
export interface SuspensionDetails {
  suspensionId: string;
  extensionName: string;
  method: string;
  args: unknown[];
}

/** Suspension context (for tracking) */
export interface SuspensionContext {
  details: SuspensionDetails;
  panelId: PanelId;
  handlerName: HandlerName;
  createdAt: Date;
  timeout: NodeJS.Timeout;
}

/** Async operation result for resumption */
export interface AsyncResult {
  success: boolean;
  value?: unknown;
  error?: string;
}

/** Execution error */
export interface ExecutionError {
  code: string;
  message: string;
  location?: SourceLocation;
}

/** Source location */
export interface SourceLocation {
  line: number;
  column: number;
  sourceSnippet?: string;
}

/** Execution metrics */
export interface ExecutionMetrics {
  executionTimeUs: number;
  memoryUsedBytes: number;
  memoryPeakBytes: number;
  hostCalls: number;
  cacheHit: boolean;
}

// ===== WebSocket Types =====

/** WebSocket client connection */
export interface WebSocketClient {
  id: string;
  socket: WebSocket;
  panelId: PanelId;
  subscriptions: Set<string>;
  authenticated: boolean;
  connectedAt: Date;
}

/** Client-to-server message types */
export type ClientMessage =
  | { type: 'TRIGGER'; tool: string; args?: unknown; requestId?: string }
  | { type: 'SUBSCRIBE'; topics: string[] }
  | { type: 'UNSUBSCRIBE'; topics: string[] }
  | { type: 'PING' };

/** Server-to-client message types */
export type ServerMessage =
  | { type: 'CONNECTED'; panelId: PanelId; state: PanelState }
  | { type: 'RESULT'; requestId?: string; result: ExecutionResult }
  | { type: 'PATCH'; mutations: StateMutation[] }
  | { type: 'EVENT'; event: EmittedEvent }
  | { type: 'PROGRESS'; suspensionId: string; status: string; data?: unknown }
  | { type: 'ERROR'; code: string; message: string }
  | { type: 'PONG' }
  | { type: 'NOG_UPDATE'; snapshot: unknown };

// ===== HTTP API Types =====

/** Create panel request */
export const CreatePanelRequestSchema = z.object({
  id: z.string().optional(),
  kind: z.string(),
  title: z.string().optional(),
  tools: z.array(z.object({
    name: z.string(),
    handler: z.string(),
    trigger: z.union([
      z.object({ type: z.literal('manual') }),
      z.object({ type: z.literal('interval'), ms: z.number().positive() }),
      z.object({ type: z.literal('event'), pattern: z.string() }),
      z.object({ type: z.literal('cron'), expression: z.string() }),
      z.object({ type: z.literal('state_change'), path: z.string() }),
    ]),
    description: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
  })),
  initialState: z.record(z.unknown()).optional(),
  capabilities: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreatePanelRequest = z.infer<typeof CreatePanelRequestSchema>;

/** Create panel response */
export interface CreatePanelResponse {
  id: PanelId;
  status: PanelStatus;
  wsUrl: string;
}

/** Panel info response */
export interface PanelInfoResponse {
  id: PanelId;
  kind: string;
  title?: string;
  status: PanelStatus;
  state: PanelState;
  tools: string[];
  createdAt: string;
  lastActivity: string;
  clientCount: number;
}

/** List panels response */
export interface ListPanelsResponse {
  panels: PanelInfoResponse[];
  total: number;
}

/** Health check response */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  panels: {
    active: number;
    suspended: number;
  };
  runtime: {
    activeInstances: number;
    availableInstances: number;
    cacheHitRate: number;
    memoryBytes: number;
  };
}

// ===== Extension Types =====

/** Extension interface */
export interface Extension {
  /** Extension name */
  name: string;
  /** Available methods */
  methods: string[];
  /** Initialize the extension */
  init?(): Promise<void>;
  /** Shutdown the extension */
  shutdown?(): Promise<void>;
  /** Call a method */
  call(method: string, args: unknown[]): Promise<unknown>;
}

/** HTTP extension configuration */
export interface HttpExtensionConfig {
  /** Maximum concurrent requests */
  maxConcurrent?: number;
  /** Default timeout in milliseconds */
  defaultTimeout?: number;
  /** Allowed domains (if restricted) */
  allowedDomains?: string[];
  /** User agent string */
  userAgent?: string;
}

// ===== Configuration Types =====

/** Server configuration */
export interface ServerConfig {
  /** HTTP port */
  httpPort: number;
  /** WebSocket port */
  wsPort: number;
  /** Host to bind to */
  host: string;
  /** JWT secret for authentication */
  jwtSecret?: string;
  /** Enable authentication */
  authEnabled: boolean;
  /** CORS origins */
  corsOrigins: string[];
  /** Request body limit */
  bodyLimit: string;
}

/** Runtime configuration */
export interface RuntimeConfig {
  /** Maximum WASM instances */
  maxInstances: number;
  /** Minimum pre-warmed instances */
  minInstances?: number;
  /** Memory limit per instance in bytes */
  memoryLimitBytes: number;
  /** Execution timeout in milliseconds */
  timeoutMs: number;
  /** Maximum host calls per execution */
  maxHostCalls: number;
  /** Bytecode cache directory */
  cacheDir?: string;
  /** Maximum cache size in bytes */
  maxCacheSizeBytes?: number;
}

/** Full application configuration */
export interface AppConfig {
  server: ServerConfig;
  runtime: RuntimeConfig;
  extensions: {
    http?: HttpExtensionConfig;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    pretty: boolean;
  };
}

// ===== Utility Types =====

/** Deep partial type */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Result type for operations that can fail */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Async result promise type */
export type AsyncResultPromise<T, E = Error> = Promise<Result<T, E>>;
