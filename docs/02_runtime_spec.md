# Nexus Runtime Specification (Phase 2)

**Version**: 1.0
**Date**: 2025-12-15
**Status**: Implementation Ready

## Overview

This document specifies the Nexus WASM Runtime Bridge (`nexus-wasm-bridge`), which provides isolated, secure execution of NXML handler code in WasmEdge containers. The runtime replaces the JavaScript Function constructor sandbox with true process isolation while maintaining the same semantic APIs for handler code.

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  Nexus Reactor (TypeScript/Node.js)                 │
│  - NXML Parsing & Validation                        │
│  - State Management (Proxy-based Reactivity)        │
│  - React Component Hydration                        │
│  - MCP Bridge Coordination                          │
└─────────────────┬───────────────────────────────────┘
                  │
                  │ N-API FFI (napi-rs)
                  │ Message: WasmContext → WasmResult
                  │
┌─────────────────▼───────────────────────────────────┐
│  Nexus WASM Bridge (Rust)                           │
│  - WasmEdge Instance Pool Management                │
│  - Context Serialization (MessagePack)              │
│  - Host Function Registry                           │
│  - Timeout & Resource Enforcement                   │
│  - Compilation Cache                                │
└─────────────────┬───────────────────────────────────┘
                  │
                  │ WASM Module Invocation
                  │ Host Functions: __nexus_*
                  │
┌─────────────────▼───────────────────────────────────┐
│  QuickJS Runtime (WASM Module)                      │
│  - JavaScript Handler Execution                     │
│  - Injected Globals: $state, $args, $emit, etc.    │
│  - No Default Capabilities                          │
│  - Calls Host Functions for External Access         │
└─────────────────────────────────────────────────────┘
```

### Design Principles

1. **True Isolation**: Each handler runs in a separate WASM instance with configurable memory limits
2. **Capability-Based Security**: Handlers have no default access; must declare required capabilities
3. **Deterministic Execution**: Timeouts enforced at runtime level, not cooperative
4. **Performance**: Instance pooling and compilation caching for production workloads
5. **Observable**: Full metrics and tracing for debugging and monitoring
6. **Fail-Safe**: Structured error handling with source location mapping

---

## 1. Runtime API Specification

The runtime bridge exposes a Node.js N-API interface for the Nexus Reactor to invoke.

### 1.1 Core Types (TypeScript)

```typescript
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
  | 'INTERNAL_ERROR';

export interface SourceLocation {
  line: number;
  column: number;
}

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
 * Capability token format
 */
export type CapabilityToken =
  | `state:read:${string}`    // Read specific state key
  | `state:write:${string}`   // Write specific state key
  | `state:read:*`            // Read all state
  | `state:write:*`           // Write all state
  | `events:emit:${string}`   // Emit specific event
  | `events:emit:*`           // Emit all events
  | `view:update:${string}`   // Update specific component
  | `view:update:*`           // Update all components
  | `ext:${string}`           // Access specific extension
  | `ext:*`;                  // Access all extensions

/**
 * Runtime value types (must be serializable)
 */
export type RuntimeValue =
  | null
  | boolean
  | number
  | string
  | RuntimeValue[]
  | { [key: string]: RuntimeValue };
```

### 1.2 WasmRuntime Class (N-API Interface)

```typescript
/**
 * Main runtime class exposed via N-API
 */
