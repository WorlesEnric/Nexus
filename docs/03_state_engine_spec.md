The **State Engine** acts as the persistent brain of the system, residing within the **Workspace Kernel**. It is responsible for bridging the gap between the physical file system (Git/NXML) and the logical runtime graph (Nexus Object Graph or NOG).

Here is the implementation guide and specification.

### **1. Repository Location**

The State Engine should be implemented as a module within the **Workspace Kernel** package.

  * **Path**: `runtime/workspace-kernel/src/state/`
  * **Language**: TypeScript (Node.js)

**Directory Structure**:

```bash
runtime/workspace-kernel/src/state/
├── index.ts               # Public API exports
├── engine.ts              # Main coordinator (The "Brain")
├── git-service.ts         # Git Persistence Layer
├── nog-manager.ts         # In-memory Graph Logic
├── sync-manager.ts        # Sync & Debounce Logic
└── mappers/               # Data Converters
    └── nxml.ts            # NXML AST <-> NOG Entity conversion
```
# Nexus State Engine Specification (Phase 3)

**Version**: 1.0
**Date**: 2025-12-15
**Status**: Implementation Ready
**Target Module**: `runtime/workspace-kernel`

## 1. Overview

The **Nexus State Engine** is the persistence and synchronization layer of the Nexus Workspace. While Phase 2 (Runtime) handles the *execution* of panels, Phase 3 (State Engine) handles the *semantic understanding* and *storage* of the project.

It implements the **"Explicit Sync"** protocol, ensuring that changes made by Users (via UI) and AI (via NexusOS) are coordinated, versioned, and structurally valid.

### 1.1 Core Responsibilities

1.  **Semantic Truth (NOG)**: Maintains the live **Nexus Object Graph** in memory, allowing O(1) access to project entities (e.g., "Find all tools that modify `$state.user`").
2.  **Physical Truth (Git)**: Manages the underlying Git repository, treating NXML files as the source of truth.
3.  **Shadow Workflows**: Manages isolated Git branches for AI to propose changes without breaking the user's live session.
4.  **Synchronization**: Handles the `Patch -> Apply -> Persist` loop with write debouncing.

### 1.2 Architecture

The State Engine follows a CQRS-style (Command Query Responsibility Segregation) pattern where state changes are driven by **Patches**.

```mermaid
graph TD
    subgraph "External Actors"
        User[GraphStudio UI]
        AI[NexusOS Agent]
    end

    subgraph "Workspace Kernel"
        API[WebSocket API]
        
        subgraph "State Engine"
            Engine[State Engine Coordinator]
            Sync[Sync Manager]
            NOG[NOG Manager]
            Git[Git Service]
            Mapper[NXML Mapper]
        end
    end

    subgraph "Storage"
        Repo[.git]
        FS[NXML Files]
    end

    User -->|NOGPatch| API
    AI -->|NOGPatch| API

    API -->|1. Queue| Engine
    Engine -->|2. Handle| Sync
    
    Sync -->|3. Apply| NOG
    Sync -->|4. Debounce Save| Mapper
    
    Mapper -->|5. Generate NXML| FS
    FS -->|6. Commit| Git
    Git -->|7. Version| Repo
    
    NOG -->|8. Broadcast| API
````

-----

## 2\. Component Specifications

### 2.1 Git Service (`git-service.ts`)

A wrapper around `simple-git` to handle workspace version control.

  * **Role**: Physical persistence.
  * **Key Strategies**:
      * **Auto-Save**: Frequent "WIP" commits on the active branch.
      * **Shadow Branches**: Temporary branches (`shadow/{task_id}`) for AI operations.
      * **Atomic Writes**: Ensure file operations complete before committing.

### 2.2 NOG Manager (`nog-manager.ts`)

Manages the in-memory **Nexus Object Graph**.

  * **Role**: Logical runtime state.
  * **Data Structures**:
      * `entities`: `Map<string, NOGEntity>`
      * `relationships`: `NOGRelationship[]`
  * **Operations**:
      * `applyPatch(patch)`: Updates the graph in-memory.
      * `diff(otherGraph)`: Compares state (useful for merging AI branches).
      * `rehydrate(entities)`: Rebuilds graph from disk on startup.

### 2.3 NXML Mapper (`mappers/nxml.ts`)

Translates between the AST (Phase 1) and the Graph (Phase 3).

  * **Read Path**: `NXML File -> Reactor.parse() -> AST -> NOG Entities`.
  * **Write Path**: `NOG Entities -> AST Builder -> Reactor.generate() -> NXML File`.
  * *Note: Requires `nexus-reactor` to expose AST generation capabilities.*

### 2.4 Sync Manager (`sync-manager.ts`)

Orchestrates the save loop to prevent disk thrashing.

  * **Logic**:
    1.  Receive Patch.
    2.  Update Memory (Immediate).
    3.  Reset "Save Timer" (Debounce 1000ms).
    4.  On Timer: Trigger Mapper to write files -\> Trigger Git to commit.

-----

## 3\. Implementation Guide

### 3.1 Dependencies

Install required packages in `runtime/workspace-kernel`:

```bash
npm install simple-git fs-extra uuid debounce
npm install --save-dev @types/fs-extra @types/uuid @types/debounce
```

### 3.2 Git Service Implementation

`src/state/git-service.ts`

```typescript
import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs-extra';
import path from 'path';

