# Nexus State Management Service - Architecture & Implementation

**Created:** 2025-12-19
**Status:** Architectural Design
**Priority:** Critical
**Target:** Phase 5.5 (parallel with Workspace Management)

---

## Executive Summary

This document defines a new dedicated microservice (`nexus-state`) for managing all panel state in the Nexus platform. State management is extracted from workspace-kernel into a specialized service to provide:

1. **High-performance state operations** (read/write/patch)
2. **Git-backed persistence** with full history
3. **Distributed caching** for low-latency access
4. **State versioning and time-travel**
5. **Conflict resolution** for concurrent updates
6. **AI context integration** (state → LLM prompts)

**Key Insight:** Panel state is the **core of human-AI interaction** - every AI suggestion modifies state, every user action updates state, and all context building derives from state. This criticality demands a dedicated, optimized service.

---

## Problem Statement

### Current State (Problems)

**Workspace-Kernel Handles Everything:**
```
workspace-kernel/
  ├─ Panel CRUD
  ├─ NXML parsing
  ├─ State storage ❌ (not implemented)
  ├─ Git operations
  ├─ WebSocket connections
  └─ NOG management
```

**Issues:**
1. ❌ **No actual state storage** - Panel model only has metadata, not runtime state
2. ❌ **State scattered** - Some in memory, some in DB, no single source of truth
3. ❌ **No state history** - Can't replay or revert state changes
4. ❌ **Performance bottleneck** - State reads on every panel render
5. ❌ **Scaling issues** - Can't independently scale state operations
6. ❌ **No state caching** - Every state read hits database
7. ❌ **Concurrent update conflicts** - No optimistic locking or CRDTs

### Desired State (Solution)

**Dedicated State Service:**
```
nexus-state/
  ├─ State CRUD API (high-performance)
  ├─ Redis cache layer (< 10ms reads)
  ├─ PostgreSQL persistent store
  ├─ Git-based state snapshots
  ├─ Patch/diff engine
  ├─ Conflict resolution (OT/CRDT)
  └─ State → AI context builder
```

**Benefits:**
1. ✅ **Single source of truth** for all panel state
2. ✅ **Sub-10ms state reads** via Redis cache
3. ✅ **Complete state history** via Git
4. ✅ **Independent scaling** of state operations
5. ✅ **Optimistic updates** with conflict resolution
6. ✅ **Time-travel debugging** (state at any point in time)
7. ✅ **AI context pre-computation** (cache state embeddings)

---

## Architecture Design

### Service Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     nexus-state Service                      │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              FastAPI Application                     │   │
│  │  - REST API (state CRUD)                            │   │
│  │  - WebSocket (state subscriptions)                   │   │
│  │  - gRPC (high-perf internal calls)                   │   │
│  └───────────┬─────────────────────────────────────────┘   │
│              │                                              │
│  ┌───────────▼──────────────┐  ┌────────────────────────┐ │
│  │   State Manager          │  │   Patch Engine         │ │
│  │  - Get/Set/Update        │  │  - JSON Patch          │ │
│  │  - Versioning            │  │  - Operational Transform│ │
│  │  - Validation            │  │  - Conflict Resolution │ │
│  └───────────┬──────────────┘  └────────────────────────┘ │
│              │                                              │
│  ┌───────────▼──────────────────────────────────────────┐  │
│  │              Cache Layer (Redis)                      │  │
│  │  - Hot state cache (LRU)                             │  │
│  │  - Pub/Sub for state updates                         │  │
│  │  - TTL: 30 minutes                                   │  │
│  └───────────┬──────────────────────────────────────────┘  │
│              │                                              │
│  ┌───────────▼──────────────────────────────────────────┐  │
│  │        Persistent Store (PostgreSQL)                  │  │
│  │  - Current state table                               │  │
│  │  - State history table (append-only)                 │  │
│  │  - Indexes: user_id, workspace_id, panel_id         │  │
│  └───────────┬──────────────────────────────────────────┘  │
│              │                                              │
│  ┌───────────▼──────────────────────────────────────────┐  │
│  │         Git State Store (filesystem)                  │  │
│  │  - State snapshots as JSON files                     │  │
│  │  - One repo per workspace                            │  │
│  │  - Commit on major state changes                     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Integration with Existing Services