export class WasmRuntime {
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
```

---

## 2. Host Functions Specification

Host functions are exposed to WASM handlers via the `__nexus_*` namespace. All host functions follow these conventions:

- **Naming**: `__nexus_<category>_<operation>`
- **Error Handling**: Return error codes, not exceptions
- **Serialization**: Use MessagePack for complex data structures
- **Capability Checks**: All mutating operations check capabilities

### 2.1 State Access Functions

```rust
// Rust signature (exposed to WASM)

/// Read a state value
/// Returns: MessagePack-encoded RuntimeValue or null if not found
#[host_function]
fn __nexus_state_get(key: WasmPtr<u8>, key_len: u32) -> i64;

/// Write a state value
/// Returns: 0 on success, error code on failure
#[host_function]
fn __nexus_state_set(
    key: WasmPtr<u8>,
    key_len: u32,
    value: WasmPtr<u8>,
    value_len: u32
) -> i32;

/// Delete a state value
/// Returns: 0 on success, error code on failure
#[host_function]
fn __nexus_state_delete(key: WasmPtr<u8>, key_len: u32) -> i32;

/// Check if state key exists
/// Returns: 1 if exists, 0 if not
#[host_function]
fn __nexus_state_has(key: WasmPtr<u8>, key_len: u32) -> i32;
```

**JavaScript API (injected in QuickJS)**:

```javascript
// These are injected into the WASM QuickJS environment
globalThis.$state = new Proxy({}, {
  get(_, key) {
    const keyBytes = encodeString(key);
    const resultPtr = __nexus_state_get(keyBytes.ptr, keyBytes.len);
    if (resultPtr === 0) return undefined;
    return decodeMessagePack(resultPtr);
  },

  set(_, key, value) {
    const keyBytes = encodeString(key);
    const valueBytes = encodeMessagePack(value);
    const result = __nexus_state_set(
      keyBytes.ptr, keyBytes.len,
      valueBytes.ptr, valueBytes.len
    );
    if (result !== 0) {
      throw new Error(`Permission denied: Cannot write state.${key}`);
    }
    return true;
  },

  deleteProperty(_, key) {
    const keyBytes = encodeString(key);
    const result = __nexus_state_delete(keyBytes.ptr, keyBytes.len);
    return result === 0;
  },

  has(_, key) {
    const keyBytes = encodeString(key);
    return __nexus_state_has(keyBytes.ptr, keyBytes.len) === 1;
  }
});
```

### 2.2 Event Emission Functions

```rust
/// Emit an event
/// Returns: 0 on success, error code on failure
#[host_function]
fn __nexus_emit(
    event_name: WasmPtr<u8>,
    event_name_len: u32,
    payload: WasmPtr<u8>,
    payload_len: u32
) -> i32;
```

**JavaScript API**:

```javascript
globalThis.$emit = (eventName, payload) => {
  const nameBytes = encodeString(eventName);
  const payloadBytes = encodeMessagePack(payload);
  const result = __nexus_emit(
    nameBytes.ptr, nameBytes.len,
    payloadBytes.ptr, payloadBytes.len
  );
  if (result !== 0) {
    throw new Error(`Permission denied: Cannot emit event '${eventName}'`);
  }
};
```

### 2.3 View Manipulation Functions

```rust
/// Send a view command
/// Returns: 0 on success, error code on failure
#[host_function]
fn __nexus_view_command(
    command: WasmPtr<u8>,
    command_len: u32
) -> i32;
```

**JavaScript API**:

```javascript
globalThis.$view = {
  setFilter(componentId, value) {
    const cmd = { type: 'setFilter', componentId, args: { value } };
    const cmdBytes = encodeMessagePack(cmd);
    const result = __nexus_view_command(cmdBytes.ptr, cmdBytes.len);
    if (result !== 0) {
      throw new Error(`Permission denied: Cannot update view`);
    }
  },

  scrollTo(componentId, position) {
    const cmd = { type: 'scrollTo', componentId, args: { position } };
    const cmdBytes = encodeMessagePack(cmd);
    __nexus_view_command(cmdBytes.ptr, cmdBytes.len);
  },

  focus(componentId) {
    const cmd = { type: 'focus', componentId, args: {} };
    const cmdBytes = encodeMessagePack(cmd);
    __nexus_view_command(cmdBytes.ptr, cmdBytes.len);
  }
};
```

### 2.4 Extension Call Functions (Suspend/Resume)

**CRITICAL**: Extension calls use **suspension** to avoid the "Blind Interval" problem.

When a handler calls `await $ext.http.get()`:
1. `__nexus_ext_suspend()` is called, which **suspends WASM execution**
2. Control returns to JavaScript with accumulated mutations
3. JavaScript applies mutations (UI updates immediately!)
4. JavaScript performs the actual I/O
5. JavaScript calls `runtime.resumeHandler()` with the result
6. WASM execution continues from the suspension point

```rust
/// Suspend execution for an async extension call
/// This function NEVER RETURNS normally - it suspends the WASM instance
/// Returns: Never (suspends execution and yields control to host)
#[host_function]
fn __nexus_ext_suspend(
    ext_name: WasmPtr<u8>,
    ext_name_len: u32,
    method: WasmPtr<u8>,
    method_len: u32,
    args: WasmPtr<u8>,
    args_len: u32
) -> !;  // Never returns (diverging function)
```

**JavaScript API (QuickJS Bootloader)**:

```javascript
// Extension registry is provided in context
const __extensionRegistry = /* injected */;

globalThis.$ext = new Proxy({}, {
  get(_, extName) {
    if (!__extensionRegistry[extName]) {
      throw new Error(`Extension '${extName}' not found`);
    }

    // Return proxy for extension methods
    return new Proxy({}, {
      get(_, method) {
        return async (...args) => {
          const extBytes = encodeString(extName);
          const methodBytes = encodeString(method);
          const argsBytes = encodeMessagePack(args);

          // This call suspends WASM execution and returns control to JavaScript
          // The "return value" will be injected when resumeHandler() is called
          return __nexus_ext_suspend(
            extBytes.ptr, extBytes.len,
            methodBytes.ptr, methodBytes.len,
            argsBytes.ptr, argsBytes.len
          );
          // ^ Execution never reaches here until resumed
        };
      }
    });
  }
});
```

**Rust Implementation Detail**:

```rust
impl ExecutionContext {
    fn ext_suspend(
        &mut self,
        ext_name: String,
        method: String,
        args: Vec<u8>
    ) -> ! {
        // 1. Generate unique suspension ID
        let suspension_id = uuid::Uuid::new_v4().to_string();

        // 2. Store suspension state
        self.suspension = Some(SuspensionState {
            id: suspension_id.clone(),
            ext_name: ext_name.clone(),
            method: method.clone(),
            args,
        });

        // 3. Signal suspension to runtime
        // This causes the WasmEdge VM to pause and return to Rust/Node.js
        self.runtime.suspend_with_context(suspension_id, ext_name, method);

        // 4. This point is reached AFTER resumeHandler() is called
        // The result is injected via __RESUME_RESULT__ global
        let result = globalThis.__RESUME_RESULT__;
        if (result.success) {
            return result.value;
        } else {
            throw new Error(result.error);
        }
    }
}
```

### 2.5 Logging Functions

```rust
/// Log a message (always allowed, no capability check)
/// Returns: 0 on success
#[host_function]
fn __nexus_log(
    level: i32,  // 0=debug, 1=info, 2=warn, 3=error
    message: WasmPtr<u8>,
    message_len: u32
) -> i32;
```

**JavaScript API**:

```javascript
globalThis.$log = (message) => {
  const msgBytes = encodeString(String(message));
  __nexus_log(1, msgBytes.ptr, msgBytes.len);  // level 1 = info
};

globalThis.$log.debug = (message) => {
  const msgBytes = encodeString(String(message));
  __nexus_log(0, msgBytes.ptr, msgBytes.len);
};

globalThis.$log.warn = (message) => {
  const msgBytes = encodeString(String(message));
  __nexus_log(2, msgBytes.ptr, msgBytes.len);
};

globalThis.$log.error = (message) => {
  const msgBytes = encodeString(String(message));
  __nexus_log(3, msgBytes.ptr, msgBytes.len);
};
```

### 2.6 Utility Functions

```rust
/// Get current timestamp in milliseconds
#[host_function]
fn __nexus_now() -> f64;

/// Generate random bytes (capability-gated: 'crypto:random')
#[host_function]
fn __nexus_random_bytes(out: WasmPtr<u8>, len: u32) -> i32;
```

---

## 3. Context Passing Protocol

### 3.1 Serialization Format

All data passed between JavaScript and WASM uses **MessagePack** for efficient binary serialization.

**Rationale**:
- Faster than JSON (no parsing overhead)
- Smaller payload size
- Native support for binary data and typed arrays
- Well-supported in both Rust and JavaScript

### 3.2 Context Passing Flow

```
┌─────────────────────────────────────────────────────┐
│  JavaScript (Nexus Reactor)                         │
└─────────────────┬───────────────────────────────────┘
                  │
                  │ 1. Serialize WasmContext to MessagePack
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  Rust Bridge                                        │
│  - Deserialize WasmContext                          │
│  - Create ExecutionContext                          │
│  - Acquire WASM instance from pool                  │
└─────────────────┬───────────────────────────────────┘
                  │
                  │ 2. Inject context into QuickJS environment
                  │    - $state, $args, $scope, $ext registry
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  QuickJS in WASM                                    │
│  - Execute handler code                             │
│  - Call host functions via __nexus_*                │
│  - Collect mutations, events, view commands         │
└─────────────────┬───────────────────────────────────┘
                  │
                  │ 3. Collect WasmResult
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  Rust Bridge                                        │
│  - Build WasmResult from execution context          │
│  - Serialize to MessagePack                         │
│  - Return instance to pool                          │
└─────────────────┬───────────────────────────────────┘
                  │
                  │ 4. Return WasmResult
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  JavaScript (Nexus Reactor)                         │
│  - Apply state mutations to proxy                   │
│  - Emit events                                      │
│  - Execute view commands                            │
│  - Handle extension calls                           │
└─────────────────────────────────────────────────────┘
```

### 3.3 Suspend/Resume Flow (Solving the "Blind Interval" Problem)

**THE PROBLEM**: If handler mutations are only applied when execution completes, intermediate state changes won't be visible to the UI during async operations.

**Example of the problem**:
```javascript
$state.loading = true;  // ← User should see spinner immediately
const data = await $ext.http.get('/api/data');  // ← 3 second API call
$state.loading = false;
$state.data = data;
```

Without suspend/resume, the UI wouldn't update until all 3 seconds pass, creating a "blind interval" where nothing happens.

**THE SOLUTION**: Suspend/Resume with Intermediate Mutation Flushing

```
┌─────────────────────────────────────────────────────────┐
│ Handler Execution (QuickJS in WASM)                     │
│                                                          │
│ $state.loading = true;  ← Mutation recorded             │
│ await $ext.http.get(url);  ← Calls __nexus_ext_suspend()│
│                                                          │
│ [EXECUTION SUSPENDED]                                    │
└──────────────┬──────────────────────────────────────────┘
               │
               │ WasmResult { status: 'suspended',
               │              stateMutations: [loading: true],
               │              suspension: { ... } }
               ▼
┌─────────────────────────────────────────────────────────┐
│ JavaScript (Nexus Reactor)                              │
│                                                          │
│ 1. Apply mutations: stateProxy.loading = true           │
│    → UI UPDATES IMMEDIATELY! Spinner appears! ✓         │
│                                                          │
│ 2. Perform I/O: const result = await http.get(url)      │
│    → JavaScript handles the actual network call         │
│                                                          │
│ 3. Resume: runtime.resumeHandler(suspensionId, result)  │
└──────────────┬──────────────────────────────────────────┘
               │
               │ Resume with result
               ▼
┌─────────────────────────────────────────────────────────┐
│ Handler Execution Continues (QuickJS in WASM)           │
│                                                          │
│ // await $ext.http.get(url) resolves to result          │
│ $state.loading = false;  ← New mutation recorded        │
│ $state.data = result;    ← New mutation recorded        │
│                                                          │
│ [EXECUTION COMPLETES]                                    │
└──────────────┬──────────────────────────────────────────┘
               │
               │ WasmResult { status: 'success',
               │              stateMutations: [loading: false, data: ...] }
               ▼
┌─────────────────────────────────────────────────────────┐
│ JavaScript (Nexus Reactor)                              │
│                                                          │
│ 1. Apply final mutations                                │
│    → UI updates again! Spinner disappears! ✓            │
└─────────────────────────────────────────────────────────┘
```

**Key Points**:
1. **Immediate Feedback**: UI updates occur DURING async operations, not after
2. **Multiple Suspensions**: A handler can suspend multiple times (e.g., multiple API calls)
3. **Transactional**: Each suspension point flushes accumulated mutations
4. **Error Handling**: If JavaScript I/O fails, error is returned to WASM and can be caught with try/catch

---

## 4. Capability System

### 4.1 Capability Declaration (NXML)

Handlers declare required capabilities in NXML:

```xml
<Tool name="updateUserProfile">
  <Arg name="name" type="string" required="true" />
  <Arg name="email" type="string" required="true" />

  <Capabilities>
    <Capability type="state:write" scope="user" />
    <Capability type="ext:http" scope="*" />
    <Capability type="events:emit" scope="profile_updated" />
  </Capabilities>

  <Handler>
    const response = await $ext.http.post('/api/users/me', {
      name: $args.name,
      email: $args.email
    });

