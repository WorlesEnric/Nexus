# Nexus Python - Implementation Guide

This document provides step-by-step instructions for implementing the complete Nexus Python backend.

## Overview

The implementation is divided into 8 phases, each building on the previous one. Each phase includes specific deliverables, test requirements, and success criteria.

## Phase 1: Foundation ✅ COMPLETED

### Deliverables
- [x] Directory structure created
- [x] Pydantic AST models (`nexus-protocol/ast.py`)
- [x] NOG type definitions (`nexus-protocol/nog.py`)
- [x] WebSocket protocol messages (`nexus-protocol/messages.py`)
- [x] Validation utilities (`nexus-protocol/validation.py`)
- [x] All `pyproject.toml` files configured

### What We Built

**1. Type System (`nexus-protocol`)**:
- `NexusPanelAST`: Complete AST representation of NXML
- `NOGEntity` / `NOGRelationship`: Semantic graph types
- `ClientMessage` / `ServerMessage`: WebSocket protocol
- Full Pydantic validation for all types

**2. Project Structure**:
```
nexus-python/
├── packages/nexus-protocol/     # Type definitions ✅
├── runtime/
│   ├── nexus-core/              # Parser, NOG, Sandbox (next phase)
│   ├── workspace-kernel/        # FastAPI service (phase 5)
│   └── nexus-ai/                # AI orchestration (phase 7)
├── trilog-schemas/              # Observability schemas (phase 6)
└── docs/                        # Documentation
```

### Next Steps
Proceed to Phase 2: NXML Parser Implementation

---

## Phase 2: NXML Parser Implementation

### Goal
Build a Python lexer and parser that converts NXML source code into typed AST.

### Tasks

#### 2.1 Create Lexer (`nexus-core/parser/lexer.py`)

```python
# TODO: Implement tokenization
class Token:
    type: TokenType
    value: str
    loc: SourceLocation

class Lexer:
    def tokenize(source: str) -> List[Token]:
        # Tokenize NXML into TAG_OPEN, TAG_CLOSE, ATTR_NAME, etc.
        pass
```

**Requirements**:
- Handle XML-like syntax
- Track source locations for error reporting
- Support expressions `{$state.variable}`
- Support code blocks in `<Handler>` tags

**Tests**:
- `test_lexer_simple_tags()`
- `test_lexer_attributes()`
- `test_lexer_expressions()`
- `test_lexer_code_blocks()`

#### 2.2 Create Parser (`nexus-core/parser/parser.py`)

```python
# TODO: Implement AST construction
class Parser:
    def parse(source: str) -> NexusPanelAST:
        # Parse tokens into Pydantic AST
        pass
```

**Requirements**:
- Build NexusPanelAST from tokens
- Validate structure (NexusPanel → Data/Logic/View)
- Parse state declarations
- Parse tool definitions with handlers
- Parse view component tree

**Tests**:
- `test_parse_minimal_panel()`
- `test_parse_data_section()`
- `test_parse_logic_section()`
- `test_parse_view_tree()`
- `test_parse_complete_panel()`

#### 2.3 Create Validator (`nexus-core/parser/validator.py`)

```python
# TODO: Implement semantic validation
class ASTValidator:
    def validate(ast: NexusPanelAST) -> ValidationResult:
        # Check for duplicate names, undefined references, etc.
        pass
```

**Requirements**:
- No duplicate state/computed/tool names
- Lifecycle events are valid
- Tool arguments have valid types
- Flag dangerous capabilities

**Tests**:
- `test_validator_duplicate_states()`
- `test_validator_invalid_lifecycle()`
- `test_validator_dangerous_capabilities()`

#### 2.4 Create AST Cache (`nexus-core/parser/cache.py`)

```python
# TODO: Implement LRU cache
class ASTCache:
    def get(nxml_source: str) -> Optional[NexusPanelAST]:
        pass

    def put(nxml_source: str, ast: NexusPanelAST):
        pass
```

**Requirements**:
- SHA-256 hash of NXML source as key
- LRU eviction (max 1000 entries)
- Thread-safe
- Metrics (hit rate, misses)

**Tests**:
- `test_cache_hit()`
- `test_cache_miss()`
- `test_cache_eviction()`

### Success Criteria
- [ ] Parse simple NXML panel in < 100ms
- [ ] Cached parse in < 10ms
- [ ] All validation rules working
- [ ] 100% test coverage for parser

### Performance Targets
| Operation | Target | P95 |
|-----------|--------|-----|
| Parse (cold) | < 100ms | 150ms |
| Parse (cached) | < 10ms | 20ms |
| Validation | < 5ms | 10ms |

---

## Phase 3: NOG Implementation

### Goal
Implement the semantic graph using Pydantic + NetworkX.

### Tasks

#### 3.1 NOG Graph Engine (`nexus-core/nog/graph.py`)

```python
# TODO: Implement graph operations
class NOGGraph:
    def __init__(self, workspace_id: str):
        self.graph = nx.DiGraph()
        self._entities: Dict[str, NOGEntity] = {}

    def add_entity(self, entity: NOGEntity):
        pass

    def get_subgraph(self, entity_id: str, depth: int = 2):
        pass

    def find_path(self, source_id: str, target_id: str):
        pass
```