```
┌──────────────────┐
│  GraphStudio     │
│  (Frontend)      │
└────────┬─────────┘
         │ HTTP/WS
         ▼
┌──────────────────┐       ┌──────────────────┐
│ workspace-kernel │◄─────►│  nexus-state     │
│                  │ gRPC  │                  │
│ - Panel CRUD     │       │ - State CRUD     │
│ - NXML parsing   │       │ - State cache    │
│ - NOG mgmt       │       │ - State history  │
└────────┬─────────┘       └────────┬─────────┘
         │                          │
         │                          │
         ▼                          ▼
┌──────────────────┐       ┌──────────────────┐
│  PostgreSQL      │       │  PostgreSQL      │
│  (workspace DB)  │       │  (state DB)      │
└──────────────────┘       └──────────────────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │  Redis           │
                           │  (state cache)   │
                           └──────────────────┘
```

### Data Flow

**1. Panel Render (Read State):**
```
Frontend → workspace-kernel → nexus-state
                                    ├─→ Redis (cache hit) → return
                                    └─→ PostgreSQL → cache → return
```

**2. User Action (Update State):**
```
Frontend → workspace-kernel → nexus-state
                                    ├─→ Validate patch
                                    ├─→ Apply to current state
                                    ├─→ Write to PostgreSQL
                                    ├─→ Update Redis cache
                                    ├─→ Publish to Redis Pub/Sub
                                    └─→ Broadcast to subscribers (WS)
```

**3. AI Patch (Concurrent Update):**
```
AI Service → nexus-state
              ├─→ Check version (optimistic lock)
              ├─→ Detect conflict
              ├─→ Apply operational transform
              ├─→ Merge changes
              └─→ Commit merged state
```

**4. Git Snapshot (Periodic):**
```
Cron Job (every 5 minutes or on major change):
  ├─→ nexus-state fetches all workspace states
  ├─→ Serialize to JSON
  ├─→ Write to Git workspace repo
  ├─→ Commit with timestamp
  └─→ Push to remote
```

---

## Database Schema

### PostgreSQL Tables

#### Table: `panel_states`
**Purpose:** Current state of each panel (single source of truth)

```sql
CREATE TABLE panel_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity (composite key)
    user_id VARCHAR(255) NOT NULL,
    workspace_id VARCHAR(255) NOT NULL,
    panel_id VARCHAR(255) NOT NULL,

    -- State data
    state_data JSONB NOT NULL,  -- Actual panel state
    state_schema_version VARCHAR(50) DEFAULT '1.0.0',

    -- Versioning (optimistic locking)
    version INTEGER NOT NULL DEFAULT 1,
    checksum VARCHAR(64),  -- SHA-256 of state_data

    -- Metadata
    state_size_bytes INTEGER,
    state_variable_count INTEGER,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_accessed_at TIMESTAMP DEFAULT NOW(),

    -- Indexes
    UNIQUE(user_id, workspace_id, panel_id),
    INDEX idx_workspace_panels (workspace_id, panel_id),
    INDEX idx_user_workspaces (user_id, workspace_id),
    INDEX idx_updated_at (updated_at DESC),

    -- GIN index for JSONB queries
    INDEX idx_state_data_gin (state_data) USING GIN
);
```