    $state.user = response.data;
    $emit('profile_updated', $state.user);
  </Handler>
</Tool>
```

### 4.2 Capability Format

```typescript
interface Capability {
  /** Capability type */
  type: 'state:read' | 'state:write' | 'events:emit' | 'view:update' | 'ext';

  /** Scope (specific key/event/extension or '*' for all) */
  scope: string;
}
```

**Capability Token String Format**: `{type}:{scope}`

Examples:
- `state:write:user` - Can write to `$state.user`
- `state:write:*` - Can write to any state key
- `events:emit:toast` - Can emit `toast` event
- `ext:http` - Can access `$ext.http`
- `ext:*` - Can access any extension

### 4.3 Capability Enforcement

**At Runtime**: Every host function call checks capabilities:

```rust
fn __nexus_state_set(
    ctx: &mut ExecutionContext,
    key: &str,
    value: RuntimeValue
) -> Result<(), Error> {
    // Check capability
    let required_cap = format!("state:write:{}", key);

    if !ctx.capabilities.contains(&required_cap) &&
       !ctx.capabilities.contains("state:write:*") {
        return Err(Error::PermissionDenied {
            capability: required_cap,
            operation: "state:write",
            resource: key.to_string(),
        });
    }

    // Perform operation
    ctx.state_mutations.push(StateMutation {
        key: key.to_string(),
        value,
        operation: MutationOp::Set,
    });

    Ok(())
}
```

### 4.4 Automatic Capability Inference (Optional)

If no `<Capabilities>` block is provided, the parser can automatically infer capabilities through static analysis:

```typescript
export function inferCapabilities(handlerCode: string): Capability[] {
  const capabilities: Capability[] = [];
  const ast = parse(handlerCode, { sourceType: 'module' });

  traverse(ast, {
    // Detect: $state.key = ...
    AssignmentExpression(path) {
      if (isMemberExpression(path.node.left) &&
          isIdentifier(path.node.left.object, { name: '$state' })) {
        const key = path.node.left.property.name;
        capabilities.push({ type: 'state:write', scope: key });
      }
    },

    // Detect: $state.key (read)
    MemberExpression(path) {
      if (isIdentifier(path.node.object, { name: '$state' }) &&
          !isAssignmentExpression(path.parent)) {
        const key = path.node.property.name;
        capabilities.push({ type: 'state:read', scope: key });
      }
    },

    // Detect: $emit('event', ...)
    CallExpression(path) {
      if (isIdentifier(path.node.callee, { name: '$emit' })) {
        const eventName = path.node.arguments[0]?.value;
        if (eventName) {
          capabilities.push({ type: 'events:emit', scope: eventName });
        }
      }

      // Detect: $ext.foo.bar(...)
      if (isMemberExpression(path.node.callee) &&
          isMemberExpression(path.node.callee.object) &&
          isIdentifier(path.node.callee.object.object, { name: '$ext' })) {
        const extName = path.node.callee.object.property.name;
        capabilities.push({ type: 'ext', scope: extName });
      }
    }
  });

  return capabilities;
}
```

---

## 5. Resource Limits

### 5.1 Configurable Limits

```typescript
export interface ResourceLimits {
  /** Maximum execution time in milliseconds (0 = no limit) */
  timeoutMs: number;

  /** Maximum memory per instance in bytes */
  memoryLimitBytes: number;

  /** Maximum stack depth */
  stackSizeBytes: number;

  /** Maximum number of host function calls */
  maxHostCalls: number;

  /** Maximum state mutation count per execution */
  maxStateMutations: number;

  /** Maximum event emission count per execution */
  maxEvents: number;
}

// Default limits (can be overridden per handler)
export const DEFAULT_LIMITS: ResourceLimits = {
  timeoutMs: 5000,              // 5 seconds
  memoryLimitBytes: 32 * 1024 * 1024,  // 32 MB
  stackSizeBytes: 1024 * 1024,  // 1 MB
  maxHostCalls: 10000,
  maxStateMutations: 1000,
  maxEvents: 100,
};
```

### 5.2 Limit Enforcement

**Timeout**:
```rust
use tokio::time::timeout;

async fn execute_with_timeout(
    instance: &mut WasmInstance,
    timeout_ms: u32
) -> Result<WasmResult, Error> {
    let duration = Duration::from_millis(timeout_ms as u64);

    match timeout(duration, instance.run()).await {
        Ok(result) => result,
        Err(_) => {
            instance.terminate();
            Err(Error::Timeout {
                limit_ms: timeout_ms,
                message: "Handler exceeded time limit".into(),
            })
        }
    }
}
```

**Memory Limit**:
```rust
// Set during instance creation
let mut config = wasmedge_sdk::Config::default();
config.set_max_memory_pages(memory_limit_bytes / 65536);

let vm = wasmedge_sdk::Vm::new(Some(config))?;
```

**Host Call Limit**:
```rust
struct ExecutionContext {
    host_call_count: AtomicU32,
    max_host_calls: u32,
    // ...
}

fn check_host_call_limit(ctx: &ExecutionContext) -> Result<(), Error> {
    let count = ctx.host_call_count.fetch_add(1, Ordering::Relaxed);
    if count >= ctx.max_host_calls {
        return Err(Error::ResourceLimit {
            resource: "host_calls",
            limit: ctx.max_host_calls,
            message: "Too many host function calls".into(),
        });
    }
    Ok(())
}

// Call at start of every host function
#[host_function]
fn __nexus_state_get(caller: Caller, key: &str) -> Result<RuntimeValue> {
    let ctx = caller.data::<ExecutionContext>()?;
    check_host_call_limit(ctx)?;
    // ... rest of implementation
}
```

---

## 6. Error Handling

### 6.1 Error Categories

```typescript
export enum ErrorCategory {
  /** Handler exceeded time limit */
  TIMEOUT = 'TIMEOUT',

  /** Handler exceeded memory limit */
  MEMORY_LIMIT = 'MEMORY_LIMIT',

  /** Handler attempted unauthorized operation */
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  /** Runtime error in handler code (e.g., null pointer, type error) */
  EXECUTION_ERROR = 'EXECUTION_ERROR',

  /** Handler code failed to compile */
  COMPILATION_ERROR = 'COMPILATION_ERROR',

  /** Invalid handler structure or NXML */
  INVALID_HANDLER = 'INVALID_HANDLER',

  /** Internal runtime error (bug) */
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  /** Resource limit exceeded (host calls, mutations, etc.) */
  RESOURCE_LIMIT = 'RESOURCE_LIMIT',
}
```

### 6.2 Error Reporting

```typescript
export interface WasmError {
  /** Error category */
  code: ErrorCategory;

  /** Human-readable message */
  message: string;

  /** JavaScript stack trace (source-mapped to original handler code) */
  stack?: string;

  /** Source location where error occurred */
  location?: {
    line: number;
    column: number;
  };

  /** Code snippet around error location */
  snippet?: {
    code: string;
    highlightLine: number;
  };

