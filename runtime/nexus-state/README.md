# Nexus State Management Service

High-performance panel state management service with Redis caching, PostgreSQL persistence, and Git-based snapshots.

## Features

- **Fast State Operations**: Sub-10ms cached reads with Redis
- **Optimistic Locking**: Version-based concurrency control
- **Audit Trail**: Append-only state history for debugging and time-travel
- **Git Snapshots**: Workspace-wide state snapshots with Git version control
- **WebSocket Support**: Real-time state synchronization (TODO)
- **High Availability**: Horizontal scaling with HPA

## Architecture

```
┌─────────────┐
│   Frontend  │
└──────┬──────┘
       │ REST API
       ▼
┌─────────────────────┐
│   Nexus State API   │
│    (FastAPI)        │
└──────┬──────────────┘
       │
       ├─────────────┐
       ▼             ▼
┌──────────┐  ┌──────────────┐
│  Redis   │  │  PostgreSQL  │
│  Cache   │  │  (asyncpg)   │
└──────────┘  └──────────────┘
       │             │
       └──────┬──────┘
              ▼
       ┌──────────────┐
       │  Git Storage │
       │  (Snapshots) │
       └──────────────┘
```

## Database Schema

### panel_states
- Current state for each panel (user_id, workspace_id, panel_id)
- JSONB state_data with GIN indexing
- Version number for optimistic locking
- SHA-256 checksum for integrity

### state_history
- Append-only log of state changes
- JSON patch format for efficient storage
- Triggered_by metadata for audit trail

### state_snapshots
- Workspace-wide snapshots
- Git commit hash for version control
- Full state data in JSONB

## API Endpoints

### State Operations

**GET** `/api/state/{workspace_id}/{panel_id}`
- Get current panel state
- Query params: `version` (optional), `include_history` (bool)
- Returns: StateResponse with state data, version, and optional history

**PUT** `/api/state/{workspace_id}/{panel_id}`
- Update panel state (full replace)
- Body: `{state: object, version: int, triggered_by: string}`
- Returns: StateUpdateResponse with new version

**POST** `/api/state/{workspace_id}/{panel_id}`
- Create initial panel state
- Body: `{initial_state: object}`
- Returns: Success response with version 1

**DELETE** `/api/state/{workspace_id}/{panel_id}`
- Delete panel state
- Returns: 204 No Content

**GET** `/api/state/{workspace_id}/{panel_id}/history`
- Get state change history
- Query params: `limit` (default: 50), `offset` (default: 0)
- Returns: StateHistoryResponse with history entries

### Snapshot Operations

**POST** `/api/snapshots/{workspace_id}`
- Create workspace snapshot (all panels)
- Body: `{description: string}`
- Returns: SnapshotResponse with Git commit hash

**GET** `/api/snapshots/{workspace_id}`
- List all snapshots for workspace
- Query params: `limit` (default: 50)
- Returns: List of snapshots with metadata

**GET** `/api/snapshots/{workspace_id}/commits`
- Get Git commit history
- Query params: `limit` (default: 50)
- Returns: List of Git commits

**POST** `/api/snapshots/{workspace_id}/restore`
- Restore workspace from snapshot
- Body: `{snapshot_id?: string, git_commit_hash?: string}`
- Returns: Restore result with panel count

**GET** `/api/snapshots/{workspace_id}/{snapshot_id}`
- Get snapshot details
- Returns: Full snapshot data

### Health Check

**GET** `/health`
- Service health check
- Returns: `{status: "healthy"|"degraded", redis: "connected"|"disconnected"}`

## Configuration

Environment variables (configured in K8s ConfigMap/Secrets):

```bash
# Service
SERVICE_NAME=nexus-state
SERVICE_PORT=8001

# Database (async driver)
DATABASE_URL=postgresql+asyncpg://user:pass@host:port/dbname

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=
CACHE_TTL_SECONDS=1800  # 30 minutes

# Git
GIT_WORKSPACE_ROOT=/app/state-snapshots

# Security
JWT_SECRET_KEY=your-secret-key

# CORS
CORS_ORIGINS=["http://localhost:5173"]
```

## Development

### Local Setup

```bash
# Install dependencies
cd runtime/nexus-state
pip install -e .

# Run locally (requires PostgreSQL and Redis)
export DATABASE_URL=postgresql+asyncpg://nexus:nexus@localhost:5432/nexus
export REDIS_HOST=localhost
export REDIS_PORT=6379
export JWT_SECRET_KEY=dev-secret-key
uvicorn nexus_state.main:app --reload --port 8001
```

### Docker Build

```bash
# From project root
docker build -f docker/nexus-state.Dockerfile -t nexus/nexus-state:latest .
```

### Kubernetes Deployment

```bash
# Build and deploy
./k8s/scripts/build-images.sh
./k8s/scripts/deploy.sh

# Check status
kubectl get pods -n nexus-python -l app=nexus-state

# View logs
kubectl logs -n nexus-python -l app=nexus-state --tail=100 -f

# Port-forward for local access
kubectl port-forward -n nexus-python svc/nexus-state 8001:8001

# Test health endpoint
curl http://localhost:8001/health
```

## Performance Targets

- **Cache Hit Rate**: 80%+
- **Cached Read Latency**: < 10ms (p99)
- **Database Read Latency**: < 50ms (p99)
- **Write Latency**: < 100ms (p99)
- **Snapshot Creation**: < 5s for 100 panels

## Security

- JWT-based authentication (TODO: implement full validation)
- User-scoped state access (enforced in all queries)
- Secure password handling via K8s Secrets
- HTTPS in production (via ingress)

## Scaling

- Horizontal Pod Autoscaler configured (2-10 replicas)
- Metrics: CPU (70% target), Memory (80% target)
- Stateless design allows easy scaling
- Redis cache shared across all pods
- PostgreSQL connection pooling (10 connections per pod)

## Monitoring

- Health check endpoint for liveness/readiness probes
- TriLog integration for distributed tracing (TODO)
- OpenTelemetry metrics export (TODO)
- Redis connection monitoring

## Future Enhancements

- [ ] WebSocket support for real-time state synchronization
- [ ] JSON Patch support for efficient state updates
- [ ] State compression for large panels
- [ ] Time-travel debugging with state reconstruction
- [ ] Automatic snapshot scheduling
- [ ] State conflict resolution strategies
- [ ] Rate limiting per user/workspace
- [ ] Metrics dashboard integration