**Example Row:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user_123",
  "workspace_id": "ws_456",
  "panel_id": "panel_789",
  "state_data": {
    "$state": {
      "counter": 42,
      "username": "alice",
      "todos": ["Task 1", "Task 2"]
    },
    "$computed": {
      "todoCount": 2
    }
  },
  "version": 15,
  "checksum": "a3f8b2...",
  "state_size_bytes": 256,
  "state_variable_count": 4,
  "created_at": "2025-12-19T10:00:00Z",
  "updated_at": "2025-12-19T12:30:00Z"
}
```

#### Table: `state_history`
**Purpose:** Append-only log of all state changes (audit trail, time-travel)

```sql
CREATE TABLE state_history (
    id BIGSERIAL PRIMARY KEY,

    -- Reference to panel
    panel_state_id UUID NOT NULL REFERENCES panel_states(id),
    user_id VARCHAR(255) NOT NULL,
    workspace_id VARCHAR(255) NOT NULL,
    panel_id VARCHAR(255) NOT NULL,

    -- Change tracking
    change_type VARCHAR(50) NOT NULL,  -- created, updated, deleted, reverted
    patch JSONB,  -- JSON Patch format (RFC 6902)
    previous_version INTEGER,
    new_version INTEGER,

    -- Context
    triggered_by VARCHAR(255),  -- user, ai, system
    trigger_source VARCHAR(255),  -- handler_name, ai_suggestion, etc.

    -- Snapshot (optional - only for major changes)
    snapshot JSONB,  -- Full state snapshot

    -- Metadata
    change_size_bytes INTEGER,

    -- Timestamps
    occurred_at TIMESTAMP DEFAULT NOW(),

    -- Indexes
    INDEX idx_panel_history (panel_state_id, occurred_at DESC),
    INDEX idx_workspace_history (workspace_id, occurred_at DESC),
    INDEX idx_occurred_at (occurred_at DESC)
);
```

**Example Row (Patch):**
```json
{
  "id": 12345,
  "panel_state_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user_123",
  "workspace_id": "ws_456",
  "panel_id": "panel_789",
  "change_type": "updated",
  "patch": [
    { "op": "replace", "path": "/$state/counter", "value": 43 }
  ],
  "previous_version": 14,
  "new_version": 15,
  "triggered_by": "user",
  "trigger_source": "increment_handler",
  "snapshot": null,
  "occurred_at": "2025-12-19T12:30:00Z"
}
```

#### Table: `state_snapshots`
**Purpose:** Periodic full state snapshots (fast restoration, Git sync)

```sql
CREATE TABLE state_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope
    workspace_id VARCHAR(255) NOT NULL,
    snapshot_type VARCHAR(50) NOT NULL,  -- manual, auto, pre_ai_edit

    -- Snapshot data
    snapshot_data JSONB NOT NULL,  -- Map of panel_id → state_data
    panel_count INTEGER,
    total_size_bytes INTEGER,

    -- Git integration
    git_commit_hash VARCHAR(64),
    git_branch VARCHAR(255) DEFAULT 'main',

    -- Metadata
    description TEXT,
    created_by VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),

    -- Indexes
    INDEX idx_workspace_snapshots (workspace_id, created_at DESC),
    INDEX idx_git_commit (git_commit_hash)
);
```

**Example Row:**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "workspace_id": "ws_456",
  "snapshot_type": "auto",
  "snapshot_data": {
    "panel_789": {
      "$state": { "counter": 43, "username": "alice" }
    },
    "panel_790": {
      "$state": { "message": "Hello" }
    }
  },
  "panel_count": 2,
  "total_size_bytes": 512,
  "git_commit_hash": "abc123def456",
  "git_branch": "main",
  "created_at": "2025-12-19T13:00:00Z"
}
```

### Redis Schema

#### Key: `state:{workspace_id}:{panel_id}`
**Value:** JSON-serialized state
**TTL:** 1800 seconds (30 minutes)

```
Key: state:ws_456:panel_789
Value: {
  "$state": { "counter": 43, "username": "alice" },
  "$computed": { "todoCount": 2 },
  "_meta": {
    "version": 15,
    "updated_at": "2025-12-19T12:30:00Z"
  }
}
TTL: 1800
```

#### Channel: `state-updates:{workspace_id}`
**Purpose:** Pub/Sub for real-time state updates

```
PUBLISH state-updates:ws_456 {
  "panel_id": "panel_789",
  "patch": [
    { "op": "replace", "path": "/$state/counter", "value": 43 }
  ],
  "version": 15,
  "timestamp": "2025-12-19T12:30:00Z"
}
```

---

## API Specification

### REST API Endpoints

#### 1. Get Panel State
```http
GET /api/state/{workspace_id}/{panel_id}
Authorization: Bearer <jwt>

Query Parameters:
  - version: integer (optional, default: latest)
  - include_history: boolean (optional, default: false)

Response 200:
{
  "panelId": "panel_789",
  "workspaceId": "ws_456",
  "state": {
    "$state": { "counter": 43 },
    "$computed": { "todoCount": 2 }
  },
  "version": 15,
  "updatedAt": "2025-12-19T12:30:00Z",
  "history": [...]  // if include_history=true
}
```

#### 2. Update Panel State (Full Replace)
```http
PUT /api/state/{workspace_id}/{panel_id}
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "state": {
    "$state": { "counter": 44 },
    "$computed": { "todoCount": 2 }
  },
  "version": 15,  // Optimistic lock
  "triggeredBy": "user",
  "triggerSource": "increment_handler"
}

Response 200:
{
  "success": true,
  "version": 16,
  "updatedAt": "2025-12-19T12:31:00Z"
}

Response 409 (Conflict):
{
  "error": "version_conflict",
  "currentVersion": 17,
  "message": "State was modified by another process"
}
```