  /** Additional context (for debugging) */
  context?: Record<string, unknown>;
}
```

### 6.3 Source Mapping

The runtime should maintain a mapping from compiled QuickJS bytecode back to original source:

```rust
struct SourceMap {
    handler_code: String,
    bytecode_to_source: HashMap<u32, SourceLocation>,
}

fn map_error_location(
    error: &wasmedge_sdk::Error,
    source_map: &SourceMap
) -> Option<SourceLocation> {
    // Extract instruction pointer from error
    let instruction_ptr = extract_instruction_ptr(error)?;

    // Map to source location
    source_map.bytecode_to_source.get(&instruction_ptr).cloned()
}
```

---

## 7. Compilation and Caching

### 7.1 Compilation Flow

```
Handler Code (String)
    ↓
[QuickJS Compiler] → Bytecode
    ↓
[Cache Storage] → Disk (.nexus-cache/)
    ↓
[Subsequent Execution] → Load from Cache
```

### 7.2 Cache Key Generation

```typescript
export function generateCacheKey(handlerCode: string): string {
  // Use SHA-256 hash of handler code as cache key
  const hash = crypto.createHash('sha256');
  hash.update(handlerCode);
  return hash.digest('hex');
}
```

**Cache Directory Structure**:
```
.nexus-cache/
├── bytecode/
│   ├── a3f2b1c4d5e6... .qjsc    # QuickJS bytecode
│   ├── f7e8d9c0b1a2... .qjsc
│   └── ...
└── source-maps/
    ├── a3f2b1c4d5e6... .map    # Source maps
    ├── f7e8d9c0b1a2... .map
    └── ...
```

### 7.3 Compilation API

```rust
pub struct HandlerCompiler {
    quickjs_compiler: QuickJSCompiler,
    cache_dir: PathBuf,
}

impl HandlerCompiler {
    /// Compile handler code to bytecode
    pub fn compile(&self, code: &str) -> Result<CompiledHandler, Error> {
        // Generate cache key
        let cache_key = hash_code(code);
        let cache_path = self.cache_dir.join("bytecode").join(&cache_key);

        // Check cache
        if cache_path.exists() {
            let bytecode = fs::read(&cache_path)?;
            let source_map = self.load_source_map(&cache_key)?;
            return Ok(CompiledHandler {
                bytecode,
                source_map,
                cache_hit: true,
            });
        }

        // Compile
        let bytecode = self.quickjs_compiler.compile(code)?;
        let source_map = self.quickjs_compiler.generate_source_map()?;

        // Save to cache
        fs::write(&cache_path, &bytecode)?;
        self.save_source_map(&cache_key, &source_map)?;

        Ok(CompiledHandler {
            bytecode,
            source_map,
            cache_hit: false,
        })
    }
}
```

### 7.4 Asyncify Requirement (CRITICAL for Suspend/Resume)

**MANDATORY BUILD STEP**: The `quickjs.wasm` module **MUST** be post-processed using Binaryen's Asyncify transformation to enable stack switching. Without this, the suspend/resume mechanism will fail.

#### Why Asyncify is Required

Standard WebAssembly linear memory cannot suspend execution from within a C-stack (QuickJS's execution context). When `__nexus_ext_suspend()` is called:

1. The WASM stack must be **unwound** (saved to linear memory)
2. Control returns to the host (Rust/Node.js)
3. When `resumeHandler()` is called, the stack must be **rewound** (restored)

Asyncify instruments WASM bytecode to enable this stack manipulation.

#### Build Command

```bash
# Install Binaryen
npm install -g binaryen

# Post-process QuickJS WASM module
wasm-opt \
  --asyncify \
  --asyncify-imports=__nexus_ext_suspend \
  --asyncify-ignore-indirect \
  -O3 \
  quickjs.wasm \
  -o quickjs.async.wasm

# Verify Asyncify was applied
wasm-objdump -x quickjs.async.wasm | grep asyncify
```

**Expected Output**: You should see `asyncify_start_unwind`, `asyncify_stop_unwind`, `asyncify_start_rewind`, `asyncify_stop_rewind` in the import/export table.

#### Integration

Update the runtime configuration to use the Asyncified module:

```rust
// runtime/nexus-wasm-bridge/src/engine.rs
impl WasmInstance {
    pub fn new(config: &RuntimeConfig) -> Result<Self> {
        let quickjs_path = config.quickjs_module_path
            .as_ref()
            .unwrap_or(&"assets/quickjs.async.wasm".into());

        // Load Asyncified QuickJS module
        let module = Module::from_file(quickjs_path)?;

        // The module MUST have Asyncify functions
        assert!(module.has_export("asyncify_start_unwind"),
                "QuickJS module missing Asyncify instrumentation!");

        // ... rest of initialization
    }
}
```

#### Asyncify Configuration

**Import Declaration**: `__nexus_ext_suspend` must be declared as an Asyncify import:

```rust
// Declare the suspension function signature
#[host_function]
fn __nexus_ext_suspend(
    ext_name: WasmPtr<u8>,
    ext_name_len: u32,
    method: WasmPtr<u8>,
    method_len: u32,
    args: WasmPtr<u8>,
    args_len: u32
) -> i64 {
    // This function triggers asyncify_start_unwind internally
    // When called, WasmEdge saves the stack and returns control to host
    todo!("Trigger Asyncify unwind")
}
```

**Resume Implementation**: When `resumeHandler()` is called, trigger `asyncify_start_rewind`:

```rust
pub async fn resume(&mut self, result: AsyncResult) -> Result<ExecutionResult> {
    // Inject result into linear memory
    self.write_resume_result(result)?;

    // Call asyncify_start_rewind to restore the stack
    self.vm.call("asyncify_start_rewind", vec![])?;

    // Continue execution
    self.vm.run()?;

    Ok(self.collect_result())
}
```

#### Performance Impact

- **Code Size**: +10-15% (Asyncify instrumentation adds branching code)
- **Execution Speed**: -5-10% for non-suspended handlers (extra checks)
- **Memory**: +2-4KB per instance (stack save buffer)

**Trade-off**: The performance cost is acceptable given the critical benefit of immediate UI updates during async operations.

#### Troubleshooting

**Error: "indirect call in function that does not call asyncify_start_unwind"**
- Solution: Add `--asyncify-ignore-indirect` flag

**Error: "stack overflow during unwind"**
- Solution: Increase Asyncify stack size with `--asyncify-stack-size=16384`

**Error: Module loads but suspends don't work**
- Check: Verify `__nexus_ext_suspend` is in `--asyncify-imports` list
- Check: Verify `asyncify_*` functions exist in WASM exports

---

## 8. Performance Optimization

### 8.1 Instance Pooling

```rust
pub struct InstancePool {
    available: VecDeque<WasmInstance>,
    in_use: HashSet<InstanceId>,
    config: RuntimeConfig,
    stats: Arc<Mutex<PoolStats>>,
}

impl InstancePool {
    pub async fn acquire(&mut self) -> Result<PooledInstance, Error> {
        // Try to reuse existing instance
        if let Some(mut instance) = self.available.pop_front() {
            instance.reset()?;
            let id = instance.id();
            self.in_use.insert(id);
            return Ok(PooledInstance::new(instance, self));
        }

        // Create new instance if under limit
        if self.in_use.len() < self.config.max_instances {
            let instance = self.create_instance()?;
            let id = instance.id();
            self.in_use.insert(id);
            return Ok(PooledInstance::new(instance, self));
        }

        // Wait for available instance
        self.wait_for_available().await
    }

    fn release(&mut self, instance: WasmInstance) {
        let id = instance.id();
        self.in_use.remove(&id);
        self.available.push_back(instance);
    }
}

// RAII guard for automatic return to pool
pub struct PooledInstance {
    instance: Option<WasmInstance>,
    pool: *mut InstancePool,
}

impl Drop for PooledInstance {
    fn drop(&mut self) {
        if let Some(instance) = self.instance.take() {
            unsafe {
                (*self.pool).release(instance);
            }
        }
    }
}
```

### 8.2 AOT Compilation (Optional)

For frequently-used handlers, compile to native code:

```rust
pub struct AOTCompiler {
    wasmedge_compiler: wasmedge_sdk::Compiler,
}

impl AOTCompiler {
    pub fn compile_to_native(
        &self,
        quickjs_wasm: &Path,
        output: &Path
    ) -> Result<(), Error> {
        self.wasmedge_compiler.compile(
            quickjs_wasm,
            output,
            wasmedge_sdk::CompilerOptimizationLevel::O3
        )?;
        Ok(())
    }
}
```

**When to use AOT**:
- Handlers executed > 1000 times
- Critical path handlers (e.g., mount lifecycle)
- Large computation-heavy handlers

---

## 9. Integration with Nexus Reactor

### 9.1 Modified Sandbox Executor

```typescript
// packages/nexus-reactor/src/sandbox/executor-wasm.ts

import { WasmRuntime, WasmContext, WasmResult } from '@nexus/wasm-bridge';
import type { HandlerNode, SandboxContext } from '../core/types';

export class WasmSandboxExecutor {
  private runtime: WasmRuntime;

  constructor(config: RuntimeConfig) {
    this.runtime = new WasmRuntime(config);
  }

  async executeHandler(
    handler: HandlerNode,
    context: SandboxContext
  ): Promise<unknown> {
    // Build WASM context
    const wasmContext: WasmContext = {
      panelId: context.panelId,
      handlerName: context.handlerName,
      stateSnapshot: this.serializeState(context.$state),
      args: context.$args,
      capabilities: handler.capabilities || [],
      scope: context.$scope || {},
      extensionRegistry: this.buildExtensionRegistry(context.$ext),
    };

    // Start execution
    let result: WasmResult;

    if (handler._compiledBytecode) {
      // Use pre-compiled bytecode
      result = await this.runtime.executeCompiledHandler(
        handler._compiledBytecode,
        wasmContext,
        handler.timeoutMs || DEFAULT_HANDLER_TIMEOUT_MS
      );
    } else {
      // Compile on-demand
      result = await this.runtime.executeHandler(
        handler.code,
        wasmContext,
        handler.timeoutMs || DEFAULT_HANDLER_TIMEOUT_MS
      );
    }

    // SUSPEND/RESUME LOOP - Critical for async UI updates!
    while (result.status === 'suspended') {
      // 1. APPLY INTERMEDIATE MUTATIONS IMMEDIATELY
      //    This is what fixes the "Blind Interval" problem!
      this.applyStateMutations(result.stateMutations, context.$state);
      this.emitEvents(result.events, context.$emit);
      this.executeViewCommands(result.viewCommands, context.$view);

      // 2. Execute the async I/O in JavaScript
      const suspension = result.suspension!;
      let ioResult: { success: boolean; value?: unknown; error?: string };

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
        const value = await method.apply(ext, suspension.args);
        ioResult = { success: true, value };
      } catch (error) {
        ioResult = { success: false, error: (error as Error).message };
      }

      // 3. Resume WASM execution with the I/O result
      result = await this.runtime.resumeHandler(
        suspension.suspensionId,
        ioResult
      );
    }