**Requirements**:
- Add/update/delete entities
- Add/update/delete relationships
- Subgraph extraction (BFS with depth limit)
- Path finding (shortest path)
- Get dependencies/dependents
- Graph statistics

**Tests**:
- `test_add_entity()`
- `test_add_relationship()`
- `test_get_subgraph()`
- `test_find_path()`
- `test_get_dependencies()`

#### 3.2 Serialization (`nexus-core/nog/serialization.py`)

```python
# TODO: Implement JSON serialization
class NOGSerializer:
    @staticmethod
    def serialize(graph: NOGGraph) -> Dict[str, Any]:
        pass

    @staticmethod
    def deserialize(data: Dict[str, Any]) -> NOGGraph:
        pass
```

**Requirements**:
- Serialize graph to JSON
- Deserialize from JSON
- Preserve all metadata
- Handle circular references

**Tests**:
- `test_serialize_empty_graph()`
- `test_serialize_complex_graph()`
- `test_roundtrip_serialization()`

### Success Criteria
- [ ] Add entity in < 1ms
- [ ] Subgraph query in < 20ms
- [ ] Path finding in < 10ms
- [ ] Serialize 1000-entity graph in < 100ms

---

## Phase 4: Sandbox Executor

### Goal
Integrate Python wasmtime to execute handlers securely.

### Tasks

#### 4.1 Download QuickJS WASM

```bash
# TODO: Build or download QuickJS WASM module
wget https://github.com/bellard/quickjs/releases/latest/quickjs.wasm
mv quickjs.wasm nexus-python/wasm/
```

#### 4.2 Wasmtime Integration (`nexus-core/sandbox/executor.py`)

```python
# TODO: Implement WASM executor
from wasmtime import Store, Module, Instance

class SandboxExecutor:
    def __init__(self):
        self.engine = Engine()
        self.quickjs_module = self._load_quickjs_module()

    async def execute(
        self,
        handler_code: str,
        context: Dict[str, Any],
        capabilities: Set[str]
    ) -> ExecutionResult:
        pass
```

**Requirements**:
- Load QuickJS WASM module
- Create Wasmtime store and instance
- Register host functions (state access, extensions)
- Execute JavaScript handler code
- Collect state changes
- Enforce timeouts and memory limits

**Tests**:
- `test_execute_simple_handler()`
- `test_execute_with_state_access()`
- `test_execute_timeout()`
- `test_execute_memory_limit()`
- `test_capability_enforcement()`

#### 4.3 Instance Pool (`nexus-core/sandbox/pool.py`)

```python
# TODO: Implement instance pool
class InstancePool:
    async def acquire() -> PooledInstance:
        pass

    async def release(instance_id: str):
        pass
```

**Requirements**:
- Pre-warm 10 instances
- Acquire/release pattern
- Auto-cleanup idle instances
- Metrics (pool utilization)

**Tests**:
- `test_pool_acquire_release()`
- `test_pool_concurrency()`
- `test_pool_cleanup()`

### Success Criteria
- [ ] Execute handler in < 50ms
- [ ] Pool acquire in < 5ms
- [ ] Memory limit enforced
- [ ] Timeout enforced
- [ ] Capabilities checked

---

## Phase 5: Workspace Kernel (FastAPI)

### Goal
Build the FastAPI service that orchestrates everything.

### Tasks

#### 5.1 FastAPI Application (`workspace-kernel/main.py`)

```python
# TODO: Create FastAPI app
app = FastAPI(title="Nexus Workspace Kernel")

@app.post("/api/panels")
async def create_panel(request: CreatePanelRequest):
    pass

@app.websocket("/ws/{workspace_id}")
async def websocket_endpoint(websocket: WebSocket):
    pass
```

**Requirements**:
- REST API for CRUD operations
- WebSocket for real-time updates
- JWT authentication
- CORS middleware
- Health check endpoint

**Tests**:
- `test_create_panel()`
- `test_execute_handler()`
- `test_websocket_connection()`
- `test_authentication()`

#### 5.2 Service Layer

```python
# TODO: Implement services
class PanelService:
    async def create_panel(...):
        # Parse NXML, store in DB, add to NOG
        pass

    async def execute_handler(...):
        # Use sandbox executor, apply state changes
        pass

class NOGService:
    async def query_graph(...):
        pass

class GitService:
    async def commit(...):
        pass
```

### Success Criteria
- [ ] API responds in < 50ms (P95)
- [ ] WebSocket latency < 10ms
- [ ] All endpoints tested
- [ ] Authentication working

---

## Phase 6: Frontend Bridge

### Goal
Update React to render panels from JSON AST.

### Tasks

#### 6.1 Create NXMLRenderer Component

```typescript
// apps/graphstudio/src/components/NXMLRenderer.tsx
function NXMLRenderer({ ast }: { ast: PanelAST }) {
  const renderNode = (node: ViewNode) => {
    const Component = COMPONENT_MAP[node.type];
    return <Component {...resolveProps(node.props)}>
      {node.children?.map(renderNode)}
    </Component>;
  };

  return renderNode(ast.view.root);
}
```

