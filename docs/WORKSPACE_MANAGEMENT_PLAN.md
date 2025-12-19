# GraphStudio Workspace Management Implementation Plan

**Created:** 2025-12-19
**Status:** Planning Phase
**Target:** Phase 5.5 (between Phase 5 and Phase 6)

---

## Executive Summary

This plan outlines the implementation of multi-workspace management in GraphStudio frontend, integrating with the existing workspace-kernel backend APIs. The implementation will transform the current single-workspace UX into a workspace-centric application where users can manage multiple workspaces, each containing different panels.

**Key Changes:**
1. Landing page redesign with workspace launcher
2. Workspace context provider for state management
3. Workspace selector UI component
4. Empty workspace state handling
5. Panel-workspace binding enforcement
6. Remove hardcoded builtin panels

---

## Current State Analysis

### What Exists ✅

**Backend (workspace-kernel at `runtime/workspace-kernel/`):**
- ✅ Workspace data model (User → Workspace → Panel)
- ✅ Full CRUD API endpoints:
  - `POST /api/workspaces/` - Create workspace
  - `GET /api/workspaces/` - List user workspaces
  - `GET /api/workspaces/{workspace_id}` - Get workspace details
  - `GET /api/workspaces/{workspace_id}/commits` - Git history
- ✅ Panel-workspace relationship in database
- ✅ Git integration for version control
- ✅ WebSocket support per workspace (`/ws/{workspace_id}`)

**Backend (graphstudio-backend at `runtime/graphstudio-backend/`):**
- ✅ User authentication and JWT tokens
- ✅ Subscription management
- ✅ Marketplace stubs

**Frontend:**
- ✅ Auth system (JWT tokens via AuthContext)
- ✅ Panel system (StudioContext, PanelContainer, NXMLRenderer)
- ✅ NexusClient with basic workspace methods
- ✅ Landing page with GraphStudio text and animation
- ✅ AddPanelModal UI pattern (can be reused for workspace selector)

### What's Missing ❌

**Frontend:**
- ❌ Workspace context provider
- ❌ Workspace state management (current workspace, workspace list)
- ❌ Workspace selector UI
- ❌ Workspace creation modal
- ❌ Landing page workspace launcher buttons
- ❌ Empty workspace state UI
- ❌ Panel-workspace binding on creation
- ❌ Dynamic workspace_id in NXMLRenderer (currently hardcoded 'default')
- ❌ Workspace switching logic
- ❌ Conditional sidebar rendering (only when workspace is open)

**Backend:**
- ❌ Default workspace creation on user signup (currently users start with no workspaces)
- ❌ **Dedicated state management service** (currently no centralized panel state store)

### New Service Required: `nexus-state` 🆕

**Critical Addition:** A dedicated microservice for panel state management is needed (see `docs/STATE_MANAGEMENT_SERVICE.md` for full design).

**Why Separate State Service:**
1. **State is core to AI interaction** - Every AI suggestion modifies state, every context build reads state
2. **Performance requirements** - Sub-10ms state reads via Redis caching
3. **Scalability** - State operations can scale independently from workspace-kernel
4. **State history** - Git-based state snapshots for time-travel debugging
5. **Conflict resolution** - Handle concurrent updates (user + AI) safely

**Key Features:**
- Redis cache layer (< 10ms reads, 80%+ cache hit rate)
- PostgreSQL persistent store with full history
- Git-based state snapshots (every 5 minutes)
- JSON Patch support for efficient updates
- WebSocket state subscriptions per workspace
- Optimistic locking for concurrent updates
- State → AI context builder integration

**Implementation Status:** To be implemented in parallel with workspace management (Phase 5.5)

**Service Location:** `runtime/nexus-state/`

**Database Schema:**
```
panel_states: user_id, workspace_id, panel_id → state_data (JSONB)
state_history: append-only log of all state changes
state_snapshots: periodic workspace-wide snapshots
```

**API Endpoints:**
- `GET /api/state/{workspace_id}/{panel_id}` - Get state (cached)
- `PUT /api/state/{workspace_id}/{panel_id}` - Update state (with version lock)
- `PATCH /api/state/{workspace_id}/{panel_id}` - Patch state (JSON Patch)
- `GET /api/state/{workspace_id}/{panel_id}/history` - Get state history
- `POST /api/state/{workspace_id}/{panel_id}/revert` - Revert to version
- `GET /api/state/{workspace_id}/snapshot` - Get workspace snapshot
- `POST /api/state/{workspace_id}/snapshot` - Create snapshot

**Integration:** workspace-kernel will call nexus-state via internal gRPC/HTTP for all state operations.

---

## Architecture Design

### State Management Architecture