    // Final result handling
    if (result.status === 'error') {
      throw new HandlerExecutionError(
        result.error!.message,
        result.error!
      );
    }

    // Apply final mutations
    this.applyStateMutations(result.stateMutations, context.$state);
    this.emitEvents(result.events, context.$emit);
    this.executeViewCommands(result.viewCommands, context.$view);

    // Record metrics
    this.recordMetrics(result.metrics);

    return result.returnValue;
  }

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
  }

  private emitEvents(
    events: EmittedEvent[],
    emitFn: (name: string, payload: unknown) => void
  ): void {
    for (const event of events) {
      emitFn(event.name, event.payload);
    }
  }

  private executeViewCommands(
    commands: ViewCommand[],
    viewAPI: ViewAPI
  ): void {
    for (const cmd of commands) {
      switch (cmd.type) {
        case 'setFilter':
          viewAPI.setFilter(cmd.componentId, cmd.args.value);
          break;
        case 'scrollTo':
          viewAPI.scrollTo(cmd.componentId, cmd.args.position);
          break;
        case 'focus':
          viewAPI.focus(cmd.componentId);
          break;
        // ... other commands
      }
    }
  }

  private serializeState(
    state: Record<string, RuntimeValue>
  ): Record<string, RuntimeValue> {
    // Deep clone to prevent mutations
    return structuredClone(state);
  }

  private buildExtensionRegistry(
    extensions: Record<string, any>
  ): Record<string, string[]> {
    const registry: Record<string, string[]> = {};
    for (const [name, ext] of Object.entries(extensions)) {
      registry[name] = Object.keys(ext).filter(
        key => typeof ext[key] === 'function'
      );
    }
    return registry;
  }

  private recordMetrics(metrics: ExecutionMetrics): void {
    // Send to telemetry system
    // ...
  }

  async shutdown(): Promise<void> {
    await this.runtime.shutdown();
  }
}
```

### 9.2 Updated Handler Node Type

```typescript
// packages/nexus-reactor/src/core/types.ts

export interface HandlerNode {
  kind: 'Handler';
  code: HandlerCode;
  isAsync?: boolean;

  // NEW: WASM-specific fields
  capabilities?: CapabilityToken[];
  timeoutMs?: number;
  _compiledBytecode?: Uint8Array;  // Cached bytecode
}
```

### 9.3 Pre-compilation During Validation

```typescript
// packages/nexus-reactor/src/parser/validator.ts

export async function validateAndCompile(
  ast: NexusPanelAST,
  options?: { precompile?: boolean; runtime?: WasmRuntime }
): Promise<void> {
  // ... existing validation ...

  // NEW: Pre-compile handlers
  if (options?.precompile && options?.runtime) {
    for (const tool of ast.logic.tools) {
      tool.handler._compiledBytecode = await options.runtime.precompileHandler(
        tool.handler.code
      );
    }

    for (const lifecycle of ast.logic.lifecycle) {
      lifecycle.handler._compiledBytecode = await options.runtime.precompileHandler(
        lifecycle.handler.code
      );
    }
  }
}
```

---

## 10. Deployment Architecture

### 10.1 Container Structure

Each user workspace corresponds to a Kubernetes Pod:

**IMPORTANT**: This uses a **standard container runtime** (e.g., `runc`), NOT `runwasi`. The WasmEdge isolation happens **inside** the Node.js process via the `@nexus/wasm-bridge` library. This is a "Hybrid Host" model where:
- Node.js runs in a regular Linux container
- WasmEdge runs as a library inside Node.js
- Handler code executes in WasmEdge/QuickJS sandboxes

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: workspace-{workspace_id}
  labels:
    app: nexus-workspace
    user: {user_id}
spec:
  # Standard container runtime (default runc)
  # NOTE: Do NOT use runwasi - that's for pure WASM containers
  # Our architecture runs Node.js which loads WASM as a library

  containers:
  - name: workspace-kernel
    image: nexus-workspace-kernel:latest  # Node.js 20+ with @nexus/wasm-bridge
    resources:
      limits:
        memory: 2Gi
        cpu: 2000m
      requests:
        memory: 512Mi
        cpu: 500m

    ports:
    - containerPort: 3000
      name: http
      protocol: TCP
    - containerPort: 3001
      name: websocket
      protocol: TCP

    volumeMounts:
    - name: workspace-data
      mountPath: /workspace

    env:
    - name: WORKSPACE_ID
      value: {workspace_id}
    - name: MAX_PANELS
      value: "10"
    - name: NODE_ENV
      value: "production"

  volumes:
  - name: workspace-data
    persistentVolumeClaim:
      claimName: workspace-{workspace_id}-pvc
```

### 10.2 Panel Lifecycle

```
User opens panel in UI
    ↓
GraphStudio sends request to Nexus Server
    ↓
Nexus Server calls Workspace Kernel API: POST /panels/spawn
    ↓
Workspace Kernel loads NXML from Git
    ↓
Workspace Kernel starts WasmRuntime (nexus-wasm-bridge)
    ↓
Panel container runs (QuickJS in WASM)
    ↓
Panel listens on WebSocket for UI interactions
    ↓
User closes panel
    ↓
Workspace Kernel stops WasmRuntime
    ↓
Instance returned to pool (or destroyed)
```

---

## 11. Testing Strategy

### 11.1 Unit Tests (Rust)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_simple_handler_execution() {
        let runtime = WasmRuntime::new(RuntimeConfig::default()).unwrap();

        let handler_code = r#"
            $state.counter = ($state.counter || 0) + 1;
            $emit('incremented', $state.counter);
        "#;

        let context = WasmContext {
            panel_id: "test-panel".into(),
            handler_name: "increment".into(),
            state_snapshot: HashMap::from([
                ("counter".into(), RuntimeValue::Number(5.0))
            ]),
            args: HashMap::new(),
            capabilities: vec![
                "state:read:*".into(),
                "state:write:*".into(),
                "events:emit:*".into(),
            ],
            scope: HashMap::new(),
            extension_registry: HashMap::new(),
        };

        let result = runtime.execute_handler(handler_code, context, 1000).await.unwrap();

        assert_eq!(result.status, ExecutionStatus::Success);
        assert_eq!(result.state_mutations.len(), 1);
        assert_eq!(result.state_mutations[0].key, "counter");
        assert_eq!(result.state_mutations[0].value, RuntimeValue::Number(6.0));
        assert_eq!(result.events.len(), 1);
        assert_eq!(result.events[0].name, "incremented");
    }

    #[tokio::test]
    async fn test_timeout_enforcement() {
        let runtime = WasmRuntime::new(RuntimeConfig::default()).unwrap();

        let handler_code = r#"
            while (true) {
                // Infinite loop
            }
        "#;

        let context = WasmContext { /* ... */ };

        let result = runtime.execute_handler(handler_code, context, 100).await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::Timeout);
    }

    #[tokio::test]
    async fn test_permission_denied() {
        let runtime = WasmRuntime::new(RuntimeConfig::default()).unwrap();

        let handler_code = r#"
            $state.secret = "hacked";
        "#;

        let context = WasmContext {
            capabilities: vec![
                "state:read:*".into(),
                // Missing state:write capability
            ],
            // ...
        };

        let result = runtime.execute_handler(handler_code, context, 1000).await.unwrap();

        assert_eq!(result.status, ExecutionStatus::Error);
        assert_eq!(result.error.unwrap().code, ErrorCode::PermissionDenied);
    }
}
```

### 11.2 Integration Tests (TypeScript)

```typescript
// packages/nexus-reactor/test/wasm-executor.test.ts