#### 3. Patch Panel State (Partial Update)
```http
PATCH /api/state/{workspace_id}/{panel_id}
Authorization: Bearer <jwt>
Content-Type: application/json-patch+json

{
  "patches": [
    { "op": "replace", "path": "/$state/counter", "value": 44 },
    { "op": "add", "path": "/$state/todos/-", "value": "Task 3" }
  ],
  "version": 15,
  "triggeredBy": "ai",
  "triggerSource": "ai_suggestion_apply"
}

Response 200:
{
  "success": true,
  "version": 16,
  "appliedPatches": 2,
  "updatedAt": "2025-12-19T12:31:00Z"
}
```

#### 4. Get State History
```http
GET /api/state/{workspace_id}/{panel_id}/history
Authorization: Bearer <jwt>

Query Parameters:
  - limit: integer (default: 50, max: 1000)
  - offset: integer (default: 0)
  - since: timestamp (optional)
  - until: timestamp (optional)

Response 200:
{
  "panelId": "panel_789",
  "totalChanges": 150,
  "history": [
    {
      "id": 12345,
      "changeType": "updated",
      "patch": [...],
      "version": 15,
      "triggeredBy": "user",
      "occurredAt": "2025-12-19T12:30:00Z"
    },
    ...
  ]
}
```

#### 5. Revert State to Version
```http
POST /api/state/{workspace_id}/{panel_id}/revert
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "targetVersion": 10,
  "createSnapshot": true
}

Response 200:
{
  "success": true,
  "version": 16,  // New version after revert
  "revertedTo": 10,
  "snapshotId": "660e8400-...",
  "updatedAt": "2025-12-19T12:35:00Z"
}
```

#### 6. Get Workspace State Snapshot
```http
GET /api/state/{workspace_id}/snapshot
Authorization: Bearer <jwt>

Query Parameters:
  - git_commit: string (optional, get state at specific commit)

Response 200:
{
  "workspaceId": "ws_456",
  "panels": {
    "panel_789": {
      "$state": { "counter": 43 },
      "version": 15
    },
    "panel_790": {
      "$state": { "message": "Hello" },
      "version": 3
    }
  },
  "totalPanels": 2,
  "snapshotAt": "2025-12-19T12:30:00Z",
  "gitCommit": "abc123def456"
}
```

#### 7. Create State Snapshot
```http
POST /api/state/{workspace_id}/snapshot
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "type": "manual",
  "description": "Before major AI refactor",
  "commitToGit": true
}

Response 201:
{
  "snapshotId": "660e8400-...",
  "panelCount": 5,
  "totalSizeBytes": 2048,
  "gitCommitHash": "def456abc789",
  "createdAt": "2025-12-19T12:40:00Z"
}
```

### WebSocket API

#### Connection
```
ws://nexus-state:8001/ws/state/{workspace_id}?token=<jwt>
```

#### Client → Server Messages

**Subscribe to Panel:**
```json
{
  "type": "subscribe",
  "panelId": "panel_789"
}
```

**Unsubscribe:**
```json
{
  "type": "unsubscribe",
  "panelId": "panel_789"
}
```

**Ping:**
```json
{
  "type": "ping"
}
```

#### Server → Client Messages

**State Update:**
```json
{
  "type": "state_update",
  "panelId": "panel_789",
  "patch": [
    { "op": "replace", "path": "/$state/counter", "value": 44 }
  ],
  "version": 16,
  "triggeredBy": "user",
  "timestamp": "2025-12-19T12:31:00Z"
}
```

**Full State Sync:**
```json
{
  "type": "state_sync",
  "panelId": "panel_789",
  "state": {
    "$state": { "counter": 44 },
    "$computed": { "todoCount": 2 }
  },
  "version": 16,
  "timestamp": "2025-12-19T12:31:00Z"
}
```

**Error:**
```json
{
  "type": "error",
  "code": "version_conflict",
  "message": "State version mismatch",
  "panelId": "panel_789"
}
```

---

## Implementation Plan

### Phase 1: Service Bootstrap (Week 1)