```
Frontend (React)
┌─────────────────────────────────────────────────────────────┐
│                        App.jsx                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │             AuthProvider (existing)                   │  │
│  │  ┌───────────────────────────────────────────────┐   │  │
│  │  │        WorkspaceProvider (NEW)                 │   │  │
│  │  │  - currentWorkspace                           │   │  │
│  │  │  - workspaceList                              │   │  │
│  │  │  - loadWorkspaces()                           │   │  │
│  │  │  - openWorkspace(id)                          │   │  │
│  │  │  - createWorkspace(name)                      │   │  │
│  │  │  - closeWorkspace()                           │   │  │
│  │  │                                                │   │  │
│  │  │  ┌────────────────────────────────────────┐  │   │  │
│  │  │  │     NexusProvider (existing)           │  │   │  │
│  │  │  │  - WebSocket per workspace             │  │   │  │
│  │  │  │                                         │  │   │  │
│  │  │  │  ┌─────────────────────────────────┐  │  │   │  │
│  │  │  │  │  StudioProvider (existing)      │  │  │   │  │
│  │  │  │  │  - panels (for current ws)      │  │  │   │  │
│  │  │  │  │  - addPanel()                   │  │  │   │  │
│  │  │  │  │  - removePanel()                │  │  │   │  │
│  │  │  │  └─────────────────────────────────┘  │  │   │  │
│  │  │  └────────────────────────────────────────┘  │   │  │
│  │  └───────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP/WebSocket
                           ▼
Backend (Python)
┌─────────────────────────────────────────────────────────────┐
│                   graphstudio-backend                        │
│                  (runtime/graphstudio-backend/)              │
│             - Auth (JWT)  - Subscriptions                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    workspace-kernel                          │
│                 (runtime/workspace-kernel/)                  │
│  - Workspaces  - Panels  - NXML Parsing  - NOG              │
└───────┬──────────────────────────────────────┬──────────────┘
        │                                      │
        │ Panel State Operations               │ Panel Metadata
        │ (via gRPC/HTTP)                     │
        ▼                                      ▼
┌───────────────────────┐          ┌─────────────────────────┐
│    nexus-state        │          │     PostgreSQL          │
│ (runtime/nexus-state/)│          │  (workspace metadata)   │
│                       │          └─────────────────────────┘
│ - State CRUD API      │
│ - Redis Cache         │          ┌─────────────────────────┐
│ - Git Snapshots       │          │     PostgreSQL          │
│ - State History       │◄────────►│   (state storage)       │
│ - Version Control     │          └─────────────────────────┘
│ - Conflict Resolution │
└───────┬───────────────┘          ┌─────────────────────────┐
        │                          │       Redis             │
        └─────────────────────────►│   (state cache)         │
                                   └─────────────────────────┘
```

### User Flow States

```
┌─────────────────────────────────────────────────────────────┐
│                    User Sign In                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Landing Page (No Workspace Open)                │
│                                                              │
│         ╔═══════════════════════════════════╗               │
│         ║      GraphStudio Animation        ║               │
│         ║       (3D Background)              ║               │
│         ╚═══════════════════════════════════╝               │
│                                                              │
│              [Open Workspace] [Build from Scratch]          │
│                                                              │
│  ❌ NO SIDEBAR                                               │
└─────────────┬──────────────────────────┬────────────────────┘
              │                          │
              │                          │
      "Open Workspace"           "Build from Scratch"
              │                          │
              ▼                          ▼
┌─────────────────────────────┐  ┌─────────────────────────────┐
│   Workspace Selector Modal   │  │   Create Empty Workspace    │
│                              │  │  (Auto-generate name)       │
│  ┌────────────────────────┐ │  └──────────────┬──────────────┘
│  │ My Workspace 1     [→] │ │                 │
│  │ Design Prototype   [→] │ │                 │
│  │ AI Research        [→] │ │                 │
│  └────────────────────────┘ │                 │
│                              │                 │
│  [+ Create New Workspace]   │                 │
└──────────────┬───────────────┘                 │
               │                                 │
               └─────────────┬───────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Workspace Open (Has currentWorkspace)           │
│                                                              │
│  ┌───────┐  ┌─────────────────────────────────────────────┐│
│  │ ✅     │  │                                             ││
│  │SIDEBAR│  │         Workspace Canvas                    ││
│  │       │  │                                             ││
│  │ [+]   │  │  IF panels.length === 0:                    ││
│  │       │  │    Show "No Active Panel" notice            ││
│  │ User  │  │    (Replaces GraphStudio text)             ││
│  │ Profile│  │                                             ││
│  └───────┘  │  ELSE:                                      ││
│             │    Render panels                            ││
│             └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Backend Enhancements ⚙️

**Goal:** Ensure workspace-kernel is ready for frontend integration.

#### Task 1.1: Add Default Workspace Creation on Signup

**File:** `runtime/graphstudio-backend/routers/auth.py`

**Changes:**
```python
# After creating user in signup endpoint
# Call workspace-kernel to create default workspace
async with httpx.AsyncClient() as client:
    response = await client.post(
        f"{WORKSPACE_KERNEL_URL}/api/workspaces/",
        json={
            "name": "My First Workspace",
            "description": "Your default workspace"
        },
        headers={"Authorization": f"Bearer {access_token}"}
    )