import { describe, it, expect } from 'vitest';
import { WasmSandboxExecutor } from '../src/sandbox/executor-wasm';
import { createStateStore } from '../src/state/store';

describe('WASM Sandbox Executor', () => {
  it('should execute handler with state mutations', async () => {
    const executor = new WasmSandboxExecutor({
      maxInstances: 5,
      memoryLimitBytes: 32 * 1024 * 1024,
      // ...
    });

    const store = createStateStore({
      counter: { type: 'number', default: 0 }
    });

    const handler: HandlerNode = {
      kind: 'Handler',
      code: '$state.counter = $state.counter + $args.increment;',
      capabilities: ['state:read:*', 'state:write:*'],
    };

    const context: SandboxContext = {
      panelId: 'test',
      handlerName: 'increment',
      $state: store.proxy,
      $args: { increment: 5 },
      $emit: vi.fn(),
      $view: {},
      $ext: {},
      $log: console.log,
    };

    await executor.executeHandler(handler, context);

    expect(store.proxy.counter).toBe(5);
  });

  it('should handle async extension calls', async () => {
    const mockHttp = {
      get: vi.fn().mockResolvedValue({ data: { message: 'Hello' } })
    };

    const executor = new WasmSandboxExecutor(/* ... */);

    const handler: HandlerNode = {
      kind: 'Handler',
      code: `
        const response = await $ext.http.get('https://api.example.com/data');
        $state.data = response.data;
      `,
      capabilities: ['state:write:data', 'ext:http'],
    };

    const context: SandboxContext = {
      // ...
      $ext: { http: mockHttp },
    };

    await executor.executeHandler(handler, context);

    expect(mockHttp.get).toHaveBeenCalledWith('https://api.example.com/data');
    expect(store.proxy.data).toEqual({ message: 'Hello' });
  });
});
```

---

## 12. Monitoring and Observability

### 12.1 Metrics

```typescript
export interface RuntimeMetrics {
  // Execution metrics
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  avgExecutionTimeMs: number;
  p50ExecutionTimeMs: number;
  p95ExecutionTimeMs: number;
  p99ExecutionTimeMs: number;

  // Resource metrics
  avgMemoryUsedBytes: number;
  peakMemoryUsedBytes: number;
  avgHostCalls: number;

  // Pool metrics
  activeInstances: number;
  availableInstances: number;
  instanceCreationCount: number;
  instanceReuseCount: number;

  // Cache metrics
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;

  // Error metrics
  timeoutCount: number;
  memoryLimitCount: number;
  permissionDeniedCount: number;
  executionErrorCount: number;
}
```

### 12.2 Logging

```rust
use tracing::{info, warn, error, debug, instrument};

#[instrument(skip(self, context))]
pub async fn execute_handler(
    &self,
    handler_code: &str,
    context: WasmContext,
    timeout_ms: u32
) -> Result<WasmResult, Error> {
    info!(
        panel_id = %context.panel_id,
        handler_name = %context.handler_name,
        timeout_ms = timeout_ms,
        "Executing handler"
    );

    let start = Instant::now();

    let result = self.execute_internal(handler_code, context, timeout_ms).await;

    let duration_ms = start.elapsed().as_millis();

    match &result {
        Ok(res) => {
            info!(
                duration_ms = duration_ms,
                status = "success",
                state_mutations = res.state_mutations.len(),
                events = res.events.len(),
                "Handler execution completed"
            );
        }
        Err(err) => {
            error!(
                duration_ms = duration_ms,
                error_code = ?err.code,
                error_message = %err.message,
                "Handler execution failed"
            );
        }
    }

    result
}
```

---

## 13. Security Considerations

### 13.1 Threat Model

**Threats**:
1. Malicious handler attempts to access unauthorized state
2. Handler attempts to exhaust resources (CPU, memory)
3. Handler attempts to access host filesystem or network directly
4. Handler attempts to execute arbitrary WASM bytecode
5. Handler attempts to escape WASM sandbox

**Mitigations**:
1. ✅ Capability-based access control (enforced in host functions)
2. ✅ Resource limits (timeout, memory, host call count)
3. ✅ WASM sandbox isolation (no direct host access)
4. ✅ Bytecode validation (QuickJS only, no arbitrary WASM)
5. ✅ WasmEdge security model (capability-based, sandboxed)

### 13.2 Secure Defaults

- **No capabilities by default**: Handlers start with zero access
- **Explicit capability declaration**: Must declare in NXML
- **Principle of least privilege**: Request only required capabilities
- **Immutable context**: State snapshot is read-only in WASM (mutations collected and applied in JS)
- **No eval/Function**: Handler code cannot dynamically generate code

### 13.3 Audit Logging

```rust
pub struct AuditLog {
    timestamp: SystemTime,
    panel_id: String,
    handler_name: String,
    user_id: String,
    action: AuditAction,
    result: AuditResult,
}

pub enum AuditAction {
    StateWrite { key: String, value_type: String },
    EventEmit { event_name: String },
    ViewUpdate { component_id: String, command: String },
    ExtensionCall { extension: String, method: String },
}

pub enum AuditResult {
    Allowed,
    Denied { reason: String },
}

// Log all capability checks
fn check_capability(
    ctx: &ExecutionContext,
    capability: &str
) -> Result<(), Error> {
    let result = if ctx.capabilities.contains(capability) {
        AuditResult::Allowed
    } else {
        AuditResult::Denied {
            reason: format!("Missing capability: {}", capability)
        }
    };

    audit_log.write(AuditLog {
        timestamp: SystemTime::now(),
        panel_id: ctx.panel_id.clone(),
        handler_name: ctx.handler_name.clone(),
        user_id: ctx.user_id.clone(),
        action: /* infer from context */,
        result,
    });

    if matches!(result, AuditResult::Denied { .. }) {
        return Err(Error::PermissionDenied { /* ... */ });
    }

    Ok(())
}
```

---

## 14. Migration Path

### 14.1 Implementation Phases

**Phase 2A: Foundation** (Current)
- Set up `runtime/nexus-wasm-bridge/` Rust project
- Integrate WasmEdge and QuickJS
- Implement N-API bindings
- Basic handler execution working

**Phase 2B: Feature Complete**
- Implement all host functions
- Add capability system
- Implement resource limits
- Add compilation cache

**Phase 2C: Production Ready**
- Performance optimization (pooling, AOT)
- Comprehensive error handling
- Monitoring and metrics
- Security audit

### 14.2 Breaking Changes from JS Sandbox

1. **No synchronous extension calls**: All `$ext` calls must be `await`ed
2. **No direct global access**: `console.log` → `$log`, no `setTimeout`, etc.
3. **Handler code must be self-contained**: No closure over external scope
4. **Explicit capabilities required**: Handlers must declare what they need

---

## 15. Appendix

### 15.1 Example NXML with WASM

```xml
<NexusPanel id="user-dashboard" title="User Dashboard">
  <Data>
    <State name="user" type="object" default="{}" />
    <State name="loading" type="boolean" default="false" />
  </Data>

  <Logic>
    <Lifecycle on="mount">
      <Handler>
        $state.loading = true;
        const user = await $ext.http.get('/api/user/me');
        $state.user = user.data;
        $state.loading = false;
      </Handler>
    </Lifecycle>

    <Tool name="updateProfile" description="Update user profile">
      <Arg name="name" type="string" required="true" />
      <Arg name="email" type="string" required="true" />

      <Capabilities>
        <Capability type="state:write" scope="user" />
        <Capability type="state:write" scope="loading" />
        <Capability type="ext:http" scope="*" />
        <Capability type="events:emit" scope="profile_updated" />
      </Capabilities>

      <Handler>
        $state.loading = true;

        try {
          const response = await $ext.http.post('/api/user/me', {
            name: $args.name,
            email: $args.email
          });

          $state.user = response.data;
          $emit('profile_updated', $state.user);
          $emit('toast', { type: 'success', message: 'Profile updated!' });
        } catch (error) {
          $emit('toast', { type: 'error', message: error.message });
        } finally {
          $state.loading = false;
        }
      </Handler>
    </Tool>
  </Logic>

  <View>
    <Layout strategy="auto">
      <If condition="{$state.loading}">
        <Spinner size="large" />
      </If>

      <If condition="{!$state.loading}">
        <Card title="Profile">
          <Text label="Name" value="{$state.user.name}" />
          <Text label="Email" value="{$state.user.email}" />

          <Action label="Edit Profile" trigger="updateProfile" />
        </Card>
      </If>
    </Layout>
  </View>
