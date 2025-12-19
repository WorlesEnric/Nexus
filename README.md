# Nexus Python - Complete Backend Rebuild

A complete Python-based rebuild of the Nexus backend, featuring a dynamic renderer pattern where Python parses NXML and sends JSON AST to a React frontend.

## Architecture Overview

```
React Frontend (TypeScript)
    ↓ WebSocket + REST
FastAPI Workspace Kernel (Python)
    ↓ uses
Nexus Core (Parser, NOG, Sandbox)
    ↓ uses
Wasmtime Executor (QuickJS WASM)

All modules → TriLog (OpenTelemetry + ClickHouse)
```

## Key Features

- **NXML Parser**: Python-based lexer/parser that converts NXML to JSON AST
- **NOG (Nexus Object Graph)**: Semantic graph using Pydantic + NetworkX
- **Wasmtime Sandbox**: Secure handler execution using Python's wasmtime library
- **FastAPI Backend**: High-performance async API with WebSocket support
- **TriLog Integration**: Model-driven observability from day one
- **AI Orchestration**: LangChain/CrewAI for context building and patch generation

## Project Structure

```
nexus-python/
├── packages/
│   └── nexus-protocol/          # Pydantic AST + NOG type definitions
│       ├── nexus_protocol/
│       │   ├── ast.py           # NXML AST models
│       │   ├── nog.py           # NOG entity/relationship models
│       │   ├── messages.py      # WebSocket protocol
│       │   └── validation.py    # Schema validation
│       └── tests/
│
├── runtime/
│   ├── nexus-core/              # Core parsing, NOG, and execution
│   │   ├── nexus_core/
│   │   │   ├── parser/          # NXML lexer + parser
│   │   │   ├── nog/             # NOG graph engine
│   │   │   ├── state/           # Reactive state management
│   │   │   └── sandbox/         # Wasmtime integration
│   │   └── tests/
│   │
│   ├── workspace-kernel/        # FastAPI service
│   │   ├── workspace_kernel/
│   │   │   ├── api/             # REST endpoints
│   │   │   ├── websocket/       # WebSocket handlers
│   │   │   ├── services/        # Business logic
│   │   │   └── models/          # SQLAlchemy models
│   │   ├── alembic/             # Database migrations
│   │   └── tests/
│   │
│   └── nexus-ai/                # AI orchestration
│       ├── nexus_ai/
│       │   ├── context_builder.py  # NOG → LLM context
│       │   ├── patch_generator.py  # LLM → NOG patches
│       │   └── agents/             # CrewAI/LangChain agents
│       └── tests/
│
├── trilog-schemas/              # TriLog observability schemas
│   ├── objects.py               # Object definitions
│   └── processes.py             # Process definitions
│
├── wasm/                        # WASM binaries
│   └── quickjs.wasm             # Pre-compiled QuickJS
│
├── docker/                      # Docker configurations
│   ├── workspace-kernel.Dockerfile
│   ├── nexus-ai.Dockerfile
│   └── docker-compose.yml
│
├── k8s/                         # Kubernetes manifests
│   └── services/
│
├── docs/                        # Documentation
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── NXML_SPEC.md
│
└── tests/                       # End-to-end tests
```

## Technology Stack

### Backend (Python)
- **FastAPI**: REST + WebSocket API
- **Pydantic 2.0**: Type-safe models
- **NetworkX**: Graph operations
- **wasmtime-py**: WASM runtime
- **SQLAlchemy 2.0**: ORM
- **GitPython**: Version control
- **LangChain + CrewAI**: AI agents
- **TriLog**: Observability

### Frontend (React)
- **React 18 + TypeScript**: UI framework
- **Vite**: Build tool
- **Tailwind CSS**: Styling
- **Native WebSocket**: Real-time updates

### Infrastructure
- **Docker**: Containers
- **Kubernetes**: Orchestration
- **PostgreSQL**: Database
- **ClickHouse**: Telemetry
- **Redis**: Cache (optional)

## Quick Start

