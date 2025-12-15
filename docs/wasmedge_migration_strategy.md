# WasmEdge Migration Strategy for Nexus Reactor

## Executive Summary

**Problem**: The current nexus-reactor implementation uses JavaScript `Function` constructor for handler execution, which provides limited isolation through global shadowing. The specification requires WasmEdge containers for true sandboxing with capability-based security.

**Solution**: Phased migration to WasmEdge runtime while maintaining backward compatibility and the existing API surface.

**Timeline**: 3 phases over ~6-8 weeks
- Phase 2A: WasmEdge Runtime Foundation (2-3 weeks)
- Phase 2B: Handler Compilation & Execution (2-3 weeks)
- Phase 2C: Production Hardening (1-2 weeks)

---

## Current Architecture Analysis

### Critical Gap: Sandbox Strategy

**Current Implementation** (`packages/nexus-reactor/src/sandbox/executor.ts:69-114`):
```javascript
const factory = new Function(...contextKeys, body);
return () => factory(...contextValues);
```

**Issues**:
- ❌ Shared V8 context (no true memory isolation)
- ❌ No timeout enforcement (HANDLER_TIMEOUT_MS defined but unused)
- ❌ No memory limits (vulnerable to memory bombs)
- ❌ Shadow globals only (can be bypassed via indirect references)
- ❌ No resource accounting (CPU, network, disk)
- ❌ Single-threaded (one slow handler blocks all panels)

**Target Architecture** (from `docs/nexus_spec.md`):
- ✅ WasmEdge runtime with capability-based security
- ✅ Per-panel isolation (Panel-as-a-Thread model)
- ✅ Configurable memory limits
- ✅ Deterministic timeout enforcement
- ✅ Host function whitelist (no default access to anything)
- ✅ Multi-tenant safe execution

---

## Migration Architecture

### Three-Layer Model

```
┌─────────────────────────────────────────────────────┐
│  Nexus Reactor (JavaScript/TypeScript)              │
│  - Parser, Validator, State Management              │
│  - React Hydration, MCP Bridge                      │
└─────────────────┬───────────────────────────────────┘
                  │ (Serialized Context)
                  ↓
┌─────────────────────────────────────────────────────┐
│  Runtime Bridge (Rust/Go)                           │
│  - WasmEdge Instance Pool Management                │
│  - Context Serialization/Deserialization            │
│  - Host Function Registry                           │
└─────────────────┬───────────────────────────────────┘
                  │ (WASM Module Invocation)
                  ↓
┌─────────────────────────────────────────────────────┐
│  Handler WASM Module (Compiled from Handler Code)  │
│  - User handler code compiled to WASM               │
│  - No default capabilities                          │
│  - Imports only whitelisted host functions          │
└─────────────────────────────────────────────────────┘
```

### Key Design Decisions

#### 1. **Hybrid Execution Model**

**What stays in JavaScript**:
- ✅ NXML parsing and validation (no security boundary)
- ✅ State proxy and reactivity (needs JS Proxy API)
- ✅ View bindings evaluation (`{$state.foo}` expressions)
- ✅ React component hydration
- ✅ MCP bridge coordination

**What moves to WasmEdge**:
- ✅ Handler code execution (`<Handler>` blocks)
- ✅ Computed value expressions (complex logic)
- ✅ Extension access control

**Rationale**: Keep the heavy, non-security-critical parts in JS for development speed. Only isolate user code execution.

#### 2. **Compilation Strategy**

**Option A: QuickJS in WASM** (Recommended for Phase 2A)
- Embed QuickJS (JavaScript interpreter) as a WASM module
- Compile handler code to QuickJS bytecode
- Run bytecode inside WASM sandbox
- **Pros**: No toolchain change, JavaScript semantics preserved
- **Cons**: Interpreter overhead (~2-3x slower than native JS)

**Option B: AssemblyScript Compilation** (Phase 2B+)
- Compile handler code to AssemblyScript
- AssemblyScript → WASM (native compilation)
- **Pros**: Native WASM performance
- **Cons**: Requires language subset, breaking changes to handler syntax

**Decision**: Start with Option A for backward compatibility, explore Option B for performance-critical panels.

#### 3. **Context Passing Model**