export class GitService {
  private git: SimpleGit;

  constructor(private rootDir: string) {
    this.git = simpleGit(rootDir);
  }

  async init(): Promise<void> {
    if (!await fs.pathExists(path.join(this.rootDir, '.git'))) {
      await this.git.init();
      await this.git.addConfig('user.name', 'Nexus Kernel');
      await this.git.addConfig('user.email', 'kernel@nexus.local');
      await this.commit('Initial commit');
    }
  }

  async commit(message: string): Promise<string> {
    const status = await this.git.status();
    if (status.files.length === 0) return '';
    
    await this.git.add('.');
    const result = await this.git.commit(message);
    return result.commit;
  }

  async createShadowBranch(taskId: string): Promise<string> {
    const branch = `shadow/${taskId}`;
    await this.git.checkoutLocalBranch(branch);
    return branch;
  }

  async checkoutMain(): Promise<void> {
    await this.git.checkout('main');
  }

  async listFiles(ext: string): Promise<string[]> {
    // Basic implementation, in production use recursive traversal
    const files = await fs.readdir(this.rootDir);
    return files.filter(f => f.endsWith(ext));
  }

  async readFile(file: string): Promise<string> {
    return fs.readFile(path.join(this.rootDir, file), 'utf-8');
  }

  async writeFile(file: string, content: string): Promise<void> {
    await fs.outputFile(path.join(this.rootDir, file), content);
  }
}
```

### 3.3 NOG Manager Implementation

`src/state/nog-manager.ts`

```typescript
import { NOGGraph, NOGEntity, NOGPatch } from '@nexus/protocol';

export class NOGManager {
  private graph: NOGGraph;

  constructor() {
    this.graph = {
      entities: new Map(),
      relationships: [],
      meta: { id: 'root', version: 0, createdAt: Date.now(), updatedAt: Date.now() }
    };
  }

  getSnapshot() {
    return {
      ...this.graph,
      entities: Object.fromEntries(this.graph.entities)
    };
  }

  replaceGraph(entities: NOGEntity[]) {
    this.graph.entities.clear();
    entities.forEach(e => this.graph.entities.set(e.id, e));
  }