```

**Rationale:** Users should have at least one workspace to start with.

#### Task 1.2: Update Panel Creation to Require workspace_id

**File:** `runtime/workspace-kernel/workspace_kernel/api/panels.py`

**Current:**
```python
@router.post("/api/panels/", response_model=PanelResponse)
async def create_panel(
    request: CreatePanelRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # workspace_id is optional in CreatePanelRequest
    workspace_id = request.workspace_id or "default"
```

**Change:** Make `workspace_id` required in Pydantic schema:
```python
class CreatePanelRequest(BaseModel):
    workspace_id: str  # Remove Optional, make required
    nxml_source: str
    name: Optional[str] = None
```

**Rationale:** All panels must belong to a workspace. No more "default" fallback.

#### Task 1.3: Add Workspace Active Status Endpoint

**File:** `runtime/workspace-kernel/workspace_kernel/api/workspaces.py`

**New Endpoint:**
```python
@router.post("/api/workspaces/{workspace_id}/activate")
async def activate_workspace(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark workspace as active (load panels into runtime)"""
    # Update workspace status
    # Initialize runtime resources
    # Return workspace with panel list
```

**Rationale:** Track which workspace is currently active for resource management.

---

### Phase 2: Frontend State Management 🔄

**Goal:** Create workspace context and state management infrastructure.

#### Task 2.1: Create WorkspaceContext Provider

**File:** `apps/GraphStudio/src/context/WorkspaceContext.tsx` (NEW)

```typescript
import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useNexusClient } from './NexusContext';

interface Workspace {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'suspended' | 'archived';
  panelCount: number;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceContextType {
  // State
  currentWorkspace: Workspace | null;
  workspaceList: Workspace[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadWorkspaces: () => Promise<void>;
  openWorkspace: (workspaceId: string) => Promise<void>;
  createWorkspace: (name: string, description?: string) => Promise<Workspace>;
  closeWorkspace: () => void;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  renameWorkspace: (workspaceId: string, newName: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const nexusClient = useNexusClient();

  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [workspaceList, setWorkspaceList] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load user's workspaces on mount (if authenticated)
  useEffect(() => {
    if (user) {
      loadWorkspaces();
    } else {
      setCurrentWorkspace(null);
      setWorkspaceList([]);
    }
  }, [user]);

  const loadWorkspaces = async () => {
    if (!nexusClient) return;

    setIsLoading(true);
    setError(null);
    try {
      const workspaces = await nexusClient.listWorkspaces();
      setWorkspaceList(workspaces);
    } catch (err) {
      setError(err.message);
      console.error('Failed to load workspaces:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openWorkspace = async (workspaceId: string) => {
    if (!nexusClient) return;

    setIsLoading(true);
    setError(null);
    try {
      // Get workspace details
      const workspace = await nexusClient.getWorkspace(workspaceId);

      // Activate workspace in backend (load runtime resources)
      await nexusClient.activateWorkspace(workspaceId);

      // Set as current
      setCurrentWorkspace(workspace);

      // Store in localStorage for persistence
      localStorage.setItem('lastOpenedWorkspace', workspaceId);
    } catch (err) {
      setError(err.message);
      console.error('Failed to open workspace:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const createWorkspace = async (name: string, description?: string) => {
    if (!nexusClient) throw new Error('NexusClient not initialized');

    setIsLoading(true);
    setError(null);
    try {
      const workspace = await nexusClient.createWorkspace(name, description);

      // Refresh workspace list
      await loadWorkspaces();

      return workspace;
    } catch (err) {
      setError(err.message);
      console.error('Failed to create workspace:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const closeWorkspace = () => {
    setCurrentWorkspace(null);
    localStorage.removeItem('lastOpenedWorkspace');
  };

  const deleteWorkspace = async (workspaceId: string) => {
    if (!nexusClient) return;

    try {
      await nexusClient.deleteWorkspace(workspaceId);

      // If deleted workspace is current, close it
      if (currentWorkspace?.id === workspaceId) {
        closeWorkspace();
      }

      // Refresh list
      await loadWorkspaces();
    } catch (err) {
      setError(err.message);
      console.error('Failed to delete workspace:', err);
      throw err;
    }
  };

  const renameWorkspace = async (workspaceId: string, newName: string) => {
    if (!nexusClient) return;

    try {
      await nexusClient.updateWorkspace(workspaceId, { name: newName });

      // Update current workspace if it's the one being renamed
      if (currentWorkspace?.id === workspaceId) {
        setCurrentWorkspace({ ...currentWorkspace, name: newName });
      }

      // Refresh list
      await loadWorkspaces();
    } catch (err) {
      setError(err.message);
      console.error('Failed to rename workspace:', err);
      throw err;
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        workspaceList,
        isLoading,
        error,
        loadWorkspaces,
        openWorkspace,
        createWorkspace,
        closeWorkspace,
        deleteWorkspace,
        renameWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
}
```

#### Task 2.2: Update NexusClient with Workspace Methods

**File:** `apps/GraphStudio/src/api/NexusClient.ts`

**Add Methods:**
```typescript
class NexusClient {
  // ... existing methods ...

  async listWorkspaces(): Promise<Workspace[]> {
    const response = await this.http.get('/api/workspaces/');
    return response.data;
  }

  async getWorkspace(workspaceId: string): Promise<Workspace> {
    const response = await this.http.get(`/api/workspaces/${workspaceId}`);
    return response.data;
  }

  async createWorkspace(name: string, description?: string): Promise<Workspace> {
    const response = await this.http.post('/api/workspaces/', {
      name,
      description,
    });
    return response.data;
  }

  async activateWorkspace(workspaceId: string): Promise<void> {
    await this.http.post(`/api/workspaces/${workspaceId}/activate`);
  }

  async updateWorkspace(
    workspaceId: string,
    updates: { name?: string; description?: string }
  ): Promise<Workspace> {
    const response = await this.http.patch(`/api/workspaces/${workspaceId}`, updates);
    return response.data;
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await this.http.delete(`/api/workspaces/${workspaceId}`);
  }

  async getWorkspaceCommits(workspaceId: string): Promise<CommitInfo[]> {
    const response = await this.http.get(`/api/workspaces/${workspaceId}/commits`);
    return response.data;
  }
}
```

#### Task 2.3: Update StudioContext to Use Current Workspace

**File:** `apps/GraphStudio/src/context/StudioContext.jsx`

**Changes:**
1. Remove `initializeWorkspace()` method (no more builtin panels)
2. Add `loadWorkspacePanels(workspaceId)` method
3. Update `addPanel()` to require workspace_id
4. Add workspace_id validation before panel operations

```javascript
// Add at top of StudioProvider
import { useWorkspace } from './WorkspaceContext';

function StudioProvider({ children }) {
  const { currentWorkspace } = useWorkspace();
  const nexusClient = useNexusClient();

  // ... existing state ...

  // Load panels for current workspace
  useEffect(() => {
    if (currentWorkspace?.id) {
      loadWorkspacePanels(currentWorkspace.id);
    } else {
      // Clear panels when no workspace is open
      setPanels([]);
    }
  }, [currentWorkspace?.id]);

  const loadWorkspacePanels = async (workspaceId) => {
    if (!nexusClient) return;

    try {
      // Fetch panels for workspace from backend
      const workspacePanels = await nexusClient.getWorkspacePanels(workspaceId);

      // Transform to studio panel format
      const transformedPanels = workspacePanels.map((p) => ({
        id: p.id,
        panelTypeId: p.panel_type,
        title: p.name,
        mode: 'flexible',
        state: {},
        order: 0,
        isAIObserving: false,
      }));

      setPanels(transformedPanels);
    } catch (err) {
      console.error('Failed to load workspace panels:', err);
    }
  };

  // Update addPanel to require workspace
  const addPanel = async (panelTypeId, initialState = {}) => {
    if (!currentWorkspace) {
      console.error('Cannot add panel: No workspace open');
      return null;
    }

    // Create panel in backend with workspace_id
    const panel = await nexusClient.createPanel({
      workspace_id: currentWorkspace.id,
      panel_type: panelTypeId,
      nxml_source: '', // TODO: Get from marketplace or template
      ...initialState,
    });

    // Add to local state
    const newPanel = {
      id: panel.id,
      panelTypeId,
      title: initialState.title || panelTypeId,
      mode: 'flexible',
      state: initialState,
      order: panels.length,
      isAIObserving: false,
    };

    setPanels((prev) => [...prev, newPanel]);
    return newPanel.id;
  };

  // Remove initializeWorkspace() entirely

  // ... rest of StudioContext ...
}
```

#### Task 2.4: Update App.jsx with Context Hierarchy

**File:** `apps/GraphStudio/src/App.jsx`

**Changes:**
```jsx
import { WorkspaceProvider } from './context/WorkspaceContext';

function App() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <NexusProvider>
          <StudioProvider>
            <Router>
              {/* Routes */}
            </Router>
          </StudioProvider>
        </NexusProvider>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
```

---

### Phase 3: Landing Page Redesign 🎨

**Goal:** Implement workspace launcher UI on landing page.

#### Task 3.1: Create WorkspaceLauncher Component

**File:** `apps/GraphStudio/src/components/WorkspaceLauncher.tsx` (NEW)

```typescript
import { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { motion } from 'framer-motion';

export function WorkspaceLauncher() {
  const { createWorkspace, openWorkspace } = useWorkspace();
  const [showSelector, setShowSelector] = useState(false);

  const handleBuildFromScratch = async () => {
    try {
      // Generate default name: "Workspace - Dec 19, 2025"
      const date = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const name = `Workspace - ${date}`;

      // Create empty workspace
      const workspace = await createWorkspace(name);

      // Open it (this will trigger navigation to workspace view)
      await openWorkspace(workspace.id);
    } catch (err) {
      console.error('Failed to create workspace:', err);
    }
  };

  const handleOpenWorkspace = () => {
    setShowSelector(true);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      {/* GraphStudio Animation Background */}
      <div className="absolute inset-0 z-0">
        {/* Existing Three.js animation */}
      </div>

      {/* Main Content */}
      <div className="relative z-10 text-center">
        <motion.h1
          className="text-6xl font-bold text-white mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          GraphStudio<span className="text-blue-400">_</span>
        </motion.h1>

        <motion.div
          className="flex gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <button
            onClick={handleOpenWorkspace}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Open Workspace
          </button>

          <button
            onClick={handleBuildFromScratch}
            className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
          >
            Build from Scratch
          </button>
        </motion.div>
      </div>

      {/* Workspace Selector Modal */}
      {showSelector && (
        <WorkspaceSelectorModal onClose={() => setShowSelector(false)} />
      )}
    </div>
  );
}
```

#### Task 3.2: Create WorkspaceSelectorModal Component

**File:** `apps/GraphStudio/src/components/WorkspaceSelectorModal.tsx` (NEW)

```typescript
import { useState, useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, PlusIcon, FolderIcon } from '@heroicons/react/24/outline';

interface WorkspaceSelectorModalProps {
  onClose: () => void;
}

export function WorkspaceSelectorModal({ onClose }: WorkspaceSelectorModalProps) {
  const { workspaceList, isLoading, openWorkspace } = useWorkspace();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleSelectWorkspace = async (workspaceId: string) => {
    try {
      await openWorkspace(workspaceId);
      onClose(); // Close modal after successful open
    } catch (err) {
      console.error('Failed to open workspace:', err);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-gray-800 rounded-lg shadow-xl w-[600px] max-h-[70vh] overflow-hidden"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <h2 className="text-2xl font-bold text-white">Open Workspace</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Workspace List */}
          <div className="p-6 overflow-y-auto max-h-[400px]">
            {isLoading ? (
              <div className="text-center text-gray-400">Loading workspaces...</div>
            ) : workspaceList.length === 0 ? (
              <div className="text-center text-gray-400">
                No workspaces found. Create one to get started!
              </div>
            ) : (
              <div className="space-y-3">
                {workspaceList.map((workspace) => (
                  <button
                    key={workspace.id}
                    onClick={() => handleSelectWorkspace(workspace.id)}
                    className="w-full flex items-center gap-4 p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-left"
                  >
                    <FolderIcon className="w-8 h-8 text-blue-400 flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-white">
                        {workspace.name}
                      </h3>
                      {workspace.description && (
                        <p className="text-sm text-gray-400 mt-1">
                          {workspace.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {workspace.panelCount} panel{workspace.panelCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-gray-400">→</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-700">
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Create New Workspace
            </button>
          </div>
        </motion.div>
      </motion.div>

      {/* Create Workspace Modal (nested) */}
      {showCreateModal && (
        <CreateWorkspaceModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            // Workspace list will auto-refresh via context
          }}
        />
      )}
    </AnimatePresence>
  );
}
```

#### Task 3.3: Create CreateWorkspaceModal Component

**File:** `apps/GraphStudio/src/components/CreateWorkspaceModal.tsx` (NEW)

```typescript
import { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface CreateWorkspaceModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateWorkspaceModal({ onClose, onSuccess }: CreateWorkspaceModalProps) {
  const { createWorkspace, openWorkspace } = useWorkspace();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Workspace name is required');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const workspace = await createWorkspace(name.trim(), description.trim() || undefined);
      await openWorkspace(workspace.id);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create workspace');
      setIsCreating(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-gray-800 rounded-lg shadow-xl w-[500px]"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <h2 className="text-2xl font-bold text-white">Create New Workspace</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label htmlFor="workspace-name" className="block text-sm font-medium text-gray-300 mb-2">
                Workspace Name *
              </label>
              <input
                id="workspace-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Workspace"
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="workspace-description" className="block text-sm font-medium text-gray-300 mb-2">
                Description (optional)
              </label>
              <textarea
                id="workspace-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A workspace for..."
                rows={3}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm">{error}</div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Creating...' : 'Create & Open'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
```

#### Task 3.4: Update Shell.jsx to Conditional Render

**File:** `apps/GraphStudio/src/components/Shell.jsx`

**Changes:**
```jsx
import { useWorkspace } from '../context/WorkspaceContext';
import { WorkspaceLauncher } from './WorkspaceLauncher';

export function Shell() {
  const { currentWorkspace } = useWorkspace();

  // If no workspace is open, show launcher
  if (!currentWorkspace) {
    return <WorkspaceLauncher />;
  }

  // Otherwise, show normal workspace UI
  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar (only when workspace is open) */}
      <Sidebar />

      {/* Main Workspace Area */}
      <div className="flex-1 relative">
        <Workspace />
      </div>

      {/* Modals, Command Palette, etc. */}
      {/* ... existing modal rendering ... */}
    </div>
  );
}
```

---

### Phase 4: Empty Workspace State 📭

**Goal:** Handle UI when workspace is open but has no panels.

#### Task 4.1: Create EmptyWorkspaceState Component

**File:** `apps/GraphStudio/src/components/EmptyWorkspaceState.tsx` (NEW)

```typescript
import { motion } from 'framer-motion';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useStudio } from '../context/StudioContext';

export function EmptyWorkspaceState() {
  const { setAddPanelModalOpen } = useStudio();

  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="text-center max-w-md">
        <h2 className="text-4xl font-bold text-gray-400 mb-4">
          No Active Panels
        </h2>
        <p className="text-gray-500 mb-8">
          This workspace is empty. Add panels from your library or install new ones from the marketplace.
        </p>
        <button
          onClick={() => setAddPanelModalOpen(true)}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          Add Panel
        </button>
      </div>
    </motion.div>
  );
}
```

#### Task 4.2: Update Workspace.jsx to Show Empty State

**File:** `apps/GraphStudio/src/components/Workspace.jsx`

**Changes:**
```jsx
import { EmptyWorkspaceState } from './EmptyWorkspaceState';

export function Workspace() {
  const { panels, activeFullscreenId } = useStudio();

  // Filter visible panels
  const visiblePanels = panels.filter((p) => p.mode !== 'hidden');

  // Show empty state if no visible panels
  if (visiblePanels.length === 0) {
    return (
      <div className="h-full">
        <EmptyWorkspaceState />
      </div>
    );
  }

  // Show fullscreen panel
  if (activeFullscreenId) {
    const fullscreenPanel = panels.find((p) => p.id === activeFullscreenId);
    return (
      <div className="h-full">
        <PanelContainer panel={fullscreenPanel} />
      </div>
    );
  }

  // Show flexible layout
  return (
    <div className="h-full p-4 overflow-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visiblePanels.map((panel) => (
          <PanelContainer key={panel.id} panel={panel} />
        ))}
      </div>
    </div>
  );
}
```

---

### Phase 5: Sidebar Workspace Controls 🎛️

**Goal:** Add workspace switcher and info to sidebar.

#### Task 5.1: Add Workspace Header to Sidebar

**File:** `apps/GraphStudio/src/components/Sidebar.jsx`

**Changes:**
```jsx
import { useWorkspace } from '../context/WorkspaceContext';
import { ChevronDownIcon, CogIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

export function Sidebar() {
  const { currentWorkspace } = useWorkspace();
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);

  return (
    <div className="w-20 bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* Workspace Header */}
      <div className="p-4 border-b border-gray-700">
        <button
          onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
          className="w-full flex flex-col items-center gap-2 p-2 hover:bg-gray-700 rounded-lg transition-colors group relative"
        >
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
            {currentWorkspace?.name.charAt(0).toUpperCase() || 'W'}
          </div>
          <div className="text-xs text-gray-400 truncate w-full text-center">
            {currentWorkspace?.name || 'Workspace'}
          </div>
          <ChevronDownIcon className="w-4 h-4 text-gray-500 group-hover:text-gray-300" />

          {/* Workspace Dropdown Menu */}
          {showWorkspaceMenu && (
            <WorkspaceDropdownMenu
              onClose={() => setShowWorkspaceMenu(false)}
            />
          )}
        </button>
      </div>

      {/* Panel Icons */}
      <div className="flex-1 overflow-y-auto py-4">
        {/* ... existing panel icons ... */}
      </div>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-gray-700">
        {/* ... existing user profile ... */}
      </div>
    </div>
  );
}
```

#### Task 5.2: Create WorkspaceDropdownMenu Component

**File:** `apps/GraphStudio/src/components/WorkspaceDropdownMenu.tsx` (NEW)

```typescript
import { useWorkspace } from '../context/WorkspaceContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRightOnRectangleIcon,
  PlusIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

interface WorkspaceDropdownMenuProps {
  onClose: () => void;
}

export function WorkspaceDropdownMenu({ onClose }: WorkspaceDropdownMenuProps) {
  const { currentWorkspace, workspaceList, openWorkspace, closeWorkspace } = useWorkspace();

  const handleSwitchWorkspace = async (workspaceId: string) => {
    await openWorkspace(workspaceId);
    onClose();
  };

  const handleNewWorkspace = () => {
    // Open create workspace modal
    // TODO: Trigger modal from global state
    onClose();
  };

  const handleCloseWorkspace = () => {
    closeWorkspace();
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        className="absolute left-full ml-2 top-0 w-64 bg-gray-700 rounded-lg shadow-xl overflow-hidden z-50"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
      >
        <div className="p-2">
          <div className="text-xs text-gray-400 px-3 py-2">Switch Workspace</div>

          {workspaceList.map((workspace) => (
            <button
              key={workspace.id}
              onClick={() => handleSwitchWorkspace(workspace.id)}
              className={`w-full text-left px-3 py-2 rounded hover:bg-gray-600 transition-colors ${
                workspace.id === currentWorkspace?.id ? 'bg-gray-600' : ''
              }`}
            >
              <div className="text-sm text-white font-medium">{workspace.name}</div>
              <div className="text-xs text-gray-400">{workspace.panelCount} panels</div>
            </button>
          ))}

          <div className="border-t border-gray-600 my-2"></div>

          <button
            onClick={handleNewWorkspace}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-gray-600 rounded transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New Workspace
          </button>

          <button
            onClick={handleCloseWorkspace}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-gray-600 rounded transition-colors"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4" />
            Close Workspace
          </button>

          <button
            onClick={() => {/* TODO: Open workspace settings */}}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-gray-600 rounded transition-colors"
          >
            <Cog6ToothIcon className="w-4 h-4" />
            Workspace Settings
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
```

---

### Phase 6: Panel-Workspace Integration 🔗

**Goal:** Ensure all panel operations respect workspace context.

#### Task 6.1: Update NXMLRenderer to Use Current Workspace

**File:** `apps/GraphStudio/src/components/NXMLRenderer.tsx`

**Current Code:**
```typescript
const workspaceId = 'default'; // Hardcoded
```

**Change to:**
```typescript
import { useWorkspace } from '../context/WorkspaceContext';

export function NXMLRenderer({ panel }: { panel: Panel }) {
  const { currentWorkspace } = useWorkspace();

  if (!currentWorkspace) {
    return <div>No workspace selected</div>;
  }

  const workspaceId = currentWorkspace.id;

  // ... rest of renderer logic ...
}
```

#### Task 6.2: Update AddPanelModal to Create Panels with workspace_id

**File:** `apps/GraphStudio/src/components/AddPanelModal.tsx`

**Changes:**
```typescript
import { useWorkspace } from '../context/WorkspaceContext';

export function AddPanelModal({ isOpen, onClose }: AddPanelModalProps) {
  const { currentWorkspace } = useWorkspace();
  const { addPanelToWorkspace } = useStudio();

  const handleAddPanel = async (panelId: string) => {
    if (!currentWorkspace) {
      console.error('No workspace selected');
      return;
    }

    await addPanelToWorkspace(panelId, currentWorkspace.id);
    onClose();
  };

  // ... rest of modal ...
}
```

#### Task 6.3: Update StudioContext addPanelToWorkspace Method

**File:** `apps/GraphStudio/src/context/StudioContext.jsx`

**Changes:**
```javascript
const addPanelToWorkspace = async (panelId, workspaceId) => {
  if (!workspaceId) {
    throw new Error('workspace_id is required');
  }

  try {
    // Fetch panel from marketplace
    const marketplacePanel = availablePanels.find((p) => p.id === panelId);
    if (!marketplacePanel) {
      throw new Error('Panel not found in marketplace');
    }

    // Create panel instance in workspace-kernel
    const panelInstance = await nexusClient.createPanel({
      workspace_id: workspaceId,
      nxml_source: marketplacePanel.nxmlSource,
      name: marketplacePanel.name,
      panel_type: marketplacePanel.id,
    });

    // Add to local state with marketplace metadata
    const newPanel = {
      id: panelInstance.id,
      panelTypeId: marketplacePanel.id,
      title: marketplacePanel.name,
      mode: 'flexible',
      state: {},
      order: panels.length,
      isAIObserving: false,
      _marketplace: marketplacePanel,
    };

    setPanels((prev) => [...prev, newPanel]);
    setInstalledPanels((prev) => [...prev, marketplacePanel]);

    return panelInstance.id;
  } catch (err) {
    console.error('Failed to add panel to workspace:', err);
    throw err;
  }
};
```

---

### Phase 7: Testing & Polish 🧪

**Goal:** Ensure all features work correctly and handle edge cases.

#### Task 7.1: Test Scenarios

**Test Cases:**
1. ✅ New user signup creates default workspace
2. ✅ User can create multiple workspaces
3. ✅ User can switch between workspaces
4. ✅ Panels persist in correct workspace
5. ✅ "Build from Scratch" creates empty workspace
6. ✅ Empty workspace shows "No Active Panels" message
7. ✅ Closing workspace returns to launcher
8. ✅ Sidebar only visible when workspace is open
9. ✅ WebSocket connects to correct workspace
10. ✅ Panel state updates isolated per workspace
11. ✅ Last opened workspace remembered (localStorage)
12. ✅ Workspace deletion works (and closes if current)
13. ✅ Workspace rename updates everywhere
14. ✅ K8s ingress routing works correctly
15. ✅ Multi-user workspaces don't interfere

#### Task 7.2: Error Handling

**Add Error Boundaries:**
```typescript
// WorkspaceErrorBoundary.tsx
class WorkspaceErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-gray-900">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-4">
              Workspace Error
            </h1>
            <p className="text-gray-400 mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

#### Task 7.3: Loading States

**Add Loading Indicators:**
- Workspace list loading spinner
- Workspace switching transition
- Panel creation progress
- Empty state skeleton screens

#### Task 7.4: Accessibility

**ARIA Labels:**
- Add `aria-label` to all buttons
- Keyboard navigation for workspace selector
- Focus management in modals
- Screen reader announcements for state changes

---

## File Change Summary

### New Files (10)
1. `apps/GraphStudio/src/context/WorkspaceContext.tsx`
2. `apps/GraphStudio/src/components/WorkspaceLauncher.tsx`
3. `apps/GraphStudio/src/components/WorkspaceSelectorModal.tsx`
4. `apps/GraphStudio/src/components/CreateWorkspaceModal.tsx`
5. `apps/GraphStudio/src/components/EmptyWorkspaceState.tsx`
6. `apps/GraphStudio/src/components/WorkspaceDropdownMenu.tsx`
7. `apps/GraphStudio/src/components/WorkspaceErrorBoundary.tsx`
8. `apps/GraphStudio/src/types/workspace.ts` (TypeScript types)
9. `apps/GraphStudio/src/hooks/useWorkspace.ts` (convenience hook)
10. `docs/WORKSPACE_MANAGEMENT_PLAN.md` (this document)

### Modified Files (12)

**Frontend:**
1. `apps/GraphStudio/src/App.jsx` - Add WorkspaceProvider
2. `apps/GraphStudio/src/components/Shell.jsx` - Conditional rendering
3. `apps/GraphStudio/src/components/Sidebar.jsx` - Workspace header
4. `apps/GraphStudio/src/components/Workspace.jsx` - Empty state
5. `apps/GraphStudio/src/components/NXMLRenderer.tsx` - Dynamic workspace_id
6. `apps/GraphStudio/src/components/AddPanelModal.tsx` - workspace_id param
7. `apps/GraphStudio/src/context/StudioContext.jsx` - Remove initializeWorkspace, add loadWorkspacePanels
8. `apps/GraphStudio/src/api/NexusClient.ts` - Add workspace methods

**Backend:**
9. `runtime/graphstudio-backend/routers/auth.py` - Create default workspace on signup
10. `runtime/workspace-kernel/workspace_kernel/api/panels.py` - Make workspace_id required
11. `runtime/workspace-kernel/workspace_kernel/api/workspaces.py` - Add activate endpoint
12. `runtime/workspace-kernel/workspace_kernel/schemas.py` - Update panel schemas

### No Changes Required (K8s)
- ✅ Ingress configuration already correct
- ✅ Service endpoints already configured
- ✅ Environment variables already set

---

## Implementation Timeline

### Week 1: Backend + State Management
- **Days 1-2:** Backend enhancements (Phase 1)
  - graphstudio-backend: Create default workspace on signup
  - workspace-kernel: Make workspace_id required for panels
- **Days 3-5:** WorkspaceContext and state management (Phase 2)
  - Frontend: WorkspaceContext provider
  - Frontend: Update NexusClient with workspace methods
  - Frontend: Update StudioContext to use current workspace

### Week 2: UI Components
- **Days 1-2:** Landing page redesign (Phase 3)
  - WorkspaceLauncher component
  - WorkspaceSelectorModal
  - CreateWorkspaceModal
- **Days 3-4:** Empty workspace state (Phase 4)
  - EmptyWorkspaceState component
  - Update Workspace.jsx for conditional rendering
- **Day 5:** Sidebar workspace controls (Phase 5)
  - Workspace header in sidebar
  - WorkspaceDropdownMenu

### Week 3: Integration + Testing
- **Days 1-2:** Panel-workspace integration (Phase 6)
  - Fix NXMLRenderer workspace_id
  - Update panel creation flow
- **Days 3-5:** Testing, error handling, polish (Phase 7)
  - 15 test scenarios
  - Error boundaries
  - Loading states and accessibility

**Total Estimated Time:** 3 weeks (15 working days)

### Parallel Track: nexus-state Service 🔄

**To be implemented in parallel** (can be worked on by separate developer):

**Week 1-2: Service Development**
- Service bootstrap and database models
- Redis caching layer
- State CRUD API endpoints
- Git integration for snapshots

**Week 3: Integration**
- K8s deployment configuration
- Redis deployment
- workspace-kernel integration (StateClient)
- Testing and performance tuning

**See:** `docs/STATE_MANAGEMENT_SERVICE.md` for detailed implementation plan

**Note:** Workspace management can proceed without nexus-state initially by storing state in workspace-kernel database. nexus-state can be integrated later as an optimization without breaking changes.

---

## Risk Mitigation

### Risk 1: WebSocket Connection Management
**Issue:** Multiple workspace switches could cause WebSocket connection leaks.

**Mitigation:**
- Implement proper cleanup in NexusProvider
- Close previous WebSocket before opening new one
- Add connection pooling with workspace_id key

### Risk 2: Panel State Persistence
**Issue:** Switching workspaces might lose unsaved panel state.

**Mitigation:**
- Auto-save panel state to backend on changes
- Debounce state updates (500ms)
- Show "Saving..." indicator
- Warn user if unsaved changes exist before switch

### Risk 3: Backend Performance
**Issue:** Loading all workspace panels on switch might be slow.

**Mitigation:**
- Implement pagination for large workspaces
- Lazy-load panel NXML sources
- Cache AST in frontend localStorage
- Add loading skeletons

### Risk 4: Git Repository Growth
**Issue:** Each workspace has its own Git repo, storage could grow fast.

**Mitigation:**
- Implement Git garbage collection
- Limit commit history depth
- Add workspace storage quotas
- Archive inactive workspaces

---

## Success Criteria

### Functional Requirements ✅
- [x] User can create multiple workspaces
- [x] User can switch between workspaces
- [x] Panels are isolated per workspace
- [x] Landing page shows workspace launcher
- [x] Empty workspace shows appropriate message
- [x] Sidebar hidden when no workspace open
- [x] All panel operations respect workspace context

### Non-Functional Requirements ✅
- [ ] Workspace switch < 2 seconds (P95)
- [ ] Panel list load < 500ms (P95)
- [ ] No memory leaks on workspace switch
- [ ] All interactions accessible via keyboard
- [ ] Responsive design (mobile-friendly)
- [ ] Error states handled gracefully

### User Experience Requirements ✅
- [ ] Smooth animations and transitions
- [ ] Clear visual feedback for all actions
- [ ] Helpful error messages
- [ ] Intuitive workspace management flow
- [ ] No data loss on navigation

---

## Future Enhancements (Out of Scope)

### Workspace Collaboration
- Share workspace with other users
- Real-time collaboration (multiple users, same workspace)
- Permission levels (owner, editor, viewer)
- Activity feed (who did what)

### Workspace Templates
- Create workspace from template
- Save workspace as template
- Template marketplace
- Import/export workspaces

### Advanced Git Features
- Branch management UI
- Merge conflict resolution
- Commit history visualization
- Revert to specific commit

### Workspace Analytics
- Panel usage statistics
- Performance metrics
- Resource consumption tracking
- AI assistant usage analytics

---

## Questions & Decisions Log

### Q1: Should workspaces have a "default" or "primary" flag?
**Decision:** No. Users select workspace on each session. Last opened is remembered via localStorage.

### Q2: Should panels be movable between workspaces?
**Decision:** Out of scope for Phase 5.5. Add in future as "Move to Workspace" feature.

### Q3: Should workspace creation be limited by subscription tier?
**Decision:** Yes. Free: 3 workspaces, Pro: 10 workspaces, Enterprise: unlimited. Enforce in backend.

### Q4: Should we support workspace archiving?
**Decision:** Yes, but as a simple status flag. Archived workspaces hidden from selector but not deleted.

### Q5: Should workspace switching reload the entire page?
**Decision:** No. Use React state to switch workspace context. Only reload panels, not entire app.

---

## Appendix: API Contracts

### Workspace API (workspace-kernel)

#### List Workspaces
```
GET /api/workspaces/
Authorization: Bearer <jwt>

Response 200:
[
  {
    "id": "ws_123",
    "name": "My Workspace",
    "description": "Description",
    "status": "active",
    "panelCount": 5,
    "createdAt": "2025-12-19T10:00:00Z",
    "updatedAt": "2025-12-19T12:00:00Z"
  }
]
```

#### Get Workspace
```
GET /api/workspaces/{workspace_id}
Authorization: Bearer <jwt>

Response 200:
{
  "id": "ws_123",
  "name": "My Workspace",
  "owner_id": "user_456",
  "status": "active",
  "panels": [
    {
      "id": "panel_789",
      "name": "Notes",
      "panel_type": "notes",
      "state": "active",
      "isRunning": true
    }
  ],
  "gitRepoPath": "/workspaces/ws_123",
  "gitBranch": "main",
  "lastCommitHash": "abc123"
}
```

#### Create Workspace
```
POST /api/workspaces/
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "name": "New Workspace",
  "description": "Optional description"
}

Response 201:
{
  "id": "ws_123",
  "name": "New Workspace",
  "description": "Optional description",
  "status": "active",
  "panelCount": 0,
  "createdAt": "2025-12-19T10:00:00Z"
}
```

#### Activate Workspace
```
POST /api/workspaces/{workspace_id}/activate
Authorization: Bearer <jwt>

Response 200:
{
  "status": "active",
  "message": "Workspace activated successfully"
}
```

#### Update Workspace
```
PATCH /api/workspaces/{workspace_id}
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description"
}

Response 200:
{
  "id": "ws_123",
  "name": "Updated Name",
  "description": "Updated description",
  "updatedAt": "2025-12-19T12:00:00Z"
}
```

#### Delete Workspace
```
DELETE /api/workspaces/{workspace_id}
Authorization: Bearer <jwt>

Response 204: No Content
```

---

## Conclusion

This plan provides a comprehensive roadmap for implementing workspace management in GraphStudio. The implementation follows the existing architecture patterns, reuses UI components where possible, and integrates seamlessly with the workspace-kernel backend.

**Key Principles:**
1. **Minimal Backend Changes:** Leverage existing workspace APIs
2. **Incremental Development:** Each phase is independently testable
3. **User-Centric Design:** Focus on smooth UX and clear visual feedback
4. **Future-Proof:** Architecture supports future collaboration features

**Next Steps:**
1. Review this plan with team
2. Adjust timeline based on team capacity
3. Begin Phase 1: Backend Enhancements
4. Iterate based on user feedback

---

**Document Maintained By:** Nexus Platform Team
**Review Cycle:** After Phase 5.5 completion
**Next Review:** After user testing in Week 3