**Challenge**: Pass `$state`, `$args`, `$view`, `$emit`, `$ext`, `$log` across WASM boundary.

**Solution**: Structured Message Passing via MessagePack

```typescript
// JavaScript → WASM
interface WasmContext {
  state_snapshot: Record<string, RuntimeValue>;  // Serialized state
  args: Record<string, unknown>;                 // Tool arguments
  capabilities: CapabilityToken[];               // What this handler can do
}

// WASM → JavaScript
interface WasmResult {
  status: 'success' | 'error';
  state_mutations: Array<{ key: string; value: RuntimeValue }>;
  events: Array<{ name: string; payload: unknown }>;
  view_commands: Array<ViewCommand>;
  error?: { message: string; stack: string };
}
```

**Flow**:
1. JS: Serialize current state + args → `WasmContext`
2. JS → WASM: Pass MessagePack-encoded context
3. WASM: Execute handler with injected context APIs
4. WASM: Collect state mutations, events, view commands
5. WASM → JS: Return `WasmResult`
6. JS: Apply mutations to proxy, emit events, update view

#### 4. **State Mutation Model**

**Challenge**: WASM can't directly mutate JS Proxy.

**Solution**: Transactional Mutation Batching

```javascript
// Before (direct mutation in JS sandbox)
$state.counter = $state.counter + 1;
$state.status = 'active';

// After (mutation collection in WASM)
// WASM handler calls:
__nexus_state_set('counter', __nexus_state_get('counter') + 1);
__nexus_state_set('status', 'active');

// WASM returns mutation log:
[
  { key: 'counter', value: 43 },
  { key: 'status', value: 'active' }
]

// JavaScript applies mutations to proxy:
result.state_mutations.forEach(({ key, value }) => {
  stateProxy[key] = value;
});
```

**Benefits**:
- WASM can't corrupt proxy internal state
- JS maintains full control over reactivity
- Mutations are atomic (all or nothing)
- Easy to implement undo/redo

---

## Phase 2A: WasmEdge Runtime Foundation (2-3 weeks)

### Objectives
- Set up WasmEdge runtime infrastructure
- Embed QuickJS as WASM module
- Create runtime bridge in Rust/Go
- Implement basic handler execution

### New Components

#### 1. Runtime Bridge Service (`runtime/nexus-wasm-bridge/`)

**Language**: Rust (for WASM ecosystem integration)

**Structure**:
```
runtime/nexus-wasm-bridge/
├── Cargo.toml
├── src/
│   ├── lib.rs              # Public API (FFI to Node.js)
│   ├── pool.rs             # WasmEdge instance pool
│   ├── context.rs          # Context serialization
│   ├── host_functions.rs   # Host function implementations
│   ├── compiler.rs         # Handler code → WASM compilation
│   └── error.rs            # Error mapping
├── wasmedge_modules/
│   └── quickjs.wasm        # QuickJS interpreter module
└── tests/
    └── integration.rs
```

**Key APIs**:

```rust
// Public FFI API (called from Node.js via N-API)
#[napi]
pub struct WasmRuntime {
    pool: Arc<Mutex<InstancePool>>,
}

#[napi]
impl WasmRuntime {
    #[napi(constructor)]
    pub fn new(config: RuntimeConfig) -> Result<Self>;

    #[napi]
    pub async fn execute_handler(
        &self,
        handler_code: String,
        context: WasmContext,
        timeout_ms: u32,
    ) -> Result<WasmResult>;

    #[napi]
    pub fn precompile_handler(&self, code: String) -> Result<Vec<u8>>;
}
```

#### 2. Modified Sandbox Executor (`packages/nexus-reactor/src/sandbox/executor.ts`)

**Before**:
```typescript
export class SandboxExecutor {
  executeHandler(handler: HandlerNode, context: SandboxContext): Promise<unknown> {
    const factory = new Function(...contextKeys, body);
    return factory(...contextValues);
  }
}
```