</NexusPanel>
```

### 15.2 QuickJS Wrapper Complete Code

```javascript
// This runs inside QuickJS WASM environment
// Nexus runtime injects this before executing handler code

(function() {
  'use strict';

  // Helper: Encode string to UTF-8 bytes
  function encodeString(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    return { ptr: bytes.buffer, len: bytes.length };
  }

  // Helper: Decode UTF-8 bytes to string
  function decodeString(ptr, len) {
    const decoder = new TextDecoder();
    const bytes = new Uint8Array(__wasm_memory.buffer, ptr, len);
    return decoder.decode(bytes);
  }

  // Helper: Encode value to MessagePack
  function encodeMessagePack(value) {
    // Use bundled MessagePack library
    const bytes = msgpack.encode(value);
    return { ptr: bytes.buffer, len: bytes.length };
  }

  // Helper: Decode MessagePack to value
  function decodeMessagePack(ptr) {
    if (ptr === 0) return undefined;
    // Length is stored in first 4 bytes
    const lenView = new DataView(__wasm_memory.buffer, ptr, 4);
    const len = lenView.getUint32(0, true);
    const bytes = new Uint8Array(__wasm_memory.buffer, ptr + 4, len);
    return msgpack.decode(bytes);
  }

  // Inject $state proxy
  globalThis.$state = new Proxy({}, {
    get(_, key) {
      const keyBytes = encodeString(String(key));
      const resultPtr = __nexus_state_get(keyBytes.ptr, keyBytes.len);
      return decodeMessagePack(resultPtr);
    },

    set(_, key, value) {
      const keyBytes = encodeString(String(key));
      const valueBytes = encodeMessagePack(value);
      const result = __nexus_state_set(
        keyBytes.ptr, keyBytes.len,
        valueBytes.ptr, valueBytes.len
      );
      if (result !== 0) {
        throw new Error(`Permission denied: Cannot write $state.${key}`);
      }
      return true;
    },

    deleteProperty(_, key) {
      const keyBytes = encodeString(String(key));
      const result = __nexus_state_delete(keyBytes.ptr, keyBytes.len);
      return result === 0;
    },

    has(_, key) {
      const keyBytes = encodeString(String(key));
      return __nexus_state_has(keyBytes.ptr, keyBytes.len) === 1;
    }
  });

  // Inject $args (from context)
  globalThis.$args = __injected_args;

  // Inject $scope (from If/Iterate)
  globalThis.$scope = __injected_scope;

  // Inject $emit
  globalThis.$emit = function(eventName, payload) {
    const nameBytes = encodeString(String(eventName));
    const payloadBytes = encodeMessagePack(payload);
    const result = __nexus_emit(
      nameBytes.ptr, nameBytes.len,
      payloadBytes.ptr, payloadBytes.len
    );
    if (result !== 0) {
      throw new Error(`Permission denied: Cannot emit event '${eventName}'`);
    }
  };

  // Inject $view
  globalThis.$view = {
    setFilter(componentId, value) {
      const cmd = { type: 'setFilter', componentId, args: { value } };
      const cmdBytes = encodeMessagePack(cmd);
      const result = __nexus_view_command(cmdBytes.ptr, cmdBytes.len);
      if (result !== 0) {
        throw new Error('Permission denied: Cannot update view');
      }
    },

    scrollTo(componentId, position) {
      const cmd = { type: 'scrollTo', componentId, args: { position } };
      const cmdBytes = encodeMessagePack(cmd);
      __nexus_view_command(cmdBytes.ptr, cmdBytes.len);
    },

    focus(componentId) {
      const cmd = { type: 'focus', componentId, args: {} };
      const cmdBytes = encodeMessagePack(cmd);
      __nexus_view_command(cmdBytes.ptr, cmdBytes.len);
    }
  };

  // Inject $ext (extension registry from context)
  const __extensionRegistry = __injected_extension_registry;

  globalThis.$ext = new Proxy({}, {
    get(_, extName) {
      if (!__extensionRegistry[extName]) {
        throw new Error(`Extension '${extName}' not found`);
      }

      return new Proxy({}, {
        get(_, method) {
          return async function(...args) {
            const extBytes = encodeString(String(extName));
            const methodBytes = encodeString(String(method));
            const argsBytes = encodeMessagePack(args);

            // CRITICAL: This call suspends WASM execution via Asyncify.
            // Execution pauses here and control returns to Rust/Node.js.
            // When resumeHandler() is called, execution resumes and the
            // result is returned directly from this function.
            const resultPtr = __nexus_ext_suspend(
              extBytes.ptr, extBytes.len,
              methodBytes.ptr, methodBytes.len,
              argsBytes.ptr, argsBytes.len
            );

            // Result is available immediately upon resumption
            return decodeMessagePack(resultPtr);
          };
        }
      });
    }
  });

  // Inject $log
  globalThis.$log = function(message) {
    const msgBytes = encodeString(String(message));
    __nexus_log(1, msgBytes.ptr, msgBytes.len);  // info level
  };

  globalThis.$log.debug = function(message) {
    const msgBytes = encodeString(String(message));
    __nexus_log(0, msgBytes.ptr, msgBytes.len);
  };

  globalThis.$log.warn = function(message) {
    const msgBytes = encodeString(String(message));
    __nexus_log(2, msgBytes.ptr, msgBytes.len);
  };

  globalThis.$log.error = function(message) {
    const msgBytes = encodeString(String(message));
    __nexus_log(3, msgBytes.ptr, msgBytes.len);
  };

  // Block dangerous globals
  delete globalThis.eval;
  delete globalThis.Function;
  delete globalThis.setTimeout;
  delete globalThis.setInterval;
  // ... etc (QuickJS has limited globals by default)

})();
```

---

## 16. Workspace Kernel API (External Interface)

**CRITICAL DELIVERABLE**: This section defines the HTTP/WebSocket API exposed by the Workspace Kernel (Node.js process running in each Pod). The GraphStudio frontend uses this API to manage panels.

### 16.1 Architecture Overview

```
┌─────────────────────────────────────────┐
│  GraphStudio (Frontend)                 │
│  - User clicks "Open Panel"             │
└──────────────┬──────────────────────────┘
               │
               │ HTTPS/WebSocket
               ▼
┌─────────────────────────────────────────┐
│  Nexus Server (Orchestration)           │
│  - Route to correct Workspace Pod       │
└──────────────┬──────────────────────────┘
               │
               │ Internal HTTP
               ▼
┌─────────────────────────────────────────┐
│  Workspace Kernel (Node.js in Pod)      │
│  - Port 3000: HTTP API                  │
│  - Port 3001: WebSocket                 │
│  - Manages WasmRuntime instances        │
└─────────────────────────────────────────┘
```

### 16.2 HTTP API Endpoints

The Workspace Kernel exposes a REST API on **Port 3000**.

#### 16.2.1 Panel Lifecycle

**Create/Initialize Panel**

```http
POST /panels
Content-Type: application/json

{
  "panelId": "monitor-1",
  "source": "<NexusPanel id=\"monitor-1\">...</NexusPanel>",
  "extensions": {
    "http": {
      "baseURL": "https://api.example.com"
    }
  }
}
```

**Response**:
```json
{
  "status": "ok",
  "panelId": "monitor-1",
  "websocket": "ws://workspace-abc123.nexus.local:3001/panels/monitor-1/ws",
  "initialState": {
    "cpu_load": 0,
    "status": "idle"
  }
}
```

**Behavior**:
1. Parse and validate NXML source
2. Initialize `NexusReactor` with `WasmSandboxExecutor`
3. Pre-compile handler bytecode (if enabled)
4. Execute `mount` lifecycle handler
5. Return initial state and WebSocket connection URL

**Destroy Panel**

```http
DELETE /panels/{panelId}
```

**Response**:
```json
{
  "status": "ok",
  "panelId": "monitor-1"
}
```

**Behavior**:
1. Execute `unmount` lifecycle handler
2. Shutdown WasmRuntime for this panel
3. Clean up resources

#### 16.2.2 Panel Introspection

**Get Panel State**

```http
GET /panels/{panelId}/state
```

**Response**:
```json
{
  "panelId": "monitor-1",
  "state": {
    "cpu_load": 42,
    "status": "active",
    "logs": [...]
  }
}
```

**List Active Panels**

```http
GET /panels
```

**Response**:
```json
{
  "panels": [
    {
      "panelId": "monitor-1",
      "status": "active",
      "memoryUsage": 15728640,
      "uptime": 3600
    },
    {
      "panelId": "dashboard-2",
      "status": "active",
      "memoryUsage": 22020096,
      "uptime": 1800
    }
  ],
  "totalPanels": 2,
  "maxPanels": 10
}
```

#### 16.2.3 Health and Metrics

**Health Check**

```http
GET /health
```

**Response**:
```json
{
  "status": "healthy",
  "workspaceId": "abc123",
  "activePanels": 2,
  "maxPanels": 10,
  "memoryUsage": {
    "used": 524288000,
    "total": 2147483648,
    "percent": 24.4
  },
  "wasmRuntime": {
    "status": "ready",
    "activeInstances": 2,
    "availableInstances": 8
  }
}
```

**Runtime Metrics**

```http
GET /metrics
```

**Response** (Prometheus format):
```
# HELP nexus_panel_executions_total Total number of handler executions
# TYPE nexus_panel_executions_total counter
nexus_panel_executions_total{panel_id="monitor-1"} 1542