#### Task 1.1: Create Service Structure
```bash
mkdir -p runtime/nexus-state
cd runtime/nexus-state

# Create FastAPI application structure
mkdir -p nexus_state/{api,core,models,services,git,cache}
touch nexus_state/{__init__,main,database,config}.py
```

**Files to Create:**
```
runtime/nexus-state/
├── nexus_state/
│   ├── __init__.py
│   ├── main.py              # FastAPI app
│   ├── config.py            # Configuration
│   ├── database.py          # SQLAlchemy setup
│   ├── api/
│   │   ├── __init__.py
│   │   ├── state.py         # State CRUD endpoints
│   │   ├── history.py       # History endpoints
│   │   ├── snapshot.py      # Snapshot endpoints
│   │   └── websocket.py     # WebSocket handler
│   ├── core/
│   │   ├── __init__.py
│   │   ├── state_manager.py # Core state operations
│   │   ├── patch_engine.py  # JSON Patch + OT
│   │   └── validator.py     # State validation
│   ├── models/
│   │   ├── __init__.py
│   │   ├── panel_state.py   # SQLAlchemy models
│   │   └── schemas.py       # Pydantic schemas
│   ├── services/
│   │   ├── __init__.py
│   │   ├── redis_service.py # Redis cache
│   │   └── git_service.py   # Git operations
│   └── git/
│       └── sync.py          # Git state sync
├── tests/
├── pyproject.toml
├── requirements.txt
└── README.md
```

#### Task 1.2: Database Models
**File:** `runtime/nexus-state/nexus_state/models/panel_state.py`

```python
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from ..database import Base


class PanelState(Base):
    """Current state of a panel."""
    __tablename__ = "panel_states"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Identity
    user_id = Column(String(255), nullable=False)
    workspace_id = Column(String(255), nullable=False, index=True)
    panel_id = Column(String(255), nullable=False, index=True)

    # State data
    state_data = Column(JSONB, nullable=False)
    state_schema_version = Column(String(50), default="1.0.0")

    # Versioning
    version = Column(Integer, nullable=False, default=1)
    checksum = Column(String(64))

    # Metadata
    state_size_bytes = Column(Integer)
    state_variable_count = Column(Integer)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_accessed_at = Column(DateTime, default=datetime.utcnow)

    # Unique constraint
    __table_args__ = (
        Index('idx_user_workspace_panel', 'user_id', 'workspace_id', 'panel_id', unique=True),
        Index('idx_state_data_gin', 'state_data', postgresql_using='gin'),
    )


class StateHistory(Base):
    """Append-only history of state changes."""
    __tablename__ = "state_history"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Reference
    panel_state_id = Column(UUID(as_uuid=True), ForeignKey("panel_states.id"), nullable=False)
    user_id = Column(String(255), nullable=False)
    workspace_id = Column(String(255), nullable=False, index=True)
    panel_id = Column(String(255), nullable=False, index=True)

    # Change tracking
    change_type = Column(String(50), nullable=False)  # created, updated, deleted, reverted
    patch = Column(JSONB)  # JSON Patch
    previous_version = Column(Integer)
    new_version = Column(Integer)

    # Context
    triggered_by = Column(String(255))  # user, ai, system
    trigger_source = Column(String(255))  # handler name, etc.

    # Snapshot (optional)
    snapshot = Column(JSONB)

    # Metadata
    change_size_bytes = Column(Integer)

    # Timestamp
    occurred_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index('idx_panel_history', 'panel_state_id', 'occurred_at'),
    )


class StateSnapshot(Base):
    """Periodic workspace-wide state snapshots."""
    __tablename__ = "state_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Scope
    workspace_id = Column(String(255), nullable=False, index=True)
    snapshot_type = Column(String(50), nullable=False)  # manual, auto, pre_ai_edit

    # Snapshot data
    snapshot_data = Column(JSONB, nullable=False)
    panel_count = Column(Integer)
    total_size_bytes = Column(Integer)

    # Git integration
    git_commit_hash = Column(String(64), index=True)
    git_branch = Column(String(255), default="main")

    # Metadata
    description = Column(Text)
    created_by = Column(String(255))

    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
```

#### Task 1.3: Redis Service
**File:** `runtime/nexus-state/nexus_state/services/redis_service.py`