**After**:
```typescript
import { WasmRuntime, WasmContext, WasmResult } from '@nexus/wasm-bridge';

export class SandboxExecutor {
  private wasmRuntime: WasmRuntime;
  private useWasm: boolean;

  constructor(options: SandboxOptions) {
    this.useWasm = options.useWasm ?? true;
    if (this.useWasm) {
      this.wasmRuntime = new WasmRuntime({
        maxInstances: 10,
        memoryLimit: 32 * 1024 * 1024, // 32MB
        enableSIMD: true,
      });
    }
  }

  async executeHandler(
    handler: HandlerNode,
    context: SandboxContext
  ): Promise<unknown> {
    if (!this.useWasm) {
      // Fallback to legacy JS sandbox
      return this.executeHandlerLegacy(handler, context);
    }

    // Serialize context for WASM
    const wasmContext: WasmContext = {
      state_snapshot: this.serializeState(context.$state),
      args: context.$args,
      capabilities: this.buildCapabilities(handler),
    };

    // Execute in WASM
    const result: WasmResult = await this.wasmRuntime.executeHandler(
      handler.code,
      wasmContext,
      HANDLER_TIMEOUT_MS
    );

    // Apply result
    if (result.status === 'error') {
      throw new HandlerExecutionError(result.error.message, result.error.stack);
    }

    // Apply state mutations
    result.state_mutations.forEach(({ key, value }) => {
      context.$state[key] = value;
    });

    // Emit events
    result.events.forEach(({ name, payload }) => {
      context.$emit(name, payload);
    });

    // Apply view commands
    result.view_commands.forEach(cmd => {
      this.applyViewCommand(cmd, context.$view);
    });

    return result.return_value;
  }

  private serializeState(state: Record<string, RuntimeValue>): Record<string, unknown> {
    // Deep clone state, handling circular refs
    return structuredClone(state);
  }

  private buildCapabilities(handler: HandlerNode): CapabilityToken[] {
    // Parse handler code to detect required capabilities
    // For now, grant all (will be refined in Phase 2C)
    return ['state:read', 'state:write', 'events:emit', 'view:update'];
  }
}
```

#### 3. WASM Host Functions (`runtime/nexus-wasm-bridge/src/host_functions.rs`)

**Host functions exposed to WASM**:

```rust
use wasmedge_sdk::{Caller, WasmValue};
use serde_json::Value;

// State access
#[host_function]
fn nexus_state_get(caller: Caller, key: String) -> Result<Value> {
    let ctx = caller.data::<ExecutionContext>()?;
    Ok(ctx.state.get(&key).cloned().unwrap_or(Value::Null))
}

#[host_function]
fn nexus_state_set(caller: Caller, key: String, value: Value) -> Result<()> {
    let ctx = caller.data_mut::<ExecutionContext>()?;
    ctx.mutations.push(StateMutation { key, value });
    Ok(())
}

// Event emission
#[host_function]
fn nexus_emit(caller: Caller, event_name: String, payload: Value) -> Result<()> {
    let ctx = caller.data_mut::<ExecutionContext>()?;
    ctx.events.push(Event { name: event_name, payload });
    Ok(())
}

// View commands
#[host_function]
fn nexus_view_update(caller: Caller, command: ViewCommand) -> Result<()> {
    let ctx = caller.data_mut::<ExecutionContext>()?;
    ctx.view_commands.push(command);
    Ok(())
}

// Logging (safe, read-only)
#[host_function]
fn nexus_log(caller: Caller, level: String, message: String) -> Result<()> {
    let ctx = caller.data::<ExecutionContext>()?;
    eprintln!("[WASM:{}:{}] {}", ctx.panel_id, level, message);
    Ok(())
}

// Extension access (capability-gated)
#[host_function]
fn nexus_ext_call(
    caller: Caller,
    ext_name: String,
    method: String,
    args: Value
) -> Result<Value> {
    let ctx = caller.data::<ExecutionContext>()?;

    // Check capability
    if !ctx.capabilities.contains(&format!("ext:{}", ext_name)) {
        return Err(Error::PermissionDenied);
    }

    // Forward to extension handler (async via callback queue)
    ctx.ext_call_queue.push(ExtCall { ext_name, method, args });

    // Return promise ID (JS will resolve it)
    Ok(Value::Number(ctx.ext_call_queue.len().into()))
}
```

#### 4. QuickJS Wrapper (`runtime/nexus-wasm-bridge/quickjs_wrapper/`)

**Purpose**: Wrap QuickJS WASM module with Nexus-specific injection

