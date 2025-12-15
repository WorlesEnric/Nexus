# Host Function Interface

<cite>
**Referenced Files in This Document**
- [lib.rs](file://runtime/nexus-wasm-bridge/src/lib.rs)
- [quickjs_wrapper.js](file://runtime/nexus-wasm-bridge/src/quickjs_wrapper.js)
- [host_functions/mod.rs](file://runtime/nexus-wasm-bridge/src/host_functions/mod.rs)
- [host_functions/state.rs](file://runtime/nexus-wasm-bridge/src/host_functions/state.rs)
- [host_functions/events.rs](file://runtime/nexus-wasm-bridge/src/host_functions/events.rs)
- [host_functions/view.rs](file://runtime/nexus-wasm-bridge/src/host_functions/view.rs)
- [host_functions/logging.rs](file://runtime/nexus-wasm-bridge/src/host_functions/logging.rs)
- [host_functions/extension.rs](file://runtime/nexus-wasm-bridge/src/host_functions/extension.rs)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs)
- [error.rs](file://runtime/nexus-wasm-bridge/src/error.rs)
- [engine/mod.rs](file://runtime/nexus-wasm-bridge/src/engine/mod.rs)
- [engine/instance.rs](file://runtime/nexus-wasm-bridge/src/engine/instance.rs)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document describes the Host Function Interface that exposes native capabilities from Rust to the WASM JavaScript environment. The interface enables handlers to interact with the Nexus platform through five core host functions:
- __nexus_state_get/set/has/keys for state management
- __nexus_emit for event broadcasting
- __nexus_view_command for UI manipulation
- __nexus_log for logging
- __nexus_ext_suspend for extension access

It explains how WasmEdge’s host function API integrates with the Caller data pattern to access the execution context, outlines function signatures and return conventions, and demonstrates how the QuickJS wrapper script constructs the $state, $emit, $view, and $ext APIs. It also covers error handling strategies for invalid parameters and missing capabilities, and details the asynchronous extension call mechanism using suspension and resumption.

## Project Structure
The Host Function Interface spans several modules:
- Host function implementations under host_functions
- QuickJS wrapper that exposes $state, $emit, $view, $ext, $log, and $time
- Execution context and result types
- Capability-based security model
- Error codes and types
- Engine and instance lifecycle for execution and suspension

```mermaid
graph TB
subgraph "Host Functions"
HF_MOD["host_functions/mod.rs"]
HF_STATE["host_functions/state.rs"]
HF_EVENTS["host_functions/events.rs"]
HF_VIEW["host_functions/view.rs"]
HF_LOGGING["host_functions/logging.rs"]
HF_EXT["host_functions/extension.rs"]
end
QJS["quickjs_wrapper.js"]
CTX["context.rs"]
CAP["capability.rs"]
ERR["error.rs"]
ENG["engine/mod.rs"]
INST["engine/instance.rs"]
QJS --> HF_STATE
QJS --> HF_EVENTS
QJS --> HF_VIEW
QJS --> HF_LOGGING
QJS --> HF_EXT
HF_STATE --> CTX
HF_EVENTS --> CTX
HF_VIEW --> CTX
HF_LOGGING --> CTX
HF_EXT --> CTX
CTX --> CAP
CTX --> ERR
ENG --> INST
INST --> CTX
```

**Diagram sources**
- [host_functions/mod.rs](file://runtime/nexus-wasm-bridge/src/host_functions/mod.rs#L1-L92)
- [host_functions/state.rs](file://runtime/nexus-wasm-bridge/src/host_functions/state.rs#L1-L238)
- [host_functions/events.rs](file://runtime/nexus-wasm-bridge/src/host_functions/events.rs#L1-L155)
- [host_functions/view.rs](file://runtime/nexus-wasm-bridge/src/host_functions/view.rs#L1-L251)
- [host_functions/logging.rs](file://runtime/nexus-wasm-bridge/src/host_functions/logging.rs#L1-L170)
- [host_functions/extension.rs](file://runtime/nexus-wasm-bridge/src/host_functions/extension.rs#L1-L233)
- [quickjs_wrapper.js](file://runtime/nexus-wasm-bridge/src/quickjs_wrapper.js#L1-L411)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L1-L695)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L384)
- [error.rs](file://runtime/nexus-wasm-bridge/src/error.rs#L1-L395)
- [engine/mod.rs](file://runtime/nexus-wasm-bridge/src/engine/mod.rs#L1-L244)
- [engine/instance.rs](file://runtime/nexus-wasm-bridge/src/engine/instance.rs#L1-L381)

**Section sources**
- [lib.rs](file://runtime/nexus-wasm-bridge/src/lib.rs#L1-L71)
- [quickjs_wrapper.js](file://runtime/nexus-wasm-bridge/src/quickjs_wrapper.js#L1-L411)
- [host_functions/mod.rs](file://runtime/nexus-wasm-bridge/src/host_functions/mod.rs#L1-L92)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L1-L695)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L384)
- [error.rs](file://runtime/nexus-wasm-bridge/src/error.rs#L1-L395)
- [engine/mod.rs](file://runtime/nexus-wasm-bridge/src/engine/mod.rs#L1-L244)
- [engine/instance.rs](file://runtime/nexus-wasm-bridge/src/engine/instance.rs#L1-L381)

## Core Components
- HostFunctions registry: centralizes host function invocation, tracks host call counts, and provides access to the shared execution context.
- Five host function families:
  - State: get, set, delete, has, keys
  - Events: emit, toast convenience
  - View: setFilter, scrollTo, focus, custom command
  - Logging: log, debug/info/warn/error helpers, now
  - Extension: suspend (async), exists, methods, list
- QuickJS wrapper: injects $state, $emit, $view, $ext, $log, $time into the sandbox and serializes values using a minimal encoder/decoder.
- Execution context: holds state snapshot, mutations, events, view commands, logs, and suspension state; provides capability checks and counters.
- Capability system: token-based permissions scoped to state keys, event names, view components, and extension names.
- Error codes and types: unified error codes and structured error reporting.

**Section sources**
- [host_functions/mod.rs](file://runtime/nexus-wasm-bridge/src/host_functions/mod.rs#L1-L92)
- [host_functions/state.rs](file://runtime/nexus-wasm-bridge/src/host_functions/state.rs#L1-L238)
- [host_functions/events.rs](file://runtime/nexus-wasm-bridge/src/host_functions/events.rs#L1-L155)
- [host_functions/view.rs](file://runtime/nexus-wasm-bridge/src/host_functions/view.rs#L1-L251)
- [host_functions/logging.rs](file://runtime/nexus-wasm-bridge/src/host_functions/logging.rs#L1-L170)
- [host_functions/extension.rs](file://runtime/nexus-wasm-bridge/src/host_functions/extension.rs#L1-L233)
- [quickjs_wrapper.js](file://runtime/nexus-wasm-bridge/src/quickjs_wrapper.js#L1-L411)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L1-L695)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L384)
- [error.rs](file://runtime/nexus-wasm-bridge/src/error.rs#L1-L395)

## Architecture Overview
The Host Function Interface operates within a WasmEdge-based runtime. The QuickJS wrapper script runs inside the WASM sandbox and invokes host functions exported by Rust. The Caller data pattern provides access to a shared execution context that enforces capabilities and collects side effects (mutations, events, view commands, logs).

```mermaid
sequenceDiagram
participant JS as "QuickJS Script ($state/$emit/$view/$ext/$log)"
participant Host as "Host Functions Registry"
participant Ctx as "ExecutionContext"
participant Cap as "Capability Checker"
participant Res as "WasmResult"
JS->>Host : "__nexus_state_get(key)"
Host->>Ctx : lock()
Host->>Cap : has_capability("state : read : key")
Cap-->>Host : allowed?
alt allowed
Host->>Ctx : read state snapshot
Ctx-->>Host : value
Host-->>JS : serialized value
else denied
Host-->>JS : error code
end
JS->>Host : "__nexus_emit_event(name, payload)"
Host->>Ctx : lock()
Host->>Cap : has_capability("events : emit : name")
Cap-->>Host : allowed?
alt allowed
Host->>Ctx : add event
Host-->>JS : ok
else denied
Host-->>JS : error code
end
JS->>Host : "__nexus_ext_suspend(ext, method, args)"
Host->>Ctx : lock()
Host->>Cap : has_capability("ext : *" or "ext : ext")
Cap-->>Host : allowed?
alt allowed
Host->>Ctx : set suspension state
Host-->>JS : suspension details
else denied
Host-->>JS : error code
end
```

**Diagram sources**
- [host_functions/mod.rs](file://runtime/nexus-wasm-bridge/src/host_functions/mod.rs#L1-L92)
- [host_functions/state.rs](file://runtime/nexus-wasm-bridge/src/host_functions/state.rs#L1-L238)
- [host_functions/events.rs](file://runtime/nexus-wasm-bridge/src/host_functions/events.rs#L1-L155)
- [host_functions/extension.rs](file://runtime/nexus-wasm-bridge/src/host_functions/extension.rs#L1-L233)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L538-L640)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L384)

## Detailed Component Analysis

### State Host Functions
- Purpose: Provide read/write access to the panel’s reactive state snapshot and record mutations for later application.
- Functions:
  - __nexus_state_get(key): returns serialized value or null if not found
  - __nexus_state_set(key, value): records a set mutation
  - __nexus_state_delete(key): records a delete mutation
  - __nexus_state_has(key): checks presence
  - __nexus_state_keys(): lists keys (requires wildcard read capability)
- Capability enforcement:
  - Read: state:read:{key} or state:read:*
  - Write: state:write:{key} or state:write:*
- Return convention:
  - Success: ok (no explicit value)
  - Failure: error code (permission denied, resource limit)
- Error handling:
  - Permission denied when capability check fails
  - Host call limit enforced by HostFunctions::check_host_call_limit

```mermaid
flowchart TD
Start(["State Host Function Entry"]) --> Lock["Lock ExecutionContext"]
Lock --> CheckCap{"Has required capability?"}
CheckCap --> |No| Deny["Return PERMISSION_DENIED"]
CheckCap --> |Yes| Op{"Operation"}
Op --> |get| Read["Read from state snapshot"]
Op --> |set| MutSet["Record StateMutation(Set)"]
Op --> |delete| MutDel["Record StateMutation(Delete)"]
Op --> |has| Has["Check key presence"]
Op --> |keys| Keys["Collect keys (requires wildcard)"]
Read --> Done(["Return"])
MutSet --> Done
MutDel --> Done
Has --> Done
Keys --> Done
Deny --> Done
```

**Diagram sources**
- [host_functions/state.rs](file://runtime/nexus-wasm-bridge/src/host_functions/state.rs#L1-L238)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L538-L640)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L384)
- [host_functions/mod.rs](file://runtime/nexus-wasm-bridge/src/host_functions/mod.rs#L1-L92)

**Section sources**
- [host_functions/state.rs](file://runtime/nexus-wasm-bridge/src/host_functions/state.rs#L1-L238)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L297-L361)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L384)
- [host_functions/mod.rs](file://runtime/nexus-wasm-bridge/src/host_functions/mod.rs#L1-L92)

### Event Host Functions
- Purpose: Allow handlers to emit events that propagate to the host system.
- Functions:
  - __nexus_emit_event(name, payload): records an emitted event
  - Convenience: emit_toast(message, type) builds a toast event payload
- Capability enforcement:
  - events:emit:{name} or events:emit:*
- Return convention:
  - Success: ok
  - Failure: error code (permission denied)
- Error handling:
  - Permission denied when capability check fails

```mermaid
flowchart TD
Start(["Emit Host Function Entry"]) --> Lock["Lock ExecutionContext"]
Lock --> CheckCap{"Has required capability?"}
CheckCap --> |No| Deny["Return PERMISSION_DENIED"]
CheckCap --> |Yes| Record["Add EmittedEvent"]
Record --> Done(["Return"])
Deny --> Done
```

**Diagram sources**
- [host_functions/events.rs](file://runtime/nexus-wasm-bridge/src/host_functions/events.rs#L1-L155)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L341-L361)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L384)

**Section sources**
- [host_functions/events.rs](file://runtime/nexus-wasm-bridge/src/host_functions/events.rs#L1-L155)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L341-L361)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L384)

### View Host Functions
- Purpose: Enable imperative UI manipulation by sending view commands.
- Functions:
  - __nexus_view_command(component_id?, command_type, args): records a view command
  - Helpers: setFilter, scrollTo, focus, custom
- Capability enforcement:
  - view:update:{component_id} or view:update:*
- Return convention:
  - Success: ok
  - Failure: error code (permission denied)
- Error handling:
  - Permission denied when capability check fails

```mermaid
flowchart TD
Start(["View Host Function Entry"]) --> Lock["Lock ExecutionContext"]
Lock --> CheckCap{"Has required capability?"}
CheckCap --> |No| Deny["Return PERMISSION_DENIED"]
CheckCap --> |Yes| Record["Add ViewCommand"]
Record --> Done(["Return"])
Deny --> Done
```

**Diagram sources**
- [host_functions/view.rs](file://runtime/nexus-wasm-bridge/src/host_functions/view.rs#L1-L251)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L362-L424)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L384)

**Section sources**
- [host_functions/view.rs](file://runtime/nexus-wasm-bridge/src/host_functions/view.rs#L1-L251)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L362-L424)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L384)

### Logging Host Functions
- Purpose: Provide safe logging without requiring capabilities; captures logs in the execution context.
- Functions:
  - __nexus_log(level, message): records a log message
  - Helpers: __nexus_log_debug/info/warn/error
  - __nexus_now(): returns current timestamp in milliseconds
- Capability enforcement:
  - None required
- Return convention:
  - Success: ok
  - Failure: error code (not applicable; logging is always allowed)
- Error handling:
  - Always succeeds; logs are captured for downstream consumption

```mermaid
flowchart TD
Start(["Log Host Function Entry"]) --> Lock["Lock ExecutionContext"]
Lock --> Level["Convert level to enum"]
Level --> Record["Add LogMessage"]
Record --> Done(["Return"])
```

**Diagram sources**
- [host_functions/logging.rs](file://runtime/nexus-wasm-bridge/src/host_functions/logging.rs#L1-L170)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L606-L640)

**Section sources**
- [host_functions/logging.rs](file://runtime/nexus-wasm-bridge/src/host_functions/logging.rs#L1-L170)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L606-L640)

### Extension Host Functions (Async)
- Purpose: Enable async extension calls using suspension and resumption.
- Functions:
  - __nexus_ext_suspend(ext_name, method, args): creates a suspension and returns suspension details
  - __nexus_ext_exists(ext_name): checks availability
  - __nexus_ext_methods(ext_name): lists methods
  - __nexus_ext_list(): lists extensions
- Capability enforcement:
  - ext:* or ext:{ext_name}
- Return convention:
  - Success: ok or suspension details
  - Failure: error code (permission denied or not found)
- Error handling:
  - Permission denied when capability check fails
  - Not found when extension or method is unknown

```mermaid
sequenceDiagram
participant JS as "QuickJS Script ($ext.api.method())"
participant Host as "HostFunctions : : ext_suspend"
participant Ctx as "ExecutionContext"
participant RT as "Runtime"
JS->>Host : "__nexus_ext_suspend(ext, method, args)"
Host->>Ctx : lock()
Host->>Host : validate extension and method
Host->>Host : check capability "ext : *" or "ext : ext"
alt allowed
Host->>Ctx : set SuspensionState
Host-->>JS : SuspensionDetails {id, ext, method, args}
Note over JS,Ctx : Execution pauses here
JS->>RT : await result
RT->>Host : resume_handler with AsyncResult
Host->>Ctx : inject result and continue
Host-->>JS : return value
else denied/not found
Host-->>JS : error code
end
```

**Diagram sources**
- [host_functions/extension.rs](file://runtime/nexus-wasm-bridge/src/host_functions/extension.rs#L1-L233)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L425-L494)
- [engine/mod.rs](file://runtime/nexus-wasm-bridge/src/engine/mod.rs#L167-L194)

**Section sources**
- [host_functions/extension.rs](file://runtime/nexus-wasm-bridge/src/host_functions/extension.rs#L1-L233)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L425-L494)
- [engine/mod.rs](file://runtime/nexus-wasm-bridge/src/engine/mod.rs#L167-L194)

### QuickJS Wrapper APIs
- $state: get, set, delete, has, keys, update
- $emit: emit(name, payload) with toast convenience
- $view: setFilter, scrollTo, focus, command
- $ext: dynamic proxy that resolves to extension methods; async calls suspend execution until resumed
- $log: debug, info, warn, error
- $time.now(): timestamp utility

The wrapper injects host function imports and serializes values using a minimal encoder/decoder. It validates parameter types and throws typed errors for invalid inputs.

**Section sources**
- [quickjs_wrapper.js](file://runtime/nexus-wasm-bridge/src/quickjs_wrapper.js#L1-L411)

### Caller Data Pattern and WasmEdge Integration
- The Caller data pattern allows host functions to access the shared execution context stored in the WasmEdge Caller.
- The HostFunctions registry wraps the shared context and enforces host call limits.
- During execution, the engine sets up the execution context and transitions instances between Idle, Executing, and Suspended states.

```mermaid
classDiagram
class HostFunctions {
+new(context, max_host_calls)
+check_host_call_limit() Result
+context() SharedContext
}
class ExecutionContext {
+panel_id
+handler_name
+state_snapshot
+args
+scope
+capabilities
+state_mutations
+events
+view_commands
+log_messages
+host_call_count
+suspension
+has_capability(cap)
+increment_host_calls()
+add_mutation()
+add_event()
+add_view_command()
+add_log()
}
class SharedContext {
<<Arc<Mutex<ExecutionContext>>>
}
HostFunctions --> SharedContext : "owns"
SharedContext --> ExecutionContext : "locks"
```

**Diagram sources**
- [host_functions/mod.rs](file://runtime/nexus-wasm-bridge/src/host_functions/mod.rs#L1-L92)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L495-L640)

**Section sources**
- [host_functions/mod.rs](file://runtime/nexus-wasm-bridge/src/host_functions/mod.rs#L1-L92)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L495-L640)
- [engine/instance.rs](file://runtime/nexus-wasm-bridge/src/engine/instance.rs#L118-L211)

## Dependency Analysis
- Host functions depend on:
  - ExecutionContext for state snapshot, mutations, events, view commands, logs, and suspension
  - Capability tokens for enforcing permissions
  - Error codes for consistent error signaling
- QuickJS wrapper depends on host function exports and provides a typed API surface to handlers.
- Engine and instance manage lifecycle, suspension, and resumption.

```mermaid
graph LR
QJS["quickjs_wrapper.js"] --> HS["host_functions/state.rs"]
QJS --> HE["host_functions/events.rs"]
QJS --> HV["host_functions/view.rs"]
QJS --> HL["host_functions/logging.rs"]
QJS --> HEX["host_functions/extension.rs"]
HS --> CTX["context.rs"]
HE --> CTX
HV --> CTX
HL --> CTX
HEX --> CTX
CTX --> CAP["capability.rs"]
CTX --> ERR["error.rs"]
ENG["engine/mod.rs"] --> INST["engine/instance.rs"]
INST --> CTX
```

**Diagram sources**
- [quickjs_wrapper.js](file://runtime/nexus-wasm-bridge/src/quickjs_wrapper.js#L1-L411)
- [host_functions/state.rs](file://runtime/nexus-wasm-bridge/src/host_functions/state.rs#L1-L238)
- [host_functions/events.rs](file://runtime/nexus-wasm-bridge/src/host_functions/events.rs#L1-L155)
- [host_functions/view.rs](file://runtime/nexus-wasm-bridge/src/host_functions/view.rs#L1-L251)
- [host_functions/logging.rs](file://runtime/nexus-wasm-bridge/src/host_functions/logging.rs#L1-L170)
- [host_functions/extension.rs](file://runtime/nexus-wasm-bridge/src/host_functions/extension.rs#L1-L233)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L1-L695)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L384)
- [error.rs](file://runtime/nexus-wasm-bridge/src/error.rs#L1-L395)
- [engine/mod.rs](file://runtime/nexus-wasm-bridge/src/engine/mod.rs#L1-L244)
- [engine/instance.rs](file://runtime/nexus-wasm-bridge/src/engine/instance.rs#L1-L381)

**Section sources**
- [quickjs_wrapper.js](file://runtime/nexus-wasm-bridge/src/quickjs_wrapper.js#L1-L411)
- [host_functions/state.rs](file://runtime/nexus-wasm-bridge/src/host_functions/state.rs#L1-L238)
- [host_functions/events.rs](file://runtime/nexus-wasm-bridge/src/host_functions/events.rs#L1-L155)
- [host_functions/view.rs](file://runtime/nexus-wasm-bridge/src/host_functions/view.rs#L1-L251)
- [host_functions/logging.rs](file://runtime/nexus-wasm-bridge/src/host_functions/logging.rs#L1-L170)
- [host_functions/extension.rs](file://runtime/nexus-wasm-bridge/src/host_functions/extension.rs#L1-L233)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L1-L695)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L384)
- [error.rs](file://runtime/nexus-wasm-bridge/src/error.rs#L1-L395)
- [engine/mod.rs](file://runtime/nexus-wasm-bridge/src/engine/mod.rs#L1-L244)
- [engine/instance.rs](file://runtime/nexus-wasm-bridge/src/engine/instance.rs#L1-L381)

## Performance Considerations
- Host call limiting: HostFunctions::check_host_call_limit prevents excessive host calls per execution.
- Resource limits: The engine enforces timeouts and tracks memory usage; consider configuring limits appropriately.
- Serialization overhead: The wrapper uses a minimal encoder/decoder; keep payloads compact.
- Suspension minimizes blocking: Async extension calls suspend execution and resume efficiently.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Permission denied:
  - Ensure the handler has the appropriate capability token (e.g., state:read:{key}, events:emit:{name}, view:update:{id}, ext:{name}).
  - Verify capability parsing and matching logic.
- Not found:
  - Extension or method not registered; confirm extension registry and method lists.
- Resource limit exceeded:
  - Host call limit reached; reduce host calls or increase limits.
- Invalid argument:
  - Parameter types must match expectations (e.g., string keys for state).
- Execution errors:
  - Inspect WasmError for code, stack, and location; adjust handler code accordingly.

**Section sources**
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L384)
- [error.rs](file://runtime/nexus-wasm-bridge/src/error.rs#L1-L395)
- [host_functions/mod.rs](file://runtime/nexus-wasm-bridge/src/host_functions/mod.rs#L1-L92)
- [host_functions/extension.rs](file://runtime/nexus-wasm-bridge/src/host_functions/extension.rs#L1-L233)

## Conclusion
The Host Function Interface provides a secure, capability-gated bridge between the WASM JavaScript environment and the Nexus platform. Through the Caller data pattern, host functions access a shared execution context to enforce permissions, collect side effects, and coordinate asynchronous extension calls. The QuickJS wrapper exposes ergonomic APIs ($state, $emit, $view, $ext, $log, $time) that serialize values and integrate seamlessly with the host function ecosystem. Proper capability configuration and error handling ensure predictable and safe interactions.