# HELP nexus_panel_execution_duration_seconds Handler execution duration
# TYPE nexus_panel_execution_duration_seconds histogram
nexus_panel_execution_duration_seconds_bucket{panel_id="monitor-1",le="0.001"} 1234
nexus_panel_execution_duration_seconds_bucket{panel_id="monitor-1",le="0.01"} 1520
...

# HELP nexus_wasm_cache_hit_rate WASM compilation cache hit rate
# TYPE nexus_wasm_cache_hit_rate gauge
nexus_wasm_cache_hit_rate 0.92
```

### 16.3 WebSocket Protocol

Each panel has a dedicated WebSocket connection on **Port 3001** at `/panels/{panelId}/ws`.

#### 16.3.1 Connection Flow

```
Client connects to: ws://workspace-abc123.nexus.local:3001/panels/monitor-1/ws
    ↓
Kernel authenticates connection (JWT token)
    ↓
Kernel sends: { "type": "CONNECTED", "panelId": "monitor-1", "state": {...} }
    ↓
Bidirectional communication begins
```

#### 16.3.2 Message Types

**Client → Server Messages**

**Trigger Tool Execution**

```json
{
  "type": "TRIGGER",
  "tool": "refresh",
  "args": {
    "force": true
  },
  "requestId": "req-123"
}
```

**Server Response**:
```json
{
  "type": "RESULT",
  "requestId": "req-123",
  "status": "success",
  "mutations": [
    { "key": "cpu_load", "value": 75, "operation": "set" }
  ],
  "events": [
    { "name": "refreshed", "payload": { "timestamp": 1702934400 } }
  ],
  "returnValue": null
}
```

**Or if error**:
```json
{
  "type": "RESULT",
  "requestId": "req-123",
  "status": "error",
  "error": {
    "code": "TIMEOUT",
    "message": "Handler exceeded 5000ms limit",
    "stack": "..."
  }
}
```

**Subscribe to State Changes**

```json
{
  "type": "SUBSCRIBE",
  "keys": ["cpu_load", "status"]
}
```

**Server → Client Messages**

**State Update (Push)**

When state changes (from tool execution or external trigger):

```json
{
  "type": "PATCH",
  "mutations": [
    { "key": "cpu_load", "value": 80, "operation": "set" }
  ],
  "timestamp": 1702934400
}
```

**Event Notification**

```json
{
  "type": "EVENT",
  "name": "toast",
  "payload": {
    "type": "success",
    "message": "Operation completed"
  }
}
```

**Progress Update (During Async Operations)**

When a handler suspends for async I/O:

```json
{
  "type": "PROGRESS",
  "requestId": "req-123",
  "status": "executing",
  "message": "Fetching data from API...",
  "mutations": [
    { "key": "loading", "value": true, "operation": "set" }
  ]
}
```

This allows the UI to update **during** the async operation (solving the Blind Interval problem)!

**Connection Management**

**Heartbeat**:
```json
{
  "type": "PING"
}
```

**Client responds**:
```json
{
  "type": "PONG"
}
```

### 16.4 Error Responses

All HTTP endpoints use standard status codes:

- **200 OK**: Success
- **201 Created**: Panel created
- **400 Bad Request**: Invalid NXML or request format
- **404 Not Found**: Panel not found
- **409 Conflict**: Panel already exists
- **429 Too Many Requests**: Max panels limit reached
- **500 Internal Server Error**: Runtime error
- **503 Service Unavailable**: WasmRuntime not ready

Error response format:

```json
{
  "error": {
    "code": "INVALID_NXML",
    "message": "Failed to parse NXML: Unexpected token at line 42",
    "details": {
      "line": 42,
      "column": 15
    }
  }
}
```

### 16.5 Authentication

**JWT Token-Based**

All requests must include a JWT token in the `Authorization` header:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Token Claims**:
```json
{
  "sub": "user-123",
  "workspace_id": "abc123",
  "exp": 1702934400,
  "permissions": ["panel:create", "panel:read", "panel:execute"]
}
```

**WebSocket Authentication**:
```javascript
const ws = new WebSocket(
  'ws://workspace-abc123.nexus.local:3001/panels/monitor-1/ws',
  {
    headers: {
      'Authorization': 'Bearer eyJhbGciOi...'
    }
  }
);
```

### 16.6 Implementation Reference

**Express.js Server Structure** (`runtime/workspace-kernel/src/server.ts`):

```typescript
import express from 'express';
import { WebSocketServer } from 'ws';
import { NexusReactor } from '@nexus/reactor';
import { WasmSandboxExecutor } from '@nexus/reactor/sandbox';

const app = express();
const wss = new WebSocketServer({ port: 3001 });

// Panel registry
const panels = new Map<string, {
  reactor: NexusReactor;
  executor: WasmSandboxExecutor;
  connections: Set<WebSocket>;
}>();

// Create panel
app.post('/panels', async (req, res) => {
  const { panelId, source, extensions } = req.body;

  if (panels.has(panelId)) {
    return res.status(409).json({
      error: { code: 'PANEL_EXISTS', message: 'Panel already exists' }
    });
  }

  try {
    const executor = new WasmSandboxExecutor(wasmConfig);
    const reactor = new NexusReactor({ source, executor, extensions });

    await reactor.mount();

    panels.set(panelId, {
      reactor,
      executor,
      connections: new Set()
    });

    res.status(201).json({
      status: 'ok',
      panelId,
      websocket: `ws://${req.headers.host.replace('3000', '3001')}/panels/${panelId}/ws`,
      initialState: reactor.getState()
    });
  } catch (error) {
    res.status(400).json({
      error: {
        code: 'INVALID_NXML',
        message: error.message
      }
    });
  }
});

// WebSocket handler
wss.on('connection', (ws, req) => {
  const panelId = req.url.match(/\/panels\/(.+?)\/ws/)?.[1];
  const panel = panels.get(panelId);

  if (!panel) {
    ws.close(1008, 'Panel not found');
    return;
  }

  panel.connections.add(ws);

  ws.on('message', async (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.type === 'TRIGGER') {
      try {
        const result = await panel.reactor.executeTool(msg.tool, msg.args);

        ws.send(JSON.stringify({
          type: 'RESULT',
          requestId: msg.requestId,
          status: 'success',
          mutations: result.mutations,
          returnValue: result.returnValue
        }));
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'RESULT',
          requestId: msg.requestId,
          status: 'error',
          error: {
            code: error.code,
            message: error.message
          }
        }));
      }
    }
  });
});

app.listen(3000);
```

---

## End of Specification

This specification provides a complete blueprint for implementing the Nexus WASM Runtime Bridge. The implementation should follow this spec closely to ensure compatibility with the Nexus Reactor and to maintain the security and performance guarantees outlined in the Nexus specification.

**Critical Requirements Summary**:
1. ✅ Use **standard container runtime** (not runwasi) - Section 10.1
2. ✅ Implement **suspend/resume with Asyncify** - Section 7.4
3. ✅ Use **`__nexus_ext_suspend()`** for async operations - Section 2.4 & Appendix 15.2
4. ✅ Expose **Workspace Kernel HTTP/WebSocket API** - Section 16

**Next Steps**:
1. Implement `runtime/nexus-wasm-bridge/` in Rust following this spec
2. Implement `runtime/workspace-kernel/` (Node.js HTTP/WebSocket server)
3. Modify `packages/nexus-reactor/` to use WASM executor
4. Apply Asyncify to QuickJS WASM module
5. Write comprehensive tests
6. Benchmark and optimize
7. Deploy to production

**Version History**:
- v1.0 (2025-12-15): Initial specification
- v1.1 (2025-12-15): Added Patches 1-4 (deployment fix, Asyncify requirement, Kernel API)