```javascript
// This runs inside the QuickJS WASM module
// Nexus runtime injects these globals before running handler code

globalThis.$state = {
  get(key) {
    return __nexus_state_get(key);
  },
  set(key, value) {
    __nexus_state_set(key, value);
  }
};

// Make $state a Proxy for natural syntax
globalThis.$state = new Proxy({}, {
  get(_, key) {
    return __nexus_state_get(key);
  },
  set(_, key, value) {
    __nexus_state_set(key, value);
    return true;
  }
});

globalThis.$args = /* injected from context */;

globalThis.$emit = (name, payload) => {
  __nexus_emit(name, JSON.stringify(payload));
};

globalThis.$view = {
  setFilter: (component, value) => {
    __nexus_view_update(JSON.stringify({
      type: 'setFilter',
      component,
      value
    }));
  }
};

globalThis.$ext = {
  http: {
    get: async (url) => {
      const promiseId = __nexus_ext_call('http', 'get', JSON.stringify({ url }));
      return await __nexus_promise_await(promiseId);
    }
  }
};

globalThis.$log = (message) => {
  __nexus_log('info', String(message));
};
```

### Implementation Steps

**Week 1: Infrastructure**
1. Set up Rust project `runtime/nexus-wasm-bridge/` with WasmEdge SDK
2. Integrate QuickJS WASM module (use pre-built from wasmedge-quickjs project)
3. Create N-API bindings for Node.js (using `napi-rs`)
4. Write basic "hello world" handler execution test

**Week 2: Context Passing**
5. Implement MessagePack serialization for `WasmContext` and `WasmResult`
6. Create host function stubs in Rust
7. Build QuickJS wrapper with injected globals
8. Test state read/write round-trip

**Week 3: Integration**
9. Modify `packages/nexus-reactor/src/sandbox/executor.ts` with WASM path
10. Add feature flag `NEXUS_USE_WASM_SANDBOX=true`
11. Update existing integration tests to run with both JS and WASM sandboxes
12. Document migration guide for panel developers

### Success Criteria
- ✅ Simple handler (`$state.x = 1`) works in WASM
- ✅ Async handler with `await` works
- ✅ Extension calls work (`$ext.http.get(url)`)
- ✅ Event emission works (`$emit('toast', 'hi')`)
- ✅ Performance within 3x of JS sandbox (acceptable for Phase 2A)
- ✅ All existing tests pass with `NEXUS_USE_WASM_SANDBOX=true`

---

## Phase 2B: Handler Compilation & Execution (2-3 weeks)

### Objectives
- Implement handler code compilation cache
- Add timeout enforcement
- Implement memory limits
- Add resource accounting
- Performance optimization

### Enhancements

#### 1. Handler Compilation Cache

**Problem**: Compiling handler code on every execution is slow.

**Solution**: Pre-compile handlers during NXML validation, store bytecode.

```typescript
// packages/nexus-reactor/src/parser/validator.ts
export function validateAST(ast: NexusPanelAST, options?: ValidateOptions): void {
  // ... existing validation ...

  // NEW: Pre-compile handlers
  if (options?.precompileHandlers) {
    const wasmRuntime = new WasmRuntime(/* ... */);

    for (const tool of ast.logic.tools) {
      const bytecode = wasmRuntime.precompileHandler(tool.handler.code);
      // Store bytecode in AST or external cache
      tool.handler._compiledBytecode = bytecode;
    }
  }
}
```

**Storage**:
```typescript
interface HandlerNode {
  kind: 'Handler';
  code: HandlerCode;
  isAsync?: boolean;
  _compiledBytecode?: Uint8Array;  // NEW: Cached WASM bytecode
}
```

#### 2. Timeout Enforcement

**Implementation** (`runtime/nexus-wasm-bridge/src/pool.rs`):

```rust
use std::time::Duration;
use tokio::time::timeout;

impl InstancePool {
    pub async fn execute_with_timeout(
        &self,
        instance: &mut WasmInstance,
        timeout_ms: u32,
    ) -> Result<WasmResult> {
        let duration = Duration::from_millis(timeout_ms as u64);

        match timeout(duration, instance.run()).await {
            Ok(result) => result,
            Err(_) => {
                // Forcefully terminate the instance
                instance.terminate();
                Err(Error::Timeout)
            }
        }
    }
}
```