**Requirements**:
- Recursive component rendering
- Prop resolution (bindings to state)
- Event handler binding
- Conditional rendering
- List iteration

**Tests**:
- E2E tests with Playwright
- Test all component types
- Test state updates
- Test event handling

### Success Criteria
- [ ] Render panel in < 50ms
- [ ] State updates reflected immediately
- [ ] Event handlers work
- [ ] All built-in components supported

---

## Phase 7: AI Integration

### Goal
Integrate LangChain/CrewAI for context building.

### Tasks

#### 7.1 Context Builder (`nexus-ai/context_builder.py`)

```python
# TODO: Build LLM context from NOG
class AIContextBuilder:
    def build_context(
        self,
        graph: NOGGraph,
        focus_entity_id: Optional[str] = None
    ) -> List[Document]:
        pass
```

**Requirements**:
- Extract subgraph around focus entity
- Convert entities to natural language
- Prune to token limit
- Build structured context

**Tests**:
- `test_build_context_workspace()`
- `test_build_context_focus_entity()`
- `test_prune_to_limit()`

#### 7.2 Patch Generator (`nexus-ai/patch_generator.py`)

```python
# TODO: Generate patches from LLM
class AIPatchGenerator:
    async def generate_patch(
        self,
        user_request: str,
        context: List[Document]
    ) -> List[NOGPatch]:
        pass
```

**Requirements**:
- Call OpenAI/Anthropic API
- Parse response into NOG patches
- Validate patches
- Return structured patches

**Tests**:
- `test_generate_patch_simple()`
- `test_parse_llm_response()`
- `test_validate_patches()`

### Success Criteria
- [ ] Context build in < 500ms
- [ ] Patch generation TTFB < 1s
- [ ] Patches valid
- [ ] Integration with workspace-kernel working

---

## Phase 8: Deployment

### Goal
Deploy to production with Docker and Kubernetes.

### Tasks

#### 8.1 Docker Images

```dockerfile
# docker/workspace-kernel.Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY runtime/workspace-kernel /app
RUN pip install -e .
CMD ["uvicorn", "workspace_kernel.main:app", "--host", "0.0.0.0"]
```

**Requirements**:
- Multi-stage builds
- Optimized image sizes
- Health checks
- Non-root user

#### 8.2 Kubernetes Manifests

```yaml
# k8s/services/workspace-kernel/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: workspace-kernel
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: workspace-kernel
        image: nexus/workspace-kernel:latest
```

**Requirements**:
- Deployments for all services
- Services with LoadBalancer
- ConfigMaps for configuration
- Secrets for credentials
- HPA for auto-scaling

#### 8.3 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy Nexus Python
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build images
      - name: Run tests
      - name: Push to registry
      - name: Deploy to K8s
```

### Success Criteria
- [ ] All services deployed
- [ ] Health checks passing
- [ ] Metrics collected
- [ ] CI/CD pipeline working

---

## Summary of Implementation

### Completed (Phase 1)
- ✅ Project structure
- ✅ Type definitions (AST, NOG, Messages)
- ✅ Build configuration (pyproject.toml)
- ✅ Validation utilities

### Next Steps
1. **Phase 2**: Implement NXML parser (lexer, parser, validator, cache)
2. **Phase 3**: Implement NOG graph with NetworkX
3. **Phase 4**: Integrate Wasmtime sandbox
4. **Phase 5**: Build FastAPI workspace kernel
5. **Phase 6**: Update React frontend
6. **Phase 7**: Add AI integration
7. **Phase 8**: Deploy to production

### Estimated Timeline
- Phase 2: 1-2 weeks
- Phase 3: 1 week
- Phase 4: 1-2 weeks
- Phase 5: 2 weeks
- Phase 6: 1 week
- Phase 7: 1-2 weeks
- Phase 8: 1 week

**Total**: 8-12 weeks for complete implementation

---

## Development Workflow

### Running Tests
```bash
# Run all tests
pytest

# Run specific package tests
cd packages/nexus-protocol
pytest

# Run with coverage
pytest --cov --cov-report=html
```

### Code Quality
```bash
# Format code
black .

# Lint code
ruff check .

# Type check
mypy nexus_protocol nexus_core workspace_kernel nexus_ai
```

### Running Services Locally
```bash
# Start workspace kernel
cd runtime/workspace-kernel
uvicorn workspace_kernel.main:app --reload --port 3000

# Start nexus-ai
cd runtime/nexus-ai
python -m nexus_ai.main
```

---

## Contributing

When implementing each phase:
1. Create a branch for the phase
2. Implement all tasks with tests
3. Run full test suite
4. Check code quality (black, ruff, mypy)
5. Create PR with description
6. Get review and merge

## Questions?

For questions or clarifications, refer to:
- `/Users/worlesenric/.claude/plans/happy-sniffing-quokka.md` - Original plan
- This implementation guide
- Architecture documentation (coming soon)
