# Nexus Platform Architecture

**Document Version:** 1.0
**Last Updated:** December 2024
**Status:** Implementation Complete

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Vision and Objectives](#project-vision-and-objectives)
3. [System Architecture Overview](#system-architecture-overview)
4. [Core Components](#core-components)
5. [Data Flow and Interaction Model](#data-flow-and-interaction-model)
6. [Technology Stack](#technology-stack)
7. [Deployment Architecture](#deployment-architecture)
8. [Security Architecture](#security-architecture)
9. [Observability and Monitoring](#observability-and-monitoring)
10. [Scalability and Performance](#scalability-and-performance)
11. [Key Architectural Decisions](#key-architectural-decisions)

---

## Executive Summary

Nexus is an AI-assisted rapid prototyping platform that enables users to express and iterate on creative ideas through a panel-based interface. The platform combines declarative UI definitions (NXML), secure sandboxed execution (WasmEdge), semantic state management (NOG), and AI-driven context building to create a unified creative workspace.

**Key Characteristics:**
- **Panel-Centric Architecture**: All functionality delivered through composable, self-contained panels
- **Isomorphic Execution**: Same code runs in browser and server for seamless reactivity
- **Semantic State Layer**: NOG (Nexus Object Graph) provides truth representation beyond raw data
- **Security-First**: WasmEdge-based sandboxing ensures isolated, capability-controlled execution
- **Model-Driven Observability**: TriLog system creates digital twins from telemetry for time-travel debugging

---

## Project Vision and Objectives

### Vision
To democratize creative expression by eliminating the tool complexity barrier that prevents ideas from being rapidly prototyped and shared.

### Core Problem Statement
Traditional creative tools (Figma, React Native, Unity) are designed for building complete products, not exploring ideas. The learning curve is prohibitively high, and AI-assisted full-stack code generation platforms (Cursor, Claude Code) operate at the implementation layer rather than the idea layer, leading to:

- **Brittle iteration cycles**: Ideas expressed once, then refined through code patches
- **Lost creative coherence**: Engineering constraints dominate creative vision
- **High cognitive load**: Users must understand implementation details to validate ideas
- **Context fragmentation**: Different modalities (code, diagrams, docs) exist in isolation

### Solution Approach
Nexus inverts the traditional workflow: **ideas induce engineering artifacts, not the other way around**. The platform achieves this through:

1. **Unified Panel Interface**: All creative artifacts (flowcharts, docs, code, dashboards) expressed through homogeneous panels
2. **Semantic Context Management**: NexusOS maintains coherent AI context across all panels
3. **Declarative Reactivity**: NXML definitions separate intent from implementation
4. **Safe Execution**: WasmEdge containers provide security without sacrificing expressiveness

---

## System Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          User Layer                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              GraphStudio (React Frontend)                    │   │
│  │  - Panel Canvas  - Marketplace  - User Management           │   │
│  └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ HTTP/WebSocket
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                     Orchestration Layer                              │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │            workspace-kernel (TypeScript)                    │    │
│  │  - Panel Lifecycle Manager  - NOG State Engine              │    │
│  │  - Git Version Control      - Authentication/Authorization  │    │
│  │  - Marketplace API          - WebSocket Multiplexer         │    │
│  └────────────────────────────────────────────────────────────┘    │
└──────────────────────┬────────────────────────┬─────────────────────┘
                       │                        │
         ┌─────────────▼──────────┐   ┌────────▼──────────┐
         │   Execution Layer      │   │   AI Layer         │
         │                        │   │                    │
         │ nexus-wasm-bridge      │   │  nexus-os          │
         │      (Rust)            │   │  (TypeScript)      │
         │                        │   │                    │
         │ - WasmEdge Runtime     │   │ - Context Builder  │
         │ - QuickJS Wrapper      │   │ - Patch Generator  │
         │ - Capability Control   │   │ - LLM Router       │
         │ - Instance Pooling     │   │                    │
         └────────────────────────┘   └────────────────────┘
                       │
         ┌─────────────▼──────────────────────────────────┐
         │           Protocol Layer                        │
         │  ┌──────────────────────────────────────────┐  │
         │  │   nexus-protocol (TypeScript)            │  │
         │  │  - Type Definitions  - Validation        │  │
         │  │  - NOG Schemas      - NXML AST           │  │
         │  └──────────────────────────────────────────┘  │
         └─────────────────────────────────────────────────┘
                       │
         ┌─────────────▼──────────────────────────────────┐
         │        Execution Engine                         │
         │  ┌──────────────────────────────────────────┐  │
         │  │     nexus-reactor (TypeScript)           │  │
         │  │  - NXML Parser      - Layout Engine      │  │
         │  │  - State Store      - React Hydration    │  │
         │  │  - MCP Bridge       - Validator          │  │
         │  └──────────────────────────────────────────┘  │
         └─────────────────────────────────────────────────┘
                       │
         ┌─────────────▼──────────────────────────────────┐
         │       Observability Layer                       │
         │  ┌──────────────────────────────────────────┐  │
         │  │         TriLog (Python)                  │  │
         │  │  - Schema Registry  - OTel Collector     │  │
         │  │  - ClickHouse Store - Digital Twin       │  │
         │  │  - Time-Travel Query - Reconstruction    │  │
         │  └──────────────────────────────────────────┘  │
         └─────────────────────────────────────────────────┘
```

### Architecture Principles

1. **Separation of Concerns**: Clear boundaries between protocol, execution, orchestration, and presentation layers
2. **Isomorphic Design**: Core execution logic (nexus-reactor) runs identically in browser and server
3. **Security by Default**: All user-defined handlers execute in sandboxed WasmEdge containers
4. **Semantic First**: NOG provides meaning layer above raw data structures
5. **Observable Systems**: Every interaction captured in TriLog's digital twin model
6. **Polyglot by Purpose**: Each component uses the language best suited to its domain

---

## Core Components

### 1. nexus-protocol (TypeScript)

**Purpose**: Contract layer defining all data structures and validation rules across the platform.

**Responsibilities:**
- NXML AST definitions for panel markup
- NOG (Nexus Object Graph) semantic schemas
- Zod-based runtime type validation
- Panel synchronization protocol definitions
- Shared types between frontend and backend

**Key Design Decisions:**
- TypeScript chosen for type-safety across full stack
- Zod for runtime validation eliminates schema drift
- Must remain language-agnostic in semantics to support future implementations

**Architectural Role:**
- Single source of truth for data contracts
- Enables safe evolution of protocols without breaking changes
- Facilitates strong typing in IDE environments

---

### 2. nexus-reactor (TypeScript)

**Purpose**: Isomorphic NXML execution engine that parses, validates, and renders panel definitions.

**Responsibilities:**
- NXML lexical analysis and parsing
- AST construction and validation
- Automatic layout engine (constraint-based positioning)
- Reactive state management with proxy-based change detection
- MCP (Model Context Protocol) bridge for AI tool integration
- React component hydration for browser rendering
- Server-side execution for initial state computation

**Key Design Decisions:**
- Isomorphic by necessity: must run in browser (React) and server (Node.js)
- TypeScript for shared execution context
- Proxy-based reactivity for fine-grained change tracking
- Layout engine uses constraint solver to optimize UI automatically

**Architectural Role:**
- Execution boundary between declarative NXML and imperative runtime
- Enables seamless hot-reload and state synchronization
- Provides isolation layer for panel-specific logic

---

### 3. workspace-kernel (TypeScript)

**Purpose**: Backend orchestration layer managing panel lifecycles, state synchronization, and system resources.

**Responsibilities:**
- Panel CRUD operations and lifecycle management
- NOG state engine (in-memory semantic graph)
- Git-based workspace version control
- JWT-based authentication and authorization
- WebSocket connection multiplexing
- Marketplace API for panel distribution
- Prisma ORM for relational data persistence
- Container orchestration for panel execution

**Key Design Decisions:**
- Express + WebSocket for bidirectional communication
- Prisma for type-safe database access
- Git as version control for reproducibility
- In-memory NOG for low-latency semantic queries
- JWT tokens with refresh for stateless auth

**Architectural Role:**
- Central coordination point for all panel operations
- Maintains system-wide state coherence
- Enforces security policies and resource quotas
- Bridges user actions to execution layer

**Scalability Considerations:**
- Horizontal scaling via stateless design
- NOG can be partitioned by workspace
- WebSocket connections require sticky sessions or shared state

---

### 4. nexus-wasm-bridge (Rust)

**Purpose**: Security boundary providing sandboxed JavaScript execution for user-defined panel handlers.

**Responsibilities:**
- WasmEdge runtime integration and lifecycle management
- QuickJS wrapper for JavaScript execution inside WASM
- Host function registry (`__nexus_*` API)
- Instance pooling for performance optimization
- Compilation caching for frequently-used handlers
- Capability-based security enforcement
- Async suspend/resume for long-running operations
- MessagePack serialization for context marshaling

**Key Design Decisions:**
- Rust for memory safety and performance
- WasmEdge for standards-compliant WASM runtime
- QuickJS for ECMAScript compliance inside WASM
- N-API bindings for zero-copy integration with Node.js
- Tokio async runtime for non-blocking operations
- Capability tokens control access to host resources

**Architectural Role:**
- Critical security boundary preventing arbitrary code execution
- Performance bottleneck mitigation through instance pooling
- Enables safe execution of untrusted panel definitions
- Provides metrics and profiling for handler execution

**Security Model:**
- No filesystem access by default
- Network access via explicit capability grants
- Host function calls mediated through capability checks
- Memory limits enforced per instance
- CPU time limits via execution budgets

---

### 5. nexus-os (TypeScript)

**Purpose**: AI context management service that translates between semantic state (NOG) and LLM interactions.

**Responsibilities:**
- Context building: NOG → structured LLM prompts
- Patch generation: LLM responses → NOG state updates
- Multi-model routing and fallback strategies
- Token budget management and optimization
- Streaming response handling
- Error recovery and retry logic

**Key Design Decisions:**
- Microservice architecture for independent scaling
- Stateless design for horizontal scalability
- OpenAI-compatible API for LLM integration
- Structured output parsing with JSON Schema validation

**Architectural Role:**
- Translation layer between semantic graph and natural language
- Enables AI-driven panel editing without direct code manipulation
- Provides unified AI experience across all panel types
- Abstracts model-specific implementation details

**Integration Points:**
- Reads NOG state from workspace-kernel
- Generates patches validated by nexus-protocol
- Consumed by GraphStudio's AI assistant panels
- Logs all interactions to TriLog for audit trail

---

### 6. TriLog (Python)

**Purpose**: Model-driven observability system creating digital twins from telemetry for time-travel debugging and analytics.

**Responsibilities:**
- Domain-specific language (DSL) for system entity modeling
- OpenTelemetry integration for distributed tracing
- ClickHouse storage for high-performance time-series queries
- Context propagation via W3C trace context
- Digital twin reconstruction from event streams
- Time-travel query engine
- Schema registry for validation
- Anomaly detection and alerting

**Key Design Decisions:**
- Python for rich data science ecosystem
- OpenTelemetry for vendor-neutral telemetry
- ClickHouse for columnar storage and analytical queries
- Schema-first approach enforces observability contracts
- Anchor-based context propagation for object-centric traces

**Architectural Role:**
- Non-invasive observability layer
- Enables production debugging without reproduction
- Provides audit trail for compliance
- Powers analytics dashboards and ML models

**Data Model:**
- **Objects**: Long-lived entities (User, Panel, Workspace)
- **Processes**: Multi-step workflows (Authentication, Panel Execution)
- **Events**: State changes and actions
- **Anchors**: Context propagation across distributed calls

---

## Data Flow and Interaction Model

### Panel Creation Flow

```
1. User Action (GraphStudio)
   │
   ├─→ HTTP POST /panels
   │   └─→ workspace-kernel receives request
   │       ├─→ Validate user permissions
   │       ├─→ Parse NXML definition (nexus-reactor)
   │       ├─→ Create NOG node in semantic graph
   │       ├─→ Allocate WasmEdge instance (nexus-wasm-bridge)
   │       ├─→ Store panel metadata (Prisma/PostgreSQL)
   │       ├─→ Commit to Git repository
   │       └─→ Emit TriLog events (panel_created, nog_updated)
   │
   └─→ WebSocket /panels/stream
       └─→ workspace-kernel broadcasts panel state
           └─→ GraphStudio updates UI reactively
```

### Panel Execution Flow

```
1. User Interaction (GraphStudio)
   │
   ├─→ WebSocket event: handler_trigger
   │   └─→ workspace-kernel receives trigger
   │       ├─→ Load handler code from panel definition
   │       ├─→ Serialize execution context (MessagePack)
   │       ├─→ nexus-wasm-bridge.execute()
   │       │   ├─→ Acquire WasmEdge instance from pool
   │       │   ├─→ Load compiled handler or compile fresh
   │       │   ├─→ Inject context via __nexus_context()
   │       │   ├─→ Execute handler in QuickJS
   │       │   ├─→ Collect host function calls
   │       │   ├─→ Serialize return value
   │       │   └─→ Return instance to pool
   │       │
   │       ├─→ Apply state changes to NOG
   │       ├─→ Validate NOG consistency (nexus-protocol)
   │       ├─→ Persist changes to database
   │       ├─→ Emit TriLog events (handler_executed, state_changed)
   │       └─→ Broadcast updated state via WebSocket
   │
   └─→ GraphStudio receives state update
       └─→ nexus-reactor applies diff to local state
           └─→ React re-renders affected components
```

### AI-Assisted Editing Flow

```
1. User Query (AI Assistant Panel)
   │
   ├─→ POST /ai/complete (nexus-os)
   │   ├─→ Extract relevant NOG subgraph (workspace-kernel)
   │   ├─→ Build structured context (NOG → prompt)
   │   ├─→ Select appropriate LLM (model router)
   │   ├─→ Stream response with structured output
   │   └─→ Parse response into NOG patches
   │
   ├─→ POST /patch/apply (workspace-kernel)
   │   ├─→ Validate patch against nexus-protocol schemas
   │   ├─→ Apply patch to NOG with conflict resolution
   │   ├─→ Trigger affected panel re-renders
   │   ├─→ Emit TriLog events (ai_edit, patch_applied)
   │   └─→ Broadcast changes via WebSocket
   │
   └─→ GraphStudio reflects updated panels
       └─→ User reviews and continues iteration
```

### Version Control Flow

```
1. User Commits Changes (GraphStudio)
   │
   └─→ POST /workspace/commit
       └─→ workspace-kernel commits to Git
           ├─→ Serialize NOG graph to JSON
           ├─→ Export panel definitions to .nxml files
           ├─→ Generate commit message from change summary
           ├─→ Git commit + push to remote
           ├─→ Update workspace metadata (commit hash, timestamp)
           └─→ Emit TriLog events (workspace_committed)

2. User Reverts to Previous State
   │
   └─→ POST /workspace/checkout
       └─→ workspace-kernel checks out commit
           ├─→ Git checkout <commit-hash>
           ├─→ Deserialize NOG graph from JSON
           ├─→ Reload panel definitions
           ├─→ Reset WasmEdge instances
           ├─→ Broadcast full state reset via WebSocket
           └─→ Emit TriLog events (workspace_reverted)
```

---

## Technology Stack

### Frontend Layer
- **Framework**: React 18 with TypeScript
- **State Management**: Zustand + nexus-reactor's proxy store
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **WebSocket Client**: native WebSocket API
- **HTTP Client**: Fetch API

### Backend Layer
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **WebSocket**: ws library
- **ORM**: Prisma (PostgreSQL)
- **Authentication**: JWT (jsonwebtoken)
- **Version Control**: simple-git
- **Validation**: Zod (shared with nexus-protocol)

### Execution Layer
- **WASM Runtime**: WasmEdge 0.13+
- **JavaScript Engine**: QuickJS (embedded in WASM)
- **N-API Bindings**: napi-rs
- **Async Runtime**: Tokio
- **Serialization**: MessagePack (rmp-serde)
- **Concurrent Structures**: dashmap

### AI Services
- **Framework**: Express.js (TypeScript)
- **LLM Integration**: OpenAI SDK
- **Structured Outputs**: JSON Schema validation
- **Token Management**: tiktoken

### Observability
- **Telemetry**: OpenTelemetry (Python SDK)
- **Storage**: ClickHouse 23+
- **Collector**: OpenTelemetry Collector 0.91+
- **Validation**: Pydantic 2.0+
- **Data Processing**: structlog

### Infrastructure
- **Containerization**: Docker + kind (Kubernetes in Docker)
- **Orchestration**: Kubernetes 1.28+
- **Registry**: Local Docker registry (port 5001)
- **Database**: PostgreSQL 15 (dev: SQLite)
- **Reverse Proxy**: Kubernetes Ingress

---

## Deployment Architecture

### Development Environment

```
┌─────────────────────────────────────────────────────────────┐
│                    Developer Machine                         │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  GraphStudio     │  │  workspace-kernel│                │
│  │  (npm run dev)   │  │  (npm run dev)   │                │
│  │  localhost:5173  │  │  localhost:3000  │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  nexus-os        │  │  SQLite (dev.db) │                │
│  │  localhost:4000  │  │                  │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                              │
│  nexus-wasm-bridge loaded as native module                  │
└─────────────────────────────────────────────────────────────┘
```

### Kubernetes Production Environment

```
┌─────────────────────────────────────────────────────────────┐
│                    kind Cluster (nexus)                      │
│                                                              │
│  ┌─────────────────── Namespace: nexus ───────────────────┐ │
│  │                                                          │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │ graphstudio  │  │   backend    │  │   nexus-os   │ │ │
│  │  │  (frontend)  │  │(workspace-   │  │  (AI service)│ │ │
│  │  │              │  │  kernel)     │  │              │ │ │
│  │  │ ClusterIP    │  │ ClusterIP    │  │ ClusterIP    │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │ │
│  │                                                          │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │             PostgreSQL StatefulSet               │  │ │
│  │  │          (Persistent Volume Claim)               │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────── Namespace: trilog-system ────────────────┐ │
│  │                                                          │ │
│  │  ┌──────────────┐  ┌──────────────────────────────┐   │ │
│  │  │OTel Collector│  │  ClickHouse StatefulSet      │   │ │
│  │  │ (2 replicas) │  │  (Persistent Volume)         │   │ │
│  │  │ HPA enabled  │  │                              │   │ │
│  │  └──────────────┘  └──────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────── Namespace: registry ─────────────────┐    │
│  │  ┌──────────────────────────────────────────────┐   │    │
│  │  │  Docker Registry (localhost:5001)            │   │    │
│  │  │  (Image storage for local development)       │   │    │
│  │  └──────────────────────────────────────────────┘   │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Container Images

```
nexus/workspace-kernel:latest
  ├─ Node.js 18 Alpine
  ├─ nexus-protocol (bundled)
  ├─ nexus-reactor (bundled)
  ├─ nexus-wasm-bridge.node (native addon)
  └─ Prisma binaries

nexus/graphstudio:latest
  ├─ nginx:alpine
  └─ Static React build (with nexus-reactor)

nexus/graphstudio-backend:latest
  ├─ Python 3.11 slim
  ├─ FastAPI application
  └─ TriLog SDK

nexus/nexus-os:latest
  ├─ Node.js 18 Alpine
  ├─ nexus-protocol (bundled)
  └─ OpenAI SDK

trilog/otel-collector:latest
  ├─ OpenTelemetry Collector Contrib
  └─ Custom configuration

trilog/clickhouse:latest
  ├─ ClickHouse 23.12
  └─ Schema initialization scripts
```

### Resource Allocation

| Service | CPU Request | CPU Limit | Memory Request | Memory Limit |
|---------|-------------|-----------|----------------|--------------|
| workspace-kernel | 500m | 2000m | 512Mi | 2Gi |
| graphstudio | 100m | 500m | 128Mi | 512Mi |
| graphstudio-backend | 200m | 500m | 256Mi | 512Mi |
| nexus-os | 500m | 2000m | 512Mi | 2Gi |
| otel-collector | 200m | 1000m | 256Mi | 1Gi |
| clickhouse | 1000m | 4000m | 2Gi | 8Gi |
| postgresql | 500m | 2000m | 1Gi | 4Gi |

---

## Security Architecture

### Defense in Depth Strategy

#### Layer 1: Network Security
- Kubernetes NetworkPolicies restrict pod-to-pod communication
- Services exposed only within cluster by default
- External access via Ingress with TLS termination
- Rate limiting at Ingress level

#### Layer 2: Authentication & Authorization
- JWT-based authentication with short-lived access tokens (15 min)
- Refresh tokens stored in httpOnly cookies
- RBAC model: User → Workspace → Panel permissions
- API endpoints protected by middleware guards
- WebSocket connections authenticated via JWT in handshake

#### Layer 3: Input Validation
- All requests validated against Zod schemas (nexus-protocol)
- NXML parsing includes injection attack detection
- File upload size and type restrictions
- SQL injection prevented via Prisma parameterized queries

#### Layer 4: Sandboxed Execution (Critical)
- **WasmEdge Isolation**: Each panel handler runs in separate WASM instance
- **Capability-Based Security**: Handlers require explicit capability tokens for:
  - Network access (HTTP/WebSocket)
  - File system access (read/write)
  - Database queries
  - Inter-panel communication
- **Resource Limits**:
  - Memory: 128MB per instance
  - CPU time: 5-second execution budget
  - Stack depth: Limited recursion
- **Host Function Mediation**: All `__nexus_*` calls checked against capabilities

#### Layer 5: Data Protection
- Sensitive data encrypted at rest (PostgreSQL/ClickHouse)
- TLS 1.3 for all network communication
- Secrets management via Kubernetes Secrets
- PII data excluded from TriLog events
- Git repository access limited via SSH keys

#### Layer 6: Container Security
- Non-root user in all containers
- Read-only root filesystem where possible
- Minimal base images (Alpine Linux)
- Image scanning in CI/CD pipeline
- Security context constraints in Kubernetes

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| **Malicious Panel Code** | WasmEdge sandboxing + capability system |
| **SQL Injection** | Prisma ORM with parameterized queries |
| **XSS Attacks** | React automatic escaping + CSP headers |
| **CSRF** | JWT in Authorization header (not cookies) |
| **Privilege Escalation** | RBAC enforcement at workspace-kernel |
| **DDoS** | Rate limiting + HPA for scaling |
| **Data Exfiltration** | Network policies + capability restrictions |
| **Supply Chain** | Dependency scanning + lock files |

---

## Observability and Monitoring

### TriLog Digital Twin Architecture

#### Semantic Modeling
TriLog uses a schema-first approach where system entities and workflows are modeled explicitly:

**Objects (Long-Lived Entities):**
- **User**: Authentication state, subscription tier, resource usage
- **Workspace**: Panel collection, Git state, NOG graph metadata
- **Panel**: Lifecycle, execution metrics, dependency graph
- **WebSocketConnection**: Session management, message flow

**Processes (Multi-Step Workflows):**
- **UserAuthentication**: login_attempt → credential_validation → token_generation → success/failure
- **PanelExecution**: handler_triggered → context_loaded → execution_started → execution_completed
- **NOGUpdate**: change_proposed → validation → conflict_resolution → commit
- **SubscriptionChange**: upgrade_requested → payment_processed → quota_updated

#### Context Propagation
- **Anchors**: Every log entry anchored to relevant object (User, Panel, etc.)
- **W3C Trace Context**: Distributed traces propagate across service boundaries
- **Baggage**: Metadata (user_id, workspace_id) flows through entire request chain
- **Span Nesting**: Parent-child relationships capture call hierarchies

#### Time-Travel Debugging
TriLog enables reconstructing system state at any point in time:

1. **Digital Twin Query**: "What was Panel X's state at 2024-12-15 14:30?"
2. **Event Replay**: Reconstruct NOG graph by replaying state_change events
3. **Causality Analysis**: "Which user action triggered this error?"
4. **Diff Visualization**: Show state evolution over time range

#### Observability Dashboards

**Real-Time Metrics:**
- Panel execution latency (P50, P95, P99)
- WebSocket connection count
- NOG graph size and query latency
- WasmEdge instance pool utilization
- LLM token consumption rate
- Git operation frequency

**Business Metrics:**
- Active users per tier (free/pro/enterprise)
- Panel creation rate
- AI assistant usage
- Marketplace downloads

**System Health:**
- Pod CPU/memory utilization
- Database connection pool saturation
- ClickHouse query performance
- OTel Collector backlog

---

## Scalability and Performance

### Horizontal Scaling Strategy

#### Stateless Services (Easy to Scale)
- **workspace-kernel**: Stateless HTTP/WebSocket server
  - Scaling: HPA based on CPU/memory
  - State: Externalized to PostgreSQL + Git
  - Sessions: Sticky WebSocket connections or Redis shared state
  - Target: 1000 concurrent WebSocket connections per pod

- **nexus-os**: Stateless AI inference service
  - Scaling: HPA based on request queue depth
  - Rate limiting: Per-user token budgets
  - Target: 100 concurrent LLM requests per pod

- **OTel Collector**: Stateless telemetry pipeline
  - Scaling: HPA based on event ingestion rate
  - Target: 10k events/sec per pod

#### Stateful Services (Complex to Scale)
- **PostgreSQL**: Single-writer, read replicas for queries
  - Vertical scaling: Larger instance sizes
  - Horizontal scaling: Sharding by workspace_id (future)

- **ClickHouse**: Distributed tables for high write throughput
  - Sharding: By timestamp + obj_id
  - Replication: 2x for fault tolerance

- **Git Storage**: Shared filesystem (NFS/Ceph) or object storage (S3)

### Performance Optimizations

#### WasmEdge Instance Pooling
- Pre-warmed instances avoid cold start latency
- Pool size: 10-50 instances per workspace-kernel pod
- Compilation caching: 90% cache hit rate target
- Memory footprint: ~10MB per idle instance

#### NOG Query Optimization
- In-memory graph indexed by object ID and type
- Lazy loading: Only load subgraphs on demand
- Snapshot checkpoints: Periodic serialization to disk
- Query complexity limits: Max depth 10, breadth 1000

#### NXML Parsing Cache
- Parsed ASTs cached in memory
- Cache invalidation on panel updates
- Max cache size: 1000 panels per pod
- Eviction: LRU policy

#### Database Connection Pooling
- Prisma connection pool: 10-50 connections per pod
- Prepared statement caching
- Read replica routing for queries
- Transaction batching where possible

### Performance Targets

| Metric | Target | P95 | P99 |
|--------|--------|-----|-----|
| Panel Creation | < 500ms | 800ms | 1.2s |
| Handler Execution | < 100ms | 200ms | 500ms |
| NOG Query | < 50ms | 100ms | 200ms |
| WebSocket Message | < 10ms | 20ms | 50ms |
| Git Commit | < 2s | 3s | 5s |
| AI Completion (streaming) | TTFB < 1s | 1.5s | 2s |

---

## Key Architectural Decisions

### ADR-001: Isomorphic Reactor Execution
**Decision**: nexus-reactor runs identically in browser (React) and server (Node.js).

**Context**: Panels need server-side rendering for initial state and client-side reactivity for interactivity.

**Consequences**:
- ✅ Seamless hot-reload without page refresh
- ✅ State synchronization without manual diffing
- ⚠️ Must use TypeScript (runs in both environments)
- ⚠️ Cannot use browser-specific APIs (DOM) in reactor core

---

### ADR-002: WasmEdge for Sandboxing
**Decision**: Use WasmEdge + QuickJS instead of V8 isolates or Docker containers.

**Context**: Need secure, performant isolation for untrusted user code.

**Alternatives Considered**:
- **V8 Isolates**: Good performance, but less isolation (same process)
- **Docker Containers**: Strong isolation, but high overhead (~1s startup)
- **WebAssembly (WasmEdge)**: Balance of security and performance

**Consequences**:
- ✅ ~10ms startup latency (100x faster than Docker)
- ✅ Strong sandboxing (WASM cannot escape sandbox)
- ✅ Standards-compliant (WASI)
- ⚠️ Requires Rust N-API bridge maintenance
- ⚠️ JavaScript via QuickJS (not V8 - different quirks)

---

### ADR-003: NOG as Semantic Layer
**Decision**: Maintain NOG (Nexus Object Graph) separate from raw data storage.

**Context**: Need truth representation beyond database schemas for AI context.

**Consequences**:
- ✅ AI can reason about relationships (panel dependencies, workspace structure)
- ✅ Version control captures semantic intent, not just data changes
- ⚠️ Dual write problem: Must keep NOG and database in sync
- ⚠️ NOG consistency requires careful transaction management

---

### ADR-004: Git for Version Control
**Decision**: Use Git as workspace storage and version control system.

**Context**: Need reproducibility, branching, and collaboration features.

**Alternatives Considered**:
- **Database snapshots**: Simpler, but no branching or merging
- **Event sourcing**: Full audit trail, but complex to query
- **Git**: Industry-standard version control

**Consequences**:
- ✅ Free branching and merging
- ✅ Familiar workflow for developers
- ✅ Integrates with GitHub/GitLab for backups
- ⚠️ Binary data (NOG snapshots) not ideal for Git
- ⚠️ Merge conflicts require custom resolution logic

---

### ADR-005: Python for TriLog
**Decision**: Implement observability layer in Python, not TypeScript.

**Context**: Need rich data processing and ML capabilities for analytics.

**Consequences**:
- ✅ Best-in-class OpenTelemetry + ClickHouse libraries
- ✅ Data science ecosystem (pandas, numpy, scikit-learn)
- ✅ Easy integration with ML models for anomaly detection
- ⚠️ Separate deployment and language from core platform
- ⚠️ Protocol definitions must be language-agnostic

---

### ADR-006: Kubernetes for Production
**Decision**: Deploy on Kubernetes (kind for local, cloud providers for production).

**Context**: Need scalable, self-healing infrastructure.

**Consequences**:
- ✅ Declarative infrastructure-as-code
- ✅ HPA for automatic scaling
- ✅ Rolling updates with zero downtime
- ✅ Rich ecosystem (monitoring, service mesh, etc.)
- ⚠️ Operational complexity (learning curve)
- ⚠️ Resource overhead (control plane)

---

### ADR-007: Monorepo Structure
**Decision**: Single repository for all Nexus components.

**Context**: High coupling between protocol, reactor, and kernel requires coordinated changes.

**Consequences**:
- ✅ Atomic commits across component boundaries
- ✅ Simplified dependency management
- ✅ Easier refactoring and code search
- ⚠️ Slower CI/CD (must test entire tree)
- ⚠️ Potential for unintended coupling

---

## Conclusion

The Nexus architecture represents a deliberate balance between:

- **Security and Expressiveness**: WasmEdge sandboxing enables safe execution of user code
- **Performance and Flexibility**: Isomorphic reactor provides seamless UX without sacrificing type-safety
- **Complexity and Maintainability**: Clear component boundaries with polyglot-by-purpose strategy
- **Innovation and Stability**: Cutting-edge AI integration built on proven infrastructure (Kubernetes, PostgreSQL)

The platform is designed for **horizontal scaling** at the orchestration layer while keeping the execution layer efficient through instance pooling and caching. The **semantic state layer (NOG)** provides a foundation for AI-driven interactions that go beyond simple CRUD operations, enabling the platform to understand and manipulate creative intent rather than just implementation details.

**TriLog's model-driven observability** ensures that as the platform scales, operators can debug production issues with time-travel queries and reconstruct system state at any point in history, making the platform both **observable and debuggable** at scale.

This architecture is **polyglot by design**: TypeScript for isomorphic execution, Rust for performance-critical paths, and Python for AI/ML and observability. Each language is chosen for its strengths, not dogma, resulting in a pragmatic system that leverages the best tools for each domain.

---

**Document Maintained By**: Nexus Platform Team
**Review Cycle**: Quarterly
**Next Review**: March 2025