### Prerequisites
- Python 3.11+
- PostgreSQL 15+
- Docker & Docker Compose
- Node.js 20+ (for frontend)

### Installation

```bash
# Install nexus-protocol
cd packages/nexus-protocol
pip install -e .

# Install nexus-core
cd ../../runtime/nexus-core
pip install -e .

# Install workspace-kernel
cd ../workspace-kernel
pip install -e .

# Install nexus-ai
cd ../nexus-ai
pip install -e .
```

### Development

```bash
# Run workspace kernel
cd runtime/workspace-kernel
uvicorn workspace_kernel.main:app --reload --port 3000

# Run nexus-ai service
cd runtime/nexus-ai
python -m nexus_ai.main

# Run tests
pytest
```

### Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f workspace-kernel
```

## Implementation Status

### Phase 0: TriLog Schemas ✅
- [x] Object definitions (User, Workspace, Panel, etc.)
- [x] Process definitions (PanelLifecycle, HandlerExecution, etc.)
- [x] Schema registry

### Phase 1: Foundation ✅
- [x] Directory structure
- [x] Pydantic AST models
- [x] NOG type definitions
- [x] WebSocket message protocol
- [x] All pyproject.toml files

### Phase 2: Parser ✅
- [x] NXML lexer (tokenization)
- [x] NXML parser (AST building)
- [x] Semantic validator
- [x] AST cache (LRU with SHA-256)

### Phase 3: NOG ✅
- [x] NOGGraph implementation (NetworkX)
- [x] Entity/relationship operations
- [x] Graph queries (subgraph, path finding)
- [x] Serialization (JSON for Git)

### Phase 4: Sandbox ✅
- [x] Execution framework
- [x] Instance pool
- [x] Host functions
- [x] Capability system
- [x] Demo implementation (production needs wasmtime)

### Phase 5: Workspace Kernel ✅
- [x] FastAPI app with CORS
- [x] REST API endpoints
- [x] WebSocket manager
- [x] Service layer (Panel, NOG, Git)
- [x] SQLAlchemy models
- [x] JWT authentication

### Phase 6: Frontend Bridge ✅
- [x] React NXMLRenderer component
- [x] Component mapping registry
- [x] Prop resolution (bindings)
- [x] Event handler binding
- [x] WebSocket integration

### Phase 7: AI Integration ✅
- [x] Context builder (NOG → LLM)
- [x] Patch generator (LLM → NOG)
- [x] CodeGeneratorAgent (NXML generation)
- [x] DesignAgent (UI/UX guidance)
- [x] SyncAgent (consistency checking)
- [x] AIService (main interface)

### Phase 8: Deployment ✅
- [x] Docker images
- [x] K8s manifests (namespace, deployments, services, ingress)
- [x] Docker Compose for local dev
- [x] OpenTelemetry collector config
- [x] Deployment scripts

## Key Design Decisions

1. **Dynamic Renderer Pattern**: Python parses NXML → JSON AST → React recursively renders
2. **Clean Break**: No backward compatibility with Node.js workspace-kernel
3. **Wasmtime over RestrictedPython**: Stronger security guarantees
4. **WebSocket + REST**: Real-time updates + CRUD operations
5. **TriLog from Day One**: Model-driven observability
6. **Pydantic + NetworkX**: Type-safe entities + efficient graph queries

## Performance Targets

| Metric | Target | P95 | P99 |
|--------|--------|-----|-----|
| NXML Parse (cold) | < 100ms | 150ms | 300ms |
| NXML Parse (cached) | < 10ms | 20ms | 50ms |
| Handler Execution | < 50ms | 100ms | 200ms |
| NOG Query | < 20ms | 50ms | 100ms |
| WebSocket Message | < 5ms | 10ms | 20ms |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - Detailed system architecture
- [API Reference](docs/API.md) - REST and WebSocket API documentation
- [NXML Specification](docs/NXML_SPEC.md) - NXML language specification
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment guide

## Contributing

This is a complete rebuild of the Nexus backend. All contributions should follow the architecture defined in the plan document.

## License

See LICENSE file in the root monorepo.