```python
import redis
import json
from typing import Optional, Dict, Any
from ..config import settings


class RedisService:
    """Redis cache for panel states."""

    def __init__(self):
        self.client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=settings.REDIS_DB,
            decode_responses=True
        )
        self.pubsub = self.client.pubsub()
        self.default_ttl = 1800  # 30 minutes

    def _state_key(self, workspace_id: str, panel_id: str) -> str:
        return f"state:{workspace_id}:{panel_id}"

    def _channel_name(self, workspace_id: str) -> str:
        return f"state-updates:{workspace_id}"

    async def get_state(self, workspace_id: str, panel_id: str) -> Optional[Dict[str, Any]]:
        """Get state from cache."""
        key = self._state_key(workspace_id, panel_id)
        data = self.client.get(key)
        if data:
            return json.loads(data)
        return None

    async def set_state(
        self,
        workspace_id: str,
        panel_id: str,
        state: Dict[str, Any],
        ttl: Optional[int] = None
    ):
        """Set state in cache."""
        key = self._state_key(workspace_id, panel_id)
        data = json.dumps(state)
        self.client.setex(key, ttl or self.default_ttl, data)

    async def invalidate_state(self, workspace_id: str, panel_id: str):
        """Remove state from cache."""
        key = self._state_key(workspace_id, panel_id)
        self.client.delete(key)

    async def publish_update(
        self,
        workspace_id: str,
        panel_id: str,
        patch: list,
        version: int
    ):
        """Publish state update to subscribers."""
        channel = self._channel_name(workspace_id)
        message = json.dumps({
            "panel_id": panel_id,
            "patch": patch,
            "version": version,
            "timestamp": datetime.utcnow().isoformat()
        })
        self.client.publish(channel, message)

    async def subscribe_workspace(self, workspace_id: str):
        """Subscribe to workspace state updates."""
        channel = self._channel_name(workspace_id)
        self.pubsub.subscribe(channel)
        return self.pubsub.listen()
```

#### Task 1.4: State Manager
**File:** `runtime/nexus-state/nexus_state/core/state_manager.py`

```python
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..models.panel_state import PanelState, StateHistory
from ..services.redis_service import RedisService
import hashlib
import json


class StateManager:
    """Core state management logic."""

    def __init__(self, db: AsyncSession, redis: RedisService):
        self.db = db
        self.redis = redis

    async def get_state(
        self,
        workspace_id: str,
        panel_id: str,
        version: Optional[int] = None
    ) -> Optional[Dict[str, Any]]:
        """Get panel state (cache-first)."""

        # Try cache first
        if version is None:  # Only cache latest version
            cached = await self.redis.get_state(workspace_id, panel_id)
            if cached:
                return cached

        # Fallback to database
        query = select(PanelState).where(
            PanelState.workspace_id == workspace_id,
            PanelState.panel_id == panel_id
        )
        result = await self.db.execute(query)
        panel_state = result.scalar_one_or_none()

        if not panel_state:
            return None

        # If specific version requested, get from history
        if version and version != panel_state.version:
            return await self._get_state_at_version(panel_state, version)

        # Update cache
        state_data = {
            "$state": panel_state.state_data.get("$state", {}),
            "$computed": panel_state.state_data.get("$computed", {}),
            "_meta": {
                "version": panel_state.version,
                "updated_at": panel_state.updated_at.isoformat()
            }
        }
        await self.redis.set_state(workspace_id, panel_id, state_data)

        return state_data

    async def update_state(
        self,
        workspace_id: str,
        panel_id: str,
        new_state: Dict[str, Any],
        version: int,
        triggered_by: str,
        trigger_source: Optional[str] = None
    ) -> Dict[str, Any]:
        """Update panel state with optimistic locking."""

        # Get current state
        query = select(PanelState).where(
            PanelState.workspace_id == workspace_id,
            PanelState.panel_id == panel_id
        )
        result = await self.db.execute(query)
        panel_state = result.scalar_one_or_none()

        if not panel_state:
            raise ValueError(f"Panel state not found: {panel_id}")

        # Check version (optimistic lock)
        if panel_state.version != version:
            raise ValueError(
                f"Version conflict: expected {version}, got {panel_state.version}"
            )

        # Calculate checksum
        state_json = json.dumps(new_state, sort_keys=True)
        checksum = hashlib.sha256(state_json.encode()).hexdigest()

        # Update database
        panel_state.state_data = new_state
        panel_state.version += 1
        panel_state.checksum = checksum
        panel_state.state_size_bytes = len(state_json)
        panel_state.updated_at = datetime.utcnow()

        # Record history
        history = StateHistory(
            panel_state_id=panel_state.id,
            user_id=panel_state.user_id,
            workspace_id=workspace_id,
            panel_id=panel_id,
            change_type="updated",
            previous_version=version,
            new_version=panel_state.version,
            triggered_by=triggered_by,
            trigger_source=trigger_source
        )
        self.db.add(history)

        await self.db.commit()

        # Update cache
        await self.redis.set_state(workspace_id, panel_id, {
            "$state": new_state.get("$state", {}),
            "$computed": new_state.get("$computed", {}),
            "_meta": {
                "version": panel_state.version,
                "updated_at": panel_state.updated_at.isoformat()
            }
        })

        return {
            "success": True,
            "version": panel_state.version,
            "updated_at": panel_state.updated_at
        }
```

