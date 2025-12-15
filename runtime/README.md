# Nexus Runtime (Phase 2)

**Version**: 1.0.0  
**Status**: Implementation Ready  
**Date**: December 2025

## Overview

The Nexus Runtime provides isolated, secure execution of NXML handler code in WasmEdge containers. This module consists of two main components:

1. **nexus-wasm-bridge**: A Rust library that provides WASM-based JavaScript execution using WasmEdge and QuickJS
2. **workspace-kernel**: A Node.js HTTP/WebSocket server that manages panels and coordinates execution

## Architecture

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

## Project Structure

```
runtime/
├── README.md                           # This file
├── nexus-wasm-bridge/                  # Rust WASM bridge library
│   ├── Cargo.toml                      # Rust project configuration
│   └── src/
│       ├── lib.rs                      # Library entry point
│       ├── config.rs                   # Runtime configuration
│       ├── context.rs                  # Execution context types
│       ├── error.rs                    # Error types and handling
│       ├── capability.rs               # Capability system
│       ├── metrics.rs                  # Execution metrics
│       ├── napi.rs                     # N-API bindings for Node.js
│       ├── quickjs_wrapper.js          # QuickJS bootloader script
│       ├── host_functions/             # WASM host functions
│       │   ├── mod.rs                  # Host functions module
│       │   ├── state.rs                # State access functions
│       │   ├── events.rs               # Event emission functions
│       │   ├── view.rs                 # View manipulation functions
│       │   ├── extension.rs            # Extension call functions
│       │   └── logging.rs              # Logging functions
│       └── engine/                     # WASM engine management
│           ├── mod.rs                  # Engine module
│           ├── instance.rs             # WASM instance management
│           ├── pool.rs                 # Instance pooling
│           └── compiler.rs             # Handler compilation
│
├── workspace-kernel/                   # Node.js workspace kernel
│   ├── package.json                    # NPM project configuration
│   ├── tsconfig.json                   # TypeScript configuration
│   └── src/
│       ├── index.ts                    # Entry point and bootstrap
│       ├── server.ts                   # HTTP/WebSocket server
│       ├── config.ts                   # Kernel configuration
│       ├── types.ts                    # TypeScript type definitions
│       ├── logger.ts                   # Logging utilities
│       ├── panel.ts                    # Panel lifecycle management
│       ├── executor.ts                 # WASM executor integration
│       └── extensions.ts               # Extension system (HTTP, etc.)
│
├── images/                             # Container images
│   └── Dockerfile                      # Multi-stage build
│
└── k8s/                                # Kubernetes manifests
    └── deployment.yaml                 # Deployment, Service, Ingress
```

## Key Features

### Security
- **True WASM Isolation**: Each handler runs in a separate WASM instance
- **Capability-Based Security**: Handlers have no default access; must declare required capabilities
- **Resource Limits**: Timeout, memory, and host call limits enforced at runtime level

### Performance
- **Instance Pooling**: Reuse WASM instances for better performance
- **Compilation Caching**: Cache compiled bytecode to disk
- **AOT Compilation**: Optional ahead-of-time compilation for hot handlers

### Async Support (Solving the "Blind Interval" Problem)
- **Suspend/Resume**: Handlers can suspend for async operations
- **Immediate UI Updates**: State mutations apply immediately when handler suspends
- **Multiple Suspensions**: A handler can suspend multiple times

## API Endpoints (Workspace Kernel)

### HTTP API (Port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/panels` | Create/initialize a panel |
| DELETE | `/panels/{panelId}` | Destroy a panel |
| GET | `/panels/{panelId}/state` | Get panel state |
| GET | `/panels` | List active panels |
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus metrics |

### WebSocket API (Port 3001)

Connect to: `ws://host:3001/panels/{panelId}/ws`

**Client → Server Messages:**
- `TRIGGER`: Execute a tool
- `SUBSCRIBE`: Subscribe to state changes

**Server → Client Messages:**
- `CONNECTED`: Connection established
- `RESULT`: Tool execution result
- `PATCH`: State update
- `EVENT`: Event notification
- `PROGRESS`: Async operation progress

## Getting Started

### Prerequisites
- Rust 1.70+ (for nexus-wasm-bridge)
- Node.js 20+ (for workspace-kernel)
- WasmEdge 0.13+ (optional, for native WASM execution)

### Building the WASM Bridge

```bash
cd runtime/nexus-wasm-bridge
cargo build --release
```

### Running the Workspace Kernel

```bash
cd runtime/workspace-kernel
npm install
npm run build
npm start
```

### Docker Deployment

```bash
cd runtime/images
docker build -t nexus-workspace-kernel .
docker run -p 3000:3000 -p 3001:3001 nexus-workspace-kernel
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKSPACE_ID` | - | Workspace identifier |
| `MAX_PANELS` | `10` | Maximum concurrent panels |
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3000` | HTTP server port |
| `WS_PORT` | `3001` | WebSocket server port |
| `WASM_MEMORY_LIMIT` | `33554432` | WASM memory limit (32MB) |
| `HANDLER_TIMEOUT_MS` | `5000` | Handler execution timeout |

## Dependencies

### nexus-wasm-bridge (Rust)
- `wasmedge-sdk`: WasmEdge runtime
- `napi-rs`: Node.js N-API bindings
- `rmp-serde`: MessagePack serialization
- `tokio`: Async runtime
- `tracing`: Logging and observability

### workspace-kernel (Node.js)
- `express`: HTTP server
- `ws`: WebSocket server
- `@nexus/reactor`: NXML reactor (Phase 1)
- `@nexus/protocol`: Type definitions (Phase 1)
- `jsonwebtoken`: JWT authentication
- `prom-client`: Prometheus metrics

## Related Documentation

- [02_runtime_spec.md](../docs/02_runtime_spec.md) - Full runtime specification
- [01_protocol_spec.md](../docs/01_protocol_spec.md) - NXML protocol specification
- [01_reactor_spec.md](../docs/01_reactor_spec.md) - Reactor specification