  applyPatch(patch: NOGPatch) {
    if (patch.patchType === 'entity') {
      if (patch.operation === 'update' && patch.entityId) {
        const entity = this.graph.entities.get(patch.entityId);
        if (entity && patch.data) {
          Object.assign(entity, patch.data);
        }
      }
      // Handle create/delete...
    }
    this.graph.meta.version++;
    this.graph.meta.updatedAt = Date.now();
  }
}
```

### 3.4 NXML Mapper (Skeleton)

`src/state/mappers/nxml.ts`

```typescript
import { NexusReactor } from '@nexus/reactor';
import { NOGEntity } from '@nexus/protocol';

export class NxmlMapper {
  // Requires Phase 1 Reactor to be imported
  
  static parseToEntities(filename: string, content: string): NOGEntity[] {
    const reactor = new NexusReactor({ source: content });
    // Assume reactor exposes AST
    const ast = reactor['ast']; 
    const entities: NOGEntity[] = [];

    // 1. Panel Entity
    entities.push({
      id: `panel:${filename}`,
      name: ast.meta.title,
      category: 'component',
      sourcePanel: filename,
      properties: ast.meta,
      // ... default fields
    } as any);

    // 2. Data/Logic Entities...
    // (Map AST nodes to Entities as per protocol spec)

    return entities;
  }

  static generateNXML(entities: NOGEntity[]): string {
    // TODO: Reconstruct NXML string from entities
    // This is complex: requires regenerating AST and printing
    return `<NexusPanel>...</NexusPanel>`; 
  }
}
```

### 3.5 Sync Manager & Coordinator

`src/state/sync-manager.ts`

```typescript
import debounce from 'debounce';
import { GitService } from './git-service';
import { NOGManager } from './nog-manager';
import { NxmlMapper } from './mappers/nxml';
import { NOGPatch } from '@nexus/protocol';

export class SyncManager {
  private debouncedSave: () => void;

  constructor(
    private git: GitService,
    private nog: NOGManager
  ) {
    this.debouncedSave = debounce(this.persist.bind(this), 1000);
  }

  async handlePatch(patch: NOGPatch) {
    // 1. Optimistic Memory Update
    this.nog.applyPatch(patch);
    
    // 2. Schedule Disk Persistence
    this.debouncedSave();
  }

  private async persist() {
    console.log('Persisting state...');
    // In a real implementation:
    // 1. Group entities by sourcePanel
    // 2. Map Entities -> NXML String (via Mapper)
    // 3. git.writeFile(...)
    
    await this.git.commit('Auto-save');
  }
}
```

### 3.6 Integration (Server Entrypoint)

`src/server.ts`

```typescript
import { GitService } from './state/git-service';
import { NOGManager } from './state/nog-manager';
import { SyncManager } from './state/sync-manager';
import { NxmlMapper } from './state/mappers/nxml';

// 1. Setup
const workspaceRoot = process.env.WORKSPACE_ROOT || '/workspace';
const git = new GitService(workspaceRoot);
const nog = new NOGManager();
const sync = new SyncManager(git, nog);

// 2. Boot
await git.init();

// Hydrate NOG from files
const files = await git.listFiles('.nxml');
const allEntities = [];
for (const file of files) {
  const content = await git.readFile(file);
  const entities = NxmlMapper.parseToEntities(file, content);
  allEntities.push(...entities);
}
nog.replaceGraph(allEntities);

// 3. WebSocket API
wss.on('connection', (ws) => {
  // Send Initial State
  ws.send(JSON.stringify({ 
    type: 'INIT_STATE', 
    payload: nog.getSnapshot() 
  }));

  ws.on('message', async (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'PATCH') {
      await sync.handlePatch(msg.payload);
      // Broadcast to others...
    }
  });
});
```

## 4\. Testing Strategy

1.  **Unit Test Mapper**: Ensure `NXML -> Entity -> NXML` is idempotent (lossless).
2.  **Git Integration**: Use `memfs` or a temp directory to verify `.git` creation and commits.
3.  **Sync Logic**: Verify that rapid patches only trigger one commit (Debounce check).

<!-- end list -->

```