### Phase 2: Git Integration (Week 2)

#### Task 2.1: Git State Sync Service
**File:** `runtime/nexus-state/nexus_state/services/git_service.py`

```python
import git
import json
import os
from pathlib import Path
from typing import Dict, Any
from ..config import settings


class GitStateService:
    """Git-based state persistence."""

    def __init__(self):
        self.workspace_root = Path(settings.GIT_WORKSPACE_ROOT)

    def _get_workspace_repo(self, workspace_id: str) -> git.Repo:
        """Get or create Git repo for workspace."""
        repo_path = self.workspace_root / workspace_id

        if not repo_path.exists():
            repo_path.mkdir(parents=True)
            repo = git.Repo.init(repo_path)

            # Initial commit
            readme = repo_path / "README.md"
            readme.write_text(f"# Workspace {workspace_id}\n\nState snapshots\n")
            repo.index.add(["README.md"])
            repo.index.commit("Initial commit")
        else:
            repo = git.Repo(repo_path)

        return repo

    async def save_snapshot(
        self,
        workspace_id: str,
        states: Dict[str, Dict[str, Any]],
        description: Optional[str] = None
    ) -> str:
        """Save state snapshot to Git."""
        repo = self._get_workspace_repo(workspace_id)
        repo_path = Path(repo.working_dir)

        # Create snapshots directory
        snapshots_dir = repo_path / "snapshots"
        snapshots_dir.mkdir(exist_ok=True)

        # Save each panel state
        for panel_id, state in states.items():
            panel_file = snapshots_dir / f"{panel_id}.json"
            panel_file.write_text(json.dumps(state, indent=2))

        # Stage all changes
        repo.index.add([str(snapshots_dir)])

        # Commit
        message = description or f"State snapshot at {datetime.utcnow().isoformat()}"
        commit = repo.index.commit(message)

        return commit.hexsha

    async def load_snapshot(
        self,
        workspace_id: str,
        commit_hash: Optional[str] = None
    ) -> Dict[str, Dict[str, Any]]:
        """Load state snapshot from Git."""
        repo = self._get_workspace_repo(workspace_id)

        if commit_hash:
            # Checkout specific commit (detached HEAD)
            repo.git.checkout(commit_hash)

        # Read all panel states
        snapshots_dir = Path(repo.working_dir) / "snapshots"
        states = {}

        if snapshots_dir.exists():
            for panel_file in snapshots_dir.glob("*.json"):
                panel_id = panel_file.stem
                state = json.loads(panel_file.read_text())
                states[panel_id] = state

        if commit_hash:
            # Return to main branch
            repo.git.checkout("main")

        return states
```

### Phase 3: K8s Deployment (Week 3)

