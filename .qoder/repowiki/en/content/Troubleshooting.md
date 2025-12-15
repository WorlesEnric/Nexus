# Troubleshooting

<cite>
**Referenced Files in This Document**   
- [01_reactor_spec_VERIFICATION.md](file://docs/01_reactor_spec_VERIFICATION.md)
- [errors.ts](file://packages/nexus-reactor/src/core/errors.ts)
- [debug.ts](file://packages/nexus-reactor/src/utils/debug.ts)
- [logger.ts](file://runtime/workspace-kernel/src/logger.ts)
- [executor.ts](file://packages/nexus-reactor/src/sandbox/executor.ts)
- [parser.ts](file://packages/nexus-reactor/src/parser/parser.ts)
- [reactor.ts](file://packages/nexus-reactor/src/reactor.ts)
- [hydrator.tsx](file://packages/nexus-reactor/src/view/hydrator.tsx)
- [bridge.ts](file://packages/nexus-reactor/src/mcp/bridge.ts)
- [lib.rs](file://runtime/nexus-wasm-bridge/src/lib.rs)
- [engine/mod.rs](file://runtime/nexus-wasm-bridge/src/engine/mod.rs)
- [Cargo.toml](file://runtime/nexus-wasm-bridge/Cargo.toml)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Startup Failures](#startup-failures)
3. [Parsing Errors](#parsing-errors)
4. [Execution Crashes](#execution-crashes)
5. [Performance Issues](#performance-issues)
6. [Configuration Mistakes](#configuration-mistakes)
7. [Log Interpretation](#log-interpretation)
8. [Network Troubleshooting](#network-troubleshooting)
9. [Version Compatibility](#version-compatibility)
10. [Implementation Verification Metrics](#implementation-verification-metrics)

## Introduction

This troubleshooting guide provides comprehensive solutions for diagnosing and resolving common issues in the Nexus platform. The document is organized by problem categories including startup failures, parsing errors, execution crashes, and performance issues. It includes diagnostic tools, configuration fixes, log interpretation guidance, and network troubleshooting procedures. The implementation verification metrics from 01_reactor_spec_VERIFICATION.md show complete code coverage across all modules, confirming the system's robustness.

**Section sources**
- [01_reactor_spec_VERIFICATION.md](file://docs/01_reactor_spec_VERIFICATION.md#L1-L1069)

## Startup Failures

### Missing Required Configuration
**Error Message**: `Error: Reactor configuration missing required source property`

**Root Cause Analysis**: The NexusReactor requires a source property in the configuration object that contains the NXML panel definition. This error occurs when the source property is missing or undefined during initialization.

**Step-by-Step Resolution**:
1. Verify the configuration object passed to NexusReactor constructor
2. Ensure the `source` property contains valid NXML markup
3. Check for asynchronous loading issues that might delay source availability
4. Implement configuration validation before reactor instantiation

**Section sources**
- [reactor.ts](file://packages/nexus-reactor/src/reactor.ts#L42-L96)

### WASM Bridge Initialization Failure
**Error Message**: `Failed to load WasmEdge runtime: Module not found`

**Root Cause Analysis**: The nexus-wasm-bridge native module failed to load, typically due to compilation issues, missing dependencies, or incompatible Node.js versions. The bridge is essential for secure JavaScript execution in the WasmEdge environment.

**Step-by-Step Resolution**:
1. Verify Node.js version compatibility (v18+ required)
2. Check that Rust toolchain is installed (rustc, cargo)
3. Rebuild native modules: `npm rebuild`
4. Validate WasmEdge installation: `wasmedge --version`
5. Ensure proper N-API bindings are compiled for your Node.js version

**Section sources**
- [lib.rs](file://runtime/nexus-wasm-bridge/src/lib.rs#L1-L71)
- [Cargo.toml](file://runtime/nexus-wasm-bridge/Cargo.toml#L1-L63)

## Parsing Errors

### Invalid NXML Structure
**Error Message**: `ParseError: Root element must be <NexusPanel>, got <${tagName}>`

**Root Cause Analysis**: The parser expects the root element to be `<NexusPanel>` as defined in the specification. This error indicates either a malformed NXML document or incorrect document type.

**Step-by-Step Resolution**:
1. Verify the root element is `<NexusPanel>` with proper opening and closing tags
2. Check for XML syntax errors such as unclosed tags or incorrect nesting
3. Validate against the NXML schema specification
4. Use the parser's built-in validation tools to identify specific issues

**Section sources**
- [parser.ts](file://packages/nexus-reactor/src/parser/parser.ts#L41-L438)

### Duplicate State Definitions
**Error Message**: `ValidationError: Duplicate state/computed name: "${name}"`

**Root Cause Analysis**: The validation system detects multiple state or computed value definitions with the same name within the same scope. This creates ambiguity in the reactive state system.

**Step-by-Step Resolution**:
1. Search for all instances of the named state in the NXML document
2. Rename duplicate states to ensure uniqueness
3. Verify state names follow naming conventions (alphanumeric, underscores)
4. Check for case sensitivity issues in state references

**Section sources**
- [errors.ts](file://packages/nexus-reactor/src/core/errors.ts#L122-L127)

### Invalid Identifier Names
**Error Message**: `ValidationError: Invalid identifier: "${name}"`

**Root Cause Analysis**: State, tool, or view identifiers contain characters that violate naming rules. Valid identifiers must start with a letter and contain only alphanumeric characters and underscores.

**Step-by-Step Resolution**:
1. Identify the invalid identifier from the error message
2. Rename to follow valid naming conventions (e.g., change "my-state" to "my_state")
3. Update all references to the renamed identifier
4. Validate identifier names against the specification

**Section sources**
- [errors.ts](file://packages/nexus-reactor/src/core/errors.ts#L162-L168)

## Execution Crashes

### Handler Execution Timeout
**Error Message**: `SandboxError: Handler execution timed out after ${timeoutMs}ms`

**Root Cause Analysis**: The handler code exceeded the maximum execution time (default 500ms). This typically indicates infinite loops, synchronous blocking operations, or computationally intensive tasks.

**Step-by-Step Resolution**:
1. Review handler code for infinite loops or recursive calls
2. Break down complex operations into smaller, asynchronous tasks
3. Use `console.log` statements to identify slow code sections
4. Consider increasing timeout threshold if operation legitimately requires more time
5. Move heavy computations to web workers or backend services

**Section sources**
- [executor.ts](file://packages/nexus-reactor/src/sandbox/executor.ts#L24-L34)
- [errors.ts](file://packages/nexus-reactor/src/core/errors.ts#L221-L226)

### Forbidden Global Access
**Error Message**: `ValidationError: Handler code contains forbidden global: "${name}"`

**Root Cause Analysis**: The sandbox security model blocks access to browser and Node.js globals such as `window`, `document`, `fetch`, and `eval`. This prevents security vulnerabilities and ensures isolation.

**Step-by-Step Resolution**:
1. Identify the forbidden global from the error message
2. Replace browser/Node.js APIs with Nexus-provided alternatives:
   - Use `$http` service instead of `fetch`
   - Use `$state` instead of direct DOM manipulation
   - Use `$log` for logging instead of `console`
3. Validate all external API calls through the allowed context globals
4. Test in debug mode to catch issues early

**Section sources**
- [executor.ts](file://packages/nexus-reactor/src/sandbox/executor.ts#L69-L113)
- [errors.ts](file://packages/nexus-reactor/src/core/errors.ts#L170-L176)

### Maximum Recursion Depth Exceeded
**Error Message**: `SandboxError: Maximum recursion depth (${depth}) exceeded - possible infinite loop`

**Root Cause Analysis**: The reactive system detected excessive recursion, typically caused by computed values or watchers that trigger their own updates.

**Step-by-Step Resolution**:
1. Identify circular dependencies in computed values
2. Add guards to prevent recursive updates:
   ```typescript
   if (newValue !== oldValue) {
     // update state
   }
   ```
3. Restructure logic to avoid self-triggering updates
4. Use debounce or throttle for high-frequency updates
5. Break complex computed chains into smaller, independent computations

**Section sources**
- [errors.ts](file://packages/nexus-reactor/src/core/errors.ts#L228-L233)

## Performance Issues

### High CPU Usage During Rendering
**Symptoms**: Slow rendering, UI freezes, high CPU utilization

**Root Cause Analysis**: Excessive re-renders due to inefficient state updates, missing memoization, or complex computed values recalculating frequently.

**Step-by-Step Resolution**:
1. Enable debug mode to trace re-renders:
   ```typescript
   import { setDebugMode } from '@nexus/reactor';
   setDebugMode(true);
   ```
2. Identify components with frequent updates using the debug logs
3. Optimize by:
   - Memoizing expensive computations
   - Batching state updates
   - Using virtualization for large lists
   - Debouncing rapid state changes
4. Simplify complex view hierarchies
5. Use the Reactor's built-in performance monitoring

**Section sources**
- [debug.ts](file://packages/nexus-reactor/src/utils/debug.ts#L83-L94)
- [hydrator.tsx](file://packages/nexus-reactor/src/view/hydrator.tsx#L129-L152)

### Memory Leaks in WASM Instances
**Symptoms**: Gradual memory consumption increase, eventual out-of-memory errors

**Root Cause Analysis**: WASM instances not being properly released back to the pool, or large data being retained in instance memory.

**Step-by-Step Resolution**:
1. Monitor instance pool statistics:
   ```typescript
   const stats = wasmRuntime.getStats();
   console.log('Active instances:', stats.active_instances);
   ```
2. Ensure all async operations complete properly
3. Implement proper cleanup in lifecycle hooks
4. Limit data passed to handlers
5. Configure appropriate instance pool size and memory limits

**Section sources**
- [engine/mod.rs](file://runtime/nexus-wasm-bridge/src/engine/mod.rs#L71-L82)
- [pool.rs](file://runtime/nexus-wasm-bridge/src/engine/pool.rs)

## Configuration Mistakes

### Incorrect Debug Mode Setup
**Issue**: Debug logs not appearing or appearing in production

**Root Cause Analysis**: The debug mode must be explicitly enabled, and production environments typically suppress debug output.

**Fix**:
1. Enable debug mode before reactor initialization:
   ```typescript
   import { setDebugMode } from '@nexus/reactor';
   setDebugMode(true);
   ```
2. Verify environment-specific logging configuration
3. Check that debug statements are not stripped in production builds

**Section sources**
- [debug.ts](file://packages/nexus-reactor/src/utils/debug.ts#L12-L14)

### Missing Lifecycle Handlers
**Issue**: Mount/unmount logic not executing

**Root Cause Analysis**: Lifecycle handlers must be properly defined in the NXML specification with correct syntax.

**Fix**:
1. Verify lifecycle syntax:
   ```xml
   <Lifecycle on="mount">
     <Handler>
       console.log("Panel mounted");
     </Handler>
   </Lifecycle>
   ```
2. Ensure only one mount and unmount lifecycle per panel
3. Check for syntax errors in handler code
4. Validate that the reactor's mount() method is called

**Section sources**
- [reactor.ts](file://packages/nexus-reactor/src/reactor.ts#L101-L119)

## Log Interpretation

### Pino Logger Configuration
The workspace kernel uses Pino for logging with configurable levels and formatting.

**Configuration Options**:
- `LOG_LEVEL`: Set to 'debug', 'info', 'warn', or 'error'
- `NODE_ENV`: Controls pretty printing (enabled when not 'production')

```typescript
import { configureLogger, getLogger } from './logger';
configureLogger({ level: 'debug', pretty: true });
const logger = getLogger();
```

**Log Structure**:
- All logs include timestamp in ISO format
- Production logs are JSON-formatted
- Development logs include colorized output
- Error logs include stack traces

**Section sources**
- [logger.ts](file://runtime/workspace-kernel/src/logger.ts#L1-L90)

### Reactor Pipeline Tracing
Enable debug mode to trace execution through the Reactor pipeline:

```typescript
// Enable debug mode
setDebugMode(true);

// Debug output includes:
// [nexus:reactor] Initializing NexusReactor
// [nexus:parser] Parsing NXML source  
// [nexus:validator] Validating AST
// [nexus:sandbox] Executing handler: console.log('hello')
```

Key debug namespaces:
- `reactor`: Core reactor operations
- `parser`: NXML parsing and validation
- `sandbox`: Handler execution
- `state`: State store operations
- `view`: View hydration and rendering
- `mcp`: AI integration and tool execution

**Section sources**
- [debug.ts](file://packages/nexus-reactor/src/utils/debug.ts#L26-L78)
- [reactor.ts](file://packages/nexus-reactor/src/reactor.ts#L27)

## Network Troubleshooting

### WebSocket Connectivity Issues
**Symptoms**: Disconnected AI agents, failed tool execution, stale state

**Diagnosis**:
1. Check WebSocket connection status
2. Verify server endpoint URL
3. Inspect browser console for WebSocket errors
4. Test network connectivity to the server

**Resolution**:
1. Ensure WebSocket server is running
2. Verify CORS configuration allows the origin
3. Check firewall settings allow WebSocket traffic
4. Implement reconnection logic with exponential backoff
5. Monitor connection state and provide user feedback

### WASM Bridge Network Initialization
**Issue**: WASM module fails to load over network

**Root Cause Analysis**: The WasmEdge runtime module cannot be loaded due to network restrictions, CDN issues, or incorrect paths.

**Resolution**:
1. Verify the WasmEdge CDN is accessible
2. Check for mixed content issues (HTTP/HTTPS)
3. Implement local fallback for the WASM module
4. Preload critical modules during application startup
5. Monitor download progress and handle failures gracefully

**Section sources**
- [lib.rs](file://runtime/nexus-wasm-bridge/src/lib.rs#L1-L71)
- [napi.rs](file://runtime/nexus-wasm-bridge/src/napi.rs)

## Version Compatibility

### Node.js and Rust Compatibility
**Issue**: Native module compilation failures

**Compatibility Matrix**:
- Node.js: v18.x, v20.x (LTS versions)
- Rust: v1.70+
- WasmEdge: v0.13.0

**Resolution**:
1. Use Node.js LTS versions
2. Ensure Rust toolchain is up to date
3. Verify N-API compatibility between Node.js and native modules
4. Use pre-built binaries when available
5. Test in consistent development environments

**Section sources**
- [Cargo.toml](file://runtime/nexus-wasm-bridge/Cargo.toml#L15-L16)
- [lib.rs](file://runtime/nexus-wasm-bridge/src/lib.rs)

### WasmEdge Component Compatibility
**Issue**: Runtime errors due to version mismatches

**Root Cause Analysis**: The nexus-wasm-bridge has specific version requirements for WasmEdge and its dependencies.

**Resolution**:
1. Verify WasmEdge version compatibility
2. Check for breaking changes in WasmEdge updates
3. Update nexus-wasm-bridge to match WasmEdge version
4. Test WASM execution with simple handlers first
5. Monitor for deprecation warnings

**Section sources**
- [Cargo.toml](file://runtime/nexus-wasm-bridge/Cargo.toml#L19)
- [engine/mod.rs](file://runtime/nexus-wasm-bridge/src/engine/mod.rs)

## Implementation Verification Metrics

The implementation verification document confirms complete compliance across all modules:

| Category | Implementation Status | Compliance |
|--------|----------------------|------------|
| **Architecture** | Unidirectional data flow + side-channel | ✅ Implemented |
| **Parser** | Lexer + AST + Validator | ✅ Implemented |
| **State System** | Proxy-based reactivity | ✅ Implemented |
| **Sandbox** | Isolated execution with forbidden globals | ✅ Implemented |
| **Layout Engine** | 12-column Tetris algorithm | ✅ Implemented |
| **View Hydration** | AST → React with priority cascade | ✅ Implemented |
| **Imperative Bridge** | ViewRegistry + transient props | ✅ Implemented |
| **MCP Integration** | Tool discovery + state inspection | ✅ Implemented |
| **Error Handling** | Fail-safe strategy | ✅ Implemented |
| **Test Harness** | Working examples | ✅ Implemented |

**Overall Compliance: 99.5%** ✅

The verification confirms that all core components are fully implemented according to specification, with several areas exceeding requirements through enhanced security, additional API methods, and improved developer experience features.

**Section sources**
- [01_reactor_spec_VERIFICATION.md](file://docs/01_reactor_spec_VERIFICATION.md#L1-L1069)