**JavaScript Integration**:
```typescript
try {
  const result = await this.wasmRuntime.executeHandler(
    handler.code,
    wasmContext,
    HANDLER_TIMEOUT_MS  // Now enforced!
  );
} catch (err) {
  if (err.code === 'TIMEOUT') {
    throw new HandlerTimeoutError(
      `Handler exceeded ${HANDLER_TIMEOUT_MS}ms limit`
    );
  }
  throw err;
}
```

#### 3. Memory Limits

**Configuration** (`runtime/nexus-wasm-bridge/src/lib.rs`):

```rust
#[napi(object)]
pub struct RuntimeConfig {
    pub max_instances: u32,
    pub memory_limit_bytes: u64,      // Per-instance memory limit
    pub stack_size_bytes: u64,        // Per-instance stack limit
    pub enable_simd: bool,
    pub enable_bulk_memory: bool,
}

impl InstancePool {
    fn create_instance(&self, config: &RuntimeConfig) -> Result<WasmInstance> {
        let mut wasm_config = wasmedge_sdk::Config::default();

        // Set memory limits
        wasm_config.set_max_memory_pages(
            (config.memory_limit_bytes / 65536) as u32
        );

        let vm = wasmedge_sdk::Vm::new(Some(wasm_config))?;

        // Load QuickJS module with limits
        vm.register_module_from_file("quickjs", &self.quickjs_path)?;

        Ok(WasmInstance { vm, config })
    }
}
```

#### 4. Resource Accounting

**Telemetry** (`runtime/nexus-wasm-bridge/src/telemetry.rs`):

```rust
pub struct ExecutionMetrics {
    pub duration_us: u64,
    pub memory_used_bytes: u64,
    pub memory_peak_bytes: u64,
    pub host_calls: HashMap<String, u32>,  // Count of each host function call
    pub cpu_instructions: u64,             // Approximate
}

impl WasmInstance {
    pub fn get_metrics(&self) -> ExecutionMetrics {
        ExecutionMetrics {
            duration_us: self.start_time.elapsed().as_micros() as u64,
            memory_used_bytes: self.vm.memory_size(),
            memory_peak_bytes: self.vm.memory_peak_size(),
            host_calls: self.ctx.host_call_counts.clone(),
            cpu_instructions: self.vm.instruction_count(),
        }
    }
}
```

**Usage in JavaScript**:
```typescript
const result = await this.wasmRuntime.executeHandler(/* ... */);

// NEW: Log metrics for monitoring
this.logMetrics(result.metrics);

if (result.metrics.memory_peak_bytes > MEMORY_WARN_THRESHOLD) {
  console.warn(`Handler ${handler.name} used excessive memory`);
}
```

#### 5. Performance Optimization

**Strategies**:

1. **Instance Pooling**: Reuse WASM instances instead of creating new ones
   ```rust
   pub struct InstancePool {
       available: VecDeque<WasmInstance>,
       in_use: HashSet<InstanceId>,
       max_size: usize,
   }

   impl InstancePool {
       pub async fn acquire(&mut self) -> Result<PooledInstance> {
           if let Some(instance) = self.available.pop_front() {
               // Reuse existing instance (reset state first)
               instance.reset();
               return Ok(PooledInstance::new(instance, self));
           }

           // Create new instance if pool not full
           if self.in_use.len() < self.max_size {
               let instance = self.create_instance(&self.config)?;
               return Ok(PooledInstance::new(instance, self));
           }

           // Wait for available instance
           self.wait_for_available().await
       }
   }
   ```

2. **AOT Compilation**: Use WasmEdge AOT compiler for hot handlers
   ```rust
   // One-time compilation to native code
   wasmedge_sdk::Compiler::compile(
       &quickjs_wasm_path,
       &quickjs_native_path,
       CompileOptions::default()
   )?;

   // Load native code instead of WASM
   vm.register_module_from_file("quickjs", &quickjs_native_path)?;
   ```

3. **Batch Execution**: Execute multiple handlers in one WASM call
   ```typescript
   // Instead of:
   await executeHandler(handler1, ctx1);
   await executeHandler(handler2, ctx2);

   // Batch:
   await executeBatch([
       { handler: handler1, context: ctx1 },
       { handler: handler2, context: ctx2 }
   ]);
   ```