#### Task 3.1: Docker Image
**File:** `runtime/nexus-state/Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY nexus_state ./nexus_state

# Create non-root user
RUN useradd -m -u 1000 nexus && chown -R nexus:nexus /app
USER nexus

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:8001/health')"

# Run application
CMD ["uvicorn", "nexus_state.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

#### Task 3.2: Kubernetes Deployment
**File:** `k8s/services/nexus-state/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nexus-state
  namespace: nexus
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nexus-state
  template:
    metadata:
      labels:
        app: nexus-state
    spec:
      containers:
      - name: nexus-state
        image: localhost:5001/nexus/nexus-state:latest
        ports:
        - containerPort: 8001
          name: http
        - containerPort: 8002
          name: websocket
        env:
        - name: DATABASE_URL
          value: "postgresql://nexus:nexus@postgres:5432/nexus_state"
        - name: REDIS_HOST
          value: "redis"
        - name: REDIS_PORT
          value: "6379"
        - name: GIT_WORKSPACE_ROOT
          value: "/app/state-snapshots"
        - name: JWT_SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: nexus-secrets
              key: jwt-secret
        resources:
          requests:
            cpu: "500m"
            memory: "512Mi"
          limits:
            cpu: "2000m"
            memory: "2Gi"
        volumeMounts:
        - name: state-snapshots
          mountPath: /app/state-snapshots
        livenessProbe:
          httpGet:
            path: /health
            port: 8001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8001
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: state-snapshots
        persistentVolumeClaim:
          claimName: nexus-state-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: nexus-state
  namespace: nexus
spec:
  selector:
    app: nexus-state
  ports:
  - name: http
    port: 8001
    targetPort: 8001
  - name: websocket
    port: 8002
    targetPort: 8002
  type: ClusterIP
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: nexus-state-pvc
  namespace: nexus
spec:
  accessModes:
  - ReadWriteMany
  resources:
    requests:
      storage: 10Gi
```

#### Task 3.3: Redis Deployment
**File:** `k8s/services/redis/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: nexus
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        resources:
          requests:
            cpu: "200m"
            memory: "256Mi"
          limits:
            cpu: "1000m"
            memory: "1Gi"
        volumeMounts:
        - name: redis-data
          mountPath: /data
      volumes:
      - name: redis-data
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: nexus
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
  type: ClusterIP
```

---

## Integration with Workspace-Kernel

### Update workspace-kernel to use nexus-state

**File:** `runtime/workspace-kernel/workspace_kernel/services/state_client.py` (NEW)

```python
import httpx
from typing import Dict, Any, Optional


class StateClient:
    """Client for nexus-state service."""

    def __init__(self, base_url: str = "http://nexus-state:8001"):
        self.base_url = base_url
        self.client = httpx.AsyncClient(base_url=base_url)

    async def get_state(
        self,
        workspace_id: str,
        panel_id: str,
        version: Optional[int] = None
    ) -> Dict[str, Any]:
        """Get panel state."""
        params = {"version": version} if version else {}
        response = await self.client.get(
            f"/api/state/{workspace_id}/{panel_id}",
            params=params
        )
        response.raise_for_status()
        return response.json()

    async def update_state(
        self,
        workspace_id: str,
        panel_id: str,
        state: Dict[str, Any],
        version: int,
        triggered_by: str = "user"
    ) -> Dict[str, Any]:
        """Update panel state."""
        response = await self.client.put(
            f"/api/state/{workspace_id}/{panel_id}",
            json={
                "state": state,
                "version": version,
                "triggeredBy": triggered_by
            }
        )
        response.raise_for_status()
        return response.json()
```

---

## Performance Targets

| Operation | Target | P95 | P99 |
|-----------|--------|-----|-----|
| Get State (cached) | < 5ms | 10ms | 20ms |
| Get State (uncached) | < 50ms | 100ms | 200ms |
| Update State | < 100ms | 200ms | 500ms |
| Patch State | < 80ms | 150ms | 300ms |
| Get History (50 items) | < 100ms | 200ms | 400ms |
| Create Snapshot | < 2s | 3s | 5s |
| Load Snapshot | < 1s | 2s | 3s |

---

## Success Criteria

- [ ] All panel state operations use nexus-state service
- [ ] State cache hit rate > 80%
- [ ] Average state read latency < 10ms (P95)
- [ ] Workspace snapshots committed to Git every 5 minutes
- [ ] State history queryable for time-travel debugging
- [ ] Concurrent updates handled without data loss
- [ ] WebSocket state subscriptions working
- [ ] Integration with AI context builder functional

---

## Conclusion

The `nexus-state` service provides a **high-performance, scalable, and reliable** state management layer for the Nexus platform. By separating state operations from workspace-kernel, we enable:

1. **Independent scaling** of state operations
2. **Sub-10ms state reads** via Redis caching
3. **Complete state history** for debugging and AI context
4. **Git-based persistence** for reproducibility
5. **Concurrent update handling** with conflict resolution

This architecture positions Nexus for **multi-user collaboration**, **advanced AI interactions**, and **production-grade reliability**.
