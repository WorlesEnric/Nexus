# Container Security

<cite>
**Referenced Files in This Document**
- [Dockerfile](file://runtime/images/Dockerfile)
- [deployment.yaml](file://runtime/k8s/deployment.yaml)
- [Cargo.toml](file://runtime/nexus-wasm-bridge/Cargo.toml)
- [package.json](file://runtime/workspace-kernel/package.json)
- [server.ts](file://runtime/workspace-kernel/src/server.ts)
- [config.ts](file://runtime/workspace-kernel/src/config.ts)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs)
- [engine/mod.rs](file://runtime/nexus-wasm-bridge/src/engine/mod.rs)
- [compiler.rs](file://runtime/nexus-wasm-bridge/src/engine/compiler.rs)
- [state.rs](file://runtime/nexus-wasm-bridge/src/host_functions/state.rs)
- [events.rs](file://runtime/nexus-wasm-bridge/src/host_functions/events.rs)
- [02_runtime_spec.md](file://docs/02_runtime_spec.md)
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
This document describes the container security model for the Nexus runtime, focusing on:
- A Docker multi-stage build that separates build-time and runtime environments to minimize attack surface
- Non-root user execution with dedicated nexus user and group, and filesystem ownership configuration
- Read-only root filesystem enforcement and its implications for runtime immutability
- Kubernetes security context settings including dropped capabilities and prevention of privilege escalation
- Minimal runtime dependencies installation and cleanup of package lists
- Cache volume implementation using a memory-backed emptyDir with size limits

## Project Structure
The security-relevant parts of the repository are organized around:
- Container build: runtime/images/Dockerfile
- Kubernetes deployment: runtime/k8s/deployment.yaml
- Runtime kernel (Node.js): runtime/workspace-kernel
- WASM bridge (Rust): runtime/nexus-wasm-bridge

```mermaid
graph TB
subgraph "Container Build"
DF["Dockerfile<br/>Multi-stage build"]
end
subgraph "Kubernetes"
K8S["deployment.yaml<br/>SecurityContext, Probes, Volumes"]
end
subgraph "Runtime Kernel (Node.js)"
SRV["server.ts<br/>HTTP/WebSocket server"]
CFG["config.ts<br/>Config + Env mapping"]
end
subgraph "WASM Bridge (Rust)"
CTX["context.rs<br/>Execution context"]
CAP["capability.rs<br/>Capability tokens"]
ENG["engine/mod.rs<br/>Runtime engine"]
CMP["compiler.rs<br/>Bytecode cache"]
end
DF --> K8S
K8S --> SRV
SRV --> ENG
ENG --> CTX
ENG --> CAP
ENG --> CMP
```

**Diagram sources**
- [Dockerfile](file://runtime/images/Dockerfile#L1-L152)
- [deployment.yaml](file://runtime/k8s/deployment.yaml#L1-L299)
- [server.ts](file://runtime/workspace-kernel/src/server.ts#L1-L703)
- [config.ts](file://runtime/workspace-kernel/src/config.ts#L1-L233)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L1-L695)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L224)
- [engine/mod.rs](file://runtime/nexus-wasm-bridge/src/engine/mod.rs#L1-L244)
- [compiler.rs](file://runtime/nexus-wasm-bridge/src/engine/compiler.rs#L254-L296)

**Section sources**
- [Dockerfile](file://runtime/images/Dockerfile#L1-L152)
- [deployment.yaml](file://runtime/k8s/deployment.yaml#L1-L299)

## Core Components
- Docker multi-stage build:
  - Stage 1 builds the native WASM bridge module with Rust toolchain and WasmEdge libraries
  - Stage 2 builds the Node.js workspace kernel with production dependencies
  - Stage 3 produces the minimal runtime image with runtime-only dependencies and WasmEdge libraries
  - Stage 4 is a development image with build tools and Rust installed
- Non-root user and filesystem ownership:
  - Creates a dedicated nexus user and group, sets ownership of application directories, and switches to the non-root user
- Read-only root filesystem:
  - Enforced via Kubernetes securityContext for the container
- Kubernetes security context:
  - runAsNonRoot, runAsUser, runAsGroup, fsGroup configured
  - allowPrivilegeEscalation disabled
  - capabilities dropped ALL
- Runtime dependencies and cleanup:
  - Installs minimal runtime dependencies in the production stage and cleans package lists
- Cache volume:
  - Uses an emptyDir with Memory medium and a size limit mounted at the cache directory

**Section sources**
- [Dockerfile](file://runtime/images/Dockerfile#L54-L103)
- [deployment.yaml](file://runtime/k8s/deployment.yaml#L61-L129)
- [deployment.yaml](file://runtime/k8s/deployment.yaml#L120-L134)

## Architecture Overview
The runtime architecture enforces security at multiple layers:
- Container build isolates build-time toolchains from the runtime image
- Kubernetes enforces non-root execution and capability drops
- Node.js runtime enforces authentication and validates requests
- WASM bridge enforces capability-based access control and resource limits

```mermaid
sequenceDiagram
participant Client as "Client"
participant K8S as "Kubernetes Pod"
participant Pod as "Container Runtime"
participant Node as "Node.js Server (server.ts)"
participant RT as "WASM Runtime (engine/mod.rs)"
participant WASM as "WASM Sandbox"
Client->>K8S : "HTTP/WebSocket request"
K8S->>Pod : "Dispatch to container"
Pod->>Node : "Serve request"
Node->>Node : "Auth middleware (JWT)"
Node->>RT : "Execute handler with capabilities"
RT->>RT : "Compile/execute with timeouts"
RT->>WASM : "Run handler in sandbox"
WASM-->>RT : "Result or suspension"
RT-->>Node : "Result with mutations/events"
Node-->>Client : "Response"
```

**Diagram sources**
- [deployment.yaml](file://runtime/k8s/deployment.yaml#L61-L129)
- [server.ts](file://runtime/workspace-kernel/src/server.ts#L1-L703)
- [engine/mod.rs](file://runtime/nexus-wasm-bridge/src/engine/mod.rs#L55-L120)

## Detailed Component Analysis

### Docker Multi-Stage Build and Attack Surface Reduction
- Build stage (Rust):
  - Installs WasmEdge runtime dependencies and WasmEdge itself
  - Builds the native module with cargo
- Node.js build stage:
  - Copies package manifests and installs production dependencies
  - Compiles TypeScript sources
- Production runtime stage:
  - Installs minimal runtime dependencies (e.g., C++ runtime and certificates)
  - Installs WasmEdge libraries only
  - Copies built artifacts from earlier stages
  - Creates a non-root user and sets ownership
  - Creates a cache directory owned by the non-root user
  - Switches to the non-root user
  - Sets environment variables and exposes ports
  - Adds a health check
- Development stage:
  - Installs build essentials, Rust, and WasmEdge for local development

```mermaid
flowchart TD
Start(["Build Start"]) --> Stage1["Stage 1: Rust Builder<br/>Install WasmEdge deps and build native module"]
Stage1 --> Stage2["Stage 2: Node Builder<br/>Install production deps and build TS"]
Stage2 --> Stage3["Stage 3: Production Runtime<br/>Install runtime deps, copy artifacts,<br/>create non-root user, set ownership,<br/>mount cache dir, switch user"]
Stage3 --> Stage4["Stage 4: Development<br/>Install dev tools and Rust"]
Stage4 --> End(["Build Complete"])
```

**Diagram sources**
- [Dockerfile](file://runtime/images/Dockerfile#L1-L152)

**Section sources**
- [Dockerfile](file://runtime/images/Dockerfile#L1-L152)

### Non-Root User Execution and Filesystem Ownership
- Creates a dedicated nexus user and group
- Ensures ownership of application directories and cache directory
- Switches to the non-root user for the runtime container

```mermaid
flowchart TD
UStart(["User Creation"]) --> GroupAdd["Create group 'nexus'"]
GroupAdd --> UserAdd["Create user 'nexus' with group 'nexus'"]
UserAdd --> ChownApp["Change ownership of /app to nexus:nexus"]
ChownApp --> ChownCache["Create and chown /tmp/nexus-cache to nexus:nexus"]
ChownCache --> SwitchUser["Switch to non-root user 'nexus'"]
SwitchUser --> UEnd(["Runtime runs as non-root"])
```

**Diagram sources**
- [Dockerfile](file://runtime/images/Dockerfile#L76-L83)

**Section sources**
- [Dockerfile](file://runtime/images/Dockerfile#L76-L83)

### Read-Only Root Filesystem Enforcement
- Kubernetes securityContext sets:
  - readOnlyRootFilesystem: true
  - allowPrivilegeEscalation: false
  - capabilities.drop: ALL

```mermaid
flowchart TD
SStart(["Pod Spec"]) --> SecCtx["Container SecurityContext"]
SecCtx --> ROFS["readOnlyRootFilesystem: true"]
SecCtx --> NoEscal["allowPrivilegeEscalation: false"]
SecCtx --> DropCaps["capabilities.drop: ALL"]
ROFS --> SEnd(["Immutability enforced"])
NoEscal --> SEnd
DropCaps --> SEnd
```

**Diagram sources**
- [deployment.yaml](file://runtime/k8s/deployment.yaml#L120-L129)

**Section sources**
- [deployment.yaml](file://runtime/k8s/deployment.yaml#L120-L129)

### Kubernetes Security Context Settings
- Pod-level securityContext:
  - runAsNonRoot: true
  - runAsUser/runAsGroup/fsGroup: configured numeric IDs
- Container-level securityContext:
  - readOnlyRootFilesystem: true
  - allowPrivilegeEscalation: false
  - capabilities.drop: ALL

```mermaid
classDiagram
class PodSecurityContext {
+bool runAsNonRoot
+int runAsUser
+int runAsGroup
+int fsGroup
}
class ContainerSecurityContext {
+bool readOnlyRootFilesystem
+bool allowPrivilegeEscalation
+string[] capabilities_drop_ALL
}
PodSecurityContext --> ContainerSecurityContext : "applied to container"
```

**Diagram sources**
- [deployment.yaml](file://runtime/k8s/deployment.yaml#L61-L129)

**Section sources**
- [deployment.yaml](file://runtime/k8s/deployment.yaml#L61-L129)

### Runtime Dependencies Installation and Cleanup
- Production stage installs minimal runtime dependencies and removes package lists to reduce image size and potential exposure
- Development stage installs additional build tools and Rust for local development

```mermaid
flowchart TD
DStart(["APT Update"]) --> InstallRuntime["Install minimal runtime deps"]
InstallRuntime --> CleanLists["Remove package lists (/var/lib/apt/lists/*)"]
CleanLists --> DEnd(["Runtime deps ready"])
```

**Diagram sources**
- [Dockerfile](file://runtime/images/Dockerfile#L58-L63)

**Section sources**
- [Dockerfile](file://runtime/images/Dockerfile#L58-L63)

### Cache Volume Implementation (Memory-backed emptyDir)
- Mounts a cache directory at /tmp/nexus-cache
- Uses an emptyDir with Memory medium and a size limit
- Node.js runtime reads and writes cache via environment variable

```mermaid
flowchart TD
VolStart(["Volume Definition"]) --> EmptyDir["emptyDir: medium=Memory, sizeLimit=128Mi"]
EmptyDir --> Mount["volumeMount: /tmp/nexus-cache"]
Mount --> Env["Environment: CACHE_DIR=/tmp/nexus-cache"]
Env --> VolEnd(["Cache accessible to runtime"])
```

**Diagram sources**
- [deployment.yaml](file://runtime/k8s/deployment.yaml#L120-L134)
- [config.ts](file://runtime/workspace-kernel/src/config.ts#L19-L25)

**Section sources**
- [deployment.yaml](file://runtime/k8s/deployment.yaml#L120-L134)
- [config.ts](file://runtime/workspace-kernel/src/config.ts#L19-L25)

### Capability-Based Access Control and Secure Defaults
- Capability tokens define precise permissions for state, events, view updates, and extensions
- Host functions enforce capability checks before performing operations
- Runtime configuration enforces timeouts, memory limits, and host call counts
- Secure defaults:
  - No capabilities by default
  - Explicit capability declaration required
  - Principle of least privilege
  - Immutable context in WASM (mutations collected and applied in JS)
  - No dynamic code generation

```mermaid
classDiagram
class CapabilityToken {
<<enum>>
+StateRead
+StateWrite
+EventsEmit
+ViewUpdate
+Extension
}
class CapabilityChecker {
+can_read_state(key)
+can_write_state(key)
+can_emit_event(name)
+can_update_view(id)
+can_access_extension(name)
+check(required)
}
class ExecutionContext {
+capabilities : CapabilityToken[]
+has_capability(required) bool
+increment_host_calls() u32
}
CapabilityChecker --> CapabilityToken : "matches"
ExecutionContext --> CapabilityToken : "granted"
```

**Diagram sources**
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L224)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L496-L588)
- [state.rs](file://runtime/nexus-wasm-bridge/src/host_functions/state.rs#L45-L87)
- [events.rs](file://runtime/nexus-wasm-bridge/src/host_functions/events.rs#L78-L123)
- [02_runtime_spec.md](file://docs/02_runtime_spec.md#L868-L906)

**Section sources**
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L224)
- [context.rs](file://runtime/nexus-wasm-bridge/src/context.rs#L496-L588)
- [state.rs](file://runtime/nexus-wasm-bridge/src/host_functions/state.rs#L45-L87)
- [events.rs](file://runtime/nexus-wasm-bridge/src/host_functions/events.rs#L78-L123)
- [02_runtime_spec.md](file://docs/02_runtime_spec.md#L868-L906)
- [02_runtime_spec.md](file://docs/02_runtime_spec.md#L2014-L2027)

### Runtime Engine and Bytecode Cache
- WasmRuntime manages instance pooling, compilation caching, and handler execution with timeouts
- Compiler maintains an in-memory cache and disk cache eviction policy
- Execution metrics and statistics are tracked

```mermaid
flowchart TD
ExecStart(["Execute Handler"]) --> Compile["Compile handler (cached)"]
Compile --> PoolAcquire["Acquire instance from pool"]
PoolAcquire --> Timeout["Execute with timeout"]
Timeout --> Release["Release instance"]
Release --> Metrics["Record metrics and success/failure"]
Metrics --> ExecEnd(["Return result"])
```

**Diagram sources**
- [engine/mod.rs](file://runtime/nexus-wasm-bridge/src/engine/mod.rs#L55-L120)
- [compiler.rs](file://runtime/nexus-wasm-bridge/src/engine/compiler.rs#L254-L296)

**Section sources**
- [engine/mod.rs](file://runtime/nexus-wasm-bridge/src/engine/mod.rs#L55-L120)
- [compiler.rs](file://runtime/nexus-wasm-bridge/src/engine/compiler.rs#L254-L296)

### Node.js Server Security Controls
- Authentication middleware verifies JWT tokens for protected endpoints
- CORS configuration controlled by environment variables
- Request logging and structured error handling
- WebSocket upgrade path validates panel existence and optional JWT token

```mermaid
sequenceDiagram
participant Client as "Client"
participant Server as "Node Server (server.ts)"
Client->>Server : "HTTP request"
Server->>Server : "Auth middleware (JWT)"
alt "Unauthorized"
Server-->>Client : "401 Unauthorized"
else "Authorized"
Server-->>Client : "Proceed to route"
end
```

**Diagram sources**
- [server.ts](file://runtime/workspace-kernel/src/server.ts#L99-L129)

**Section sources**
- [server.ts](file://runtime/workspace-kernel/src/server.ts#L99-L129)

## Dependency Analysis
- Container build dependencies:
  - Rust builder depends on WasmEdge toolchain and LLVM/Clang
  - Node builder depends on Node.js and npm
  - Production runtime depends on minimal system libraries and WasmEdge libraries
- Kubernetes dependencies:
  - Deployment references ConfigMap and Secret for configuration and secrets
  - SecurityContext applies to the container
  - Volume mounts cache directory

```mermaid
graph LR
DF["Dockerfile"] --> Rust["Rust Builder"]
DF --> Node["Node Builder"]
DF --> Prod["Production Runtime"]
DF --> Dev["Development"]
K8S["deployment.yaml"] --> Sec["SecurityContext"]
K8S --> Vol["Cache Volume (emptyDir)"]
K8S --> Env["EnvFrom/Env"]
K8S --> Probe["Liveness/Readiness Probes"]
```

**Diagram sources**
- [Dockerfile](file://runtime/images/Dockerfile#L1-L152)
- [deployment.yaml](file://runtime/k8s/deployment.yaml#L1-L299)

**Section sources**
- [Dockerfile](file://runtime/images/Dockerfile#L1-L152)
- [deployment.yaml](file://runtime/k8s/deployment.yaml#L1-L299)

## Performance Considerations
- Multi-stage build reduces final image size and attack surface
- Read-only root filesystem prevents accidental writes and improves immutability
- Memory-backed cache volume reduces disk I/O overhead for cache operations
- Instance pooling and bytecode caching in the WASM runtime improve throughput and latency
- Resource limits (CPU/memory) and timeouts prevent resource exhaustion

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Health checks:
  - The container exposes a health endpoint checked by Kubernetes probes
- Authentication failures:
  - Verify JWT secret is set and tokens are valid
- Cache issues:
  - Confirm cache volume is mounted and writable under the non-root user
- Capability denials:
  - Ensure handlers declare required capabilities in NXML; verify capability enforcement logic

**Section sources**
- [Dockerfile](file://runtime/images/Dockerfile#L98-L100)
- [deployment.yaml](file://runtime/k8s/deployment.yaml#L104-L119)
- [server.ts](file://runtime/workspace-kernel/src/server.ts#L99-L129)
- [capability.rs](file://runtime/nexus-wasm-bridge/src/capability.rs#L1-L224)

## Conclusion
The Nexus runtime employs layered security:
- A multi-stage Docker build minimizes the runtime image’s attack surface
- Non-root execution and filesystem ownership ensure least privilege
- Kubernetes securityContext enforces capability drops and prevents privilege escalation
- Minimal runtime dependencies and cleanup reduce risk
- A memory-backed cache volume with size limits supports performance and isolation
- Capability-based access control and secure defaults protect against unauthorized operations
- Node.js server and WASM runtime enforce authentication, timeouts, and resource limits