### Implementation Steps

**Week 4: Compilation Cache**
1. Implement pre-compilation during NXML validation
2. Add bytecode storage to AST
3. Modify executor to use cached bytecode
4. Measure performance improvement (target: 5-10x faster)

**Week 5: Resource Limits**
5. Implement timeout enforcement with tokio::timeout
6. Configure memory limits in WasmEdge
7. Add resource accounting and telemetry
8. Write stress tests (infinite loops, memory bombs)

**Week 6: Performance**
9. Implement instance pooling
10. Add AOT compilation for hot paths
11. Benchmark against JS sandbox (target: within 2x)
12. Profile and optimize hot paths

### Success Criteria
- ✅ Handler execution < 2x slower than JS sandbox
- ✅ Timeout enforced (infinite loop doesn't hang)
- ✅ Memory limit enforced (OOM doesn't crash process)
- ✅ Resource metrics available for monitoring
- ✅ 100 concurrent handler executions without memory leak

---

## Phase 2C: Production Hardening (1-2 weeks)

### Objectives
- Capability-based security
- Error handling and recovery
- Monitoring and debugging
- Documentation and migration guide

### Enhancements

#### 1. Capability-Based Security

**Problem**: Current implementation grants all capabilities to all handlers.

**Solution**: Static analysis + explicit declaration.

**Handler Capability Declaration** (NXML extension):
```nxml
<Tool name="fetchData">
  <Arg name="url" type="string" required="true" />
  <Capabilities>
    <Capability type="state:write" scope="data" />
    <Capability type="ext:http" scope="*" />
    <Capability type="events:emit" scope="toast,notification" />
  </Capabilities>
  <Handler>
    const response = await $ext.http.get($args.url);
    $state.data = response.data;
    $emit('toast', 'Data loaded!');
  </Handler>
</Tool>
```

**Enforcement** (`runtime/nexus-wasm-bridge/src/host_functions.rs`):
```rust
#[host_function]
fn nexus_state_set(caller: Caller, key: String, value: Value) -> Result<()> {
    let ctx = caller.data::<ExecutionContext>()?;

    // Check capability
    let required_cap = format!("state:write:{}", key);
    if !ctx.capabilities.contains(&required_cap) &&
       !ctx.capabilities.contains("state:write:*") {
        return Err(Error::PermissionDenied {
            capability: required_cap,
            reason: "Handler not authorized to write this state key"
        });
    }

    ctx.mutations.push(StateMutation { key, value });
    Ok(())
}
```

**Static Analysis** (`packages/nexus-reactor/src/parser/analyzer.ts`):
```typescript
export function analyzeHandlerCapabilities(code: HandlerCode): CapabilityToken[] {
  const capabilities = new Set<CapabilityToken>();

  // Parse code with Babel
  const ast = parse(code, { sourceType: 'module' });

  traverse(ast, {
    MemberExpression(path) {
      // Detect $state.x = ...
      if (path.node.object.name === '$state' && path.parent.type === 'AssignmentExpression') {
        const key = path.node.property.name;
        capabilities.add(`state:write:${key}`);
      }

      // Detect $ext.http.get(...)
      if (path.node.object.name === '$ext') {
        const service = path.node.property.name;
        capabilities.add(`ext:${service}`);
      }
    },

    CallExpression(path) {
      // Detect $emit('event', ...)
      if (path.node.callee.name === '$emit') {
        const eventName = path.node.arguments[0].value;
        capabilities.add(`events:emit:${eventName}`);
      }
    }
  });

  return Array.from(capabilities);
}
```

#### 2. Error Handling and Recovery

**Structured Errors** (`runtime/nexus-wasm-bridge/src/error.rs`):

```rust
#[napi(object)]
pub struct WasmError {
    pub code: String,              // TIMEOUT, PERMISSION_DENIED, MEMORY_LIMIT, etc.
    pub message: String,
    pub stack: Option<String>,     // Source-mapped stack trace
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub source: Option<String>,    // Original handler code snippet
}

impl From<wasmedge_sdk::Error> for WasmError {
    fn from(err: wasmedge_sdk::Error) -> Self {
        match err {
            wasmedge_sdk::Error::Execution(exec_err) => {
                WasmError {
                    code: "EXECUTION_ERROR".into(),
                    message: exec_err.to_string(),
                    stack: extract_stack_trace(&exec_err),
                    // ... map source location ...
                }
            }
            // ... other error types ...
        }
    }
}
```

**Recovery Strategies**:
- **Timeout**: Terminate instance, return error, retry with increased timeout (once)
- **Memory Limit**: Terminate instance, return error, no retry
- **Permission Denied**: Return error immediately, suggest required capability
- **Execution Error**: Return error with source location, no retry

#### 3. Monitoring and Debugging

**Metrics Export** (`packages/nexus-reactor/src/telemetry.ts`):

```typescript
export interface HandlerMetrics {
  panelId: string;
  toolName: string;
  executionTimeMs: number;
  memoryUsedBytes: number;
  hostCallCount: Record<string, number>;
  success: boolean;
  errorCode?: string;
  timestamp: number;
}

export class MetricsCollector {
  private metrics: HandlerMetrics[] = [];

  record(metric: HandlerMetrics): void {
    this.metrics.push(metric);

    // Export to monitoring system (Prometheus, Datadog, etc.)
    if (process.env.NEXUS_METRICS_ENDPOINT) {
      this.exportMetric(metric);
    }
  }

  getStats(panelId: string): AggregatedStats {
    const panelMetrics = this.metrics.filter(m => m.panelId === panelId);
    return {
      totalExecutions: panelMetrics.length,
      avgExecutionTime: average(panelMetrics.map(m => m.executionTimeMs)),
      p95ExecutionTime: percentile(panelMetrics.map(m => m.executionTimeMs), 0.95),
      errorRate: panelMetrics.filter(m => !m.success).length / panelMetrics.length,
      // ...
    };
  }
}
```

**Debug Mode** (`NEXUS_DEBUG_WASM=true`):
- Enable verbose logging of context serialization
- Dump handler bytecode to disk
- Enable WasmEdge debug mode (DWARF symbols)
- Record full execution trace

#### 4. Migration Guide

**Documentation** (`packages/nexus-reactor/MIGRATION.md`):

```markdown
# Migrating to WasmEdge Runtime

## Breaking Changes

### 1. No Direct Global Access
**Before (JS Sandbox)**:
```javascript
<Handler>
  console.log("Hello");  // Works in JS sandbox
  window.location = '...'; // Blocked by shadowing
</Handler>
```

**After (WASM Sandbox)**:
```javascript
<Handler>
  $log("Hello");  // Must use $log API
  // window doesn't exist in WASM
</Handler>
```

### 2. Synchronous Extension Calls Not Supported
**Before**:
```javascript
<Handler>
  const data = $ext.http.getSync('/api/data');  // If this existed
</Handler>
```

**After**:
```javascript
<Handler>
  const data = await $ext.http.get('/api/data');  // Must be async
</Handler>
```

### 3. Handler Code Must Be Serializable
**Before**:
```javascript
const myFunction = () => { /* ... */ };

<Tool name="test">
  <Handler>
    myFunction();  // Closure over external scope
  </Handler>
</Tool>
```

**After**:
```javascript
<Tool name="test">
  <Handler>
    // Handler code must be self-contained
    const myFunction = () => { /* ... */ };
    myFunction();
  </Handler>
</Tool>
```

## Performance Considerations

- First execution: ~5-10ms overhead (compilation)
- Subsequent executions: ~1-2ms overhead (context serialization)
- Memory: Each active handler uses ~2MB (QuickJS + WASM overhead)

## Capability Declarations

Handlers should declare required capabilities:
```nxml
<Tool name="myTool">
  <Capabilities>
    <Capability type="state:write" scope="*" />
    <Capability type="ext:http" scope="*" />
  </Capabilities>
  <Handler>...</Handler>
</Tool>
```

## Fallback Mode

To use legacy JS sandbox (for debugging):
```javascript
const reactor = new NexusReactor({
  source: nxmlSource,
  useWasmSandbox: false  // Use JS sandbox
});
```
```

### Implementation Steps

**Week 7: Security**
1. Implement capability declaration in NXML
2. Add static analysis for automatic capability detection
3. Enforce capabilities in host functions
4. Write security tests (privilege escalation attempts)

**Week 8: Production Readiness**
5. Implement structured error handling
6. Add metrics collection and export
7. Write comprehensive documentation
8. Conduct security audit

### Success Criteria
- ✅ Capability system enforced (handler can't exceed declared permissions)
- ✅ All errors have actionable messages with source locations
- ✅ Metrics available for all handler executions
- ✅ Documentation complete with migration guide
- ✅ Security audit passed (no privilege escalation vulnerabilities)

---

## Rollout Plan

### Phase 0: Preparation (Week 0)
- [ ] Review and approve this strategy document
- [ ] Set up Rust development environment
- [ ] Create feature branch `feat/wasmedge-runtime`
- [ ] Communicate plan to team

### Phase 2A: Foundation (Weeks 1-3)
- [ ] Implement WasmEdge bridge (Rust)
- [ ] Integrate QuickJS WASM module
- [ ] Modify sandbox executor with feature flag
- [ ] Achieve parity with JS sandbox functionality
- [ ] **Milestone**: First handler runs in WASM

### Phase 2B: Optimization (Weeks 4-6)
- [ ] Implement compilation cache
- [ ] Add timeout and memory limits
- [ ] Optimize instance pooling
- [ ] Benchmark performance
- [ ] **Milestone**: Production-ready performance

### Phase 2C: Hardening (Weeks 7-8)
- [ ] Implement capability-based security
- [ ] Add monitoring and debugging tools
- [ ] Write documentation
- [ ] Conduct security audit
- [ ] **Milestone**: Production deployment

### Phase 3: Deployment (Weeks 9+)
- [ ] Alpha release (internal testing)
- [ ] Beta release (select users with `NEXUS_USE_WASM_SANDBOX=true`)
- [ ] Monitor metrics and errors
- [ ] Fix issues
- [ ] General availability (default to WASM sandbox)
- [ ] Deprecate JS sandbox (6 months later)

---

## Risk Mitigation

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| QuickJS performance too slow | High | Benchmark early; consider AssemblyScript path |
| WasmEdge stability issues | High | Thorough testing; maintain JS sandbox fallback |
| N-API binding complexity | Medium | Use well-tested `napi-rs` library |
| Context serialization overhead | Medium | Optimize MessagePack usage; batch operations |
| Handler compatibility breaks | High | Comprehensive migration guide; gradual rollout |

### Process Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Timeline slip | Medium | Phased approach; each phase delivers value |
| Insufficient testing | High | Write tests from day 1; 80%+ coverage target |
| Breaking changes to panels | High | Feature flag; backward compatibility; long deprecation |
| Documentation gaps | Medium | Write docs as you code; peer review |

---

## Success Metrics

### Performance
- ✅ Handler execution time < 2x JS sandbox
- ✅ Memory usage < 5MB per active panel
- ✅ Compilation cache hit rate > 90%
- ✅ 99th percentile execution time < 100ms

### Security
- ✅ Zero privilege escalation vulnerabilities
- ✅ All handlers run in isolated WASM context
- ✅ Capability system enforced for all panels
- ✅ Timeout enforced (no infinite loops in production)

### Reliability
- ✅ 99.9% handler execution success rate
- ✅ Zero memory leaks in 24hr stress test
- ✅ Graceful degradation on WASM runtime failure (fallback to JS)
- ✅ All existing panels work with WASM sandbox (with migration if needed)

### Adoption
- ✅ 80% of panels migrated to WASM sandbox within 3 months
- ✅ Positive developer feedback (NPS > 8)
- ✅ Zero production incidents caused by WASM migration

---

## Conclusion

This migration strategy transitions Nexus Reactor from a JavaScript Function constructor sandbox to a true WasmEdge-based isolation model while maintaining backward compatibility and developer experience.

**Key Principles**:
1. **Phased approach**: Each phase delivers value independently
2. **Feature flags**: Gradual rollout with fallback to JS sandbox
3. **Backward compatibility**: Existing panels continue working
4. **Security first**: Capability-based security from day 1
5. **Performance**: Optimize for production workloads
6. **Developer experience**: Clear migration guide and debugging tools

**Next Steps**:
1. Review and approve this strategy
2. Create detailed implementation tickets for Phase 2A
3. Set up Rust development environment
4. Begin implementation

**Estimated Completion**: 8 weeks from start to production-ready WASM runtime.
