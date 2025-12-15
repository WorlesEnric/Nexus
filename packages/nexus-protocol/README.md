# @nexus/protocol

Core type definitions, AST structures, validation schemas, and NOG (Nexus Object Graph) system for the Nexus platform.

## Overview

`@nexus/protocol` is the foundational package that defines the NXML (Nexus Extensible Markup Language) specification. It provides:

- **TypeScript AST Types**: Complete type definitions for NXML panels
- **Zod Validation Schemas**: Runtime validation with detailed error reporting
- **NOG System**: Semantic knowledge graph for cross-panel synchronization
- **Utility Functions**: Helpers for AST traversal, manipulation, and analysis

## Installation

```bash
npm install @nexus/protocol
# or
pnpm add @nexus/protocol
```

## Directory Structure

```
nexus-protocol/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts              # Root exports
    │
    ├── ast/                  # Abstract Syntax Tree definitions
    │   ├── index.ts          # AST module exports
    │   ├── common.ts         # Shared types (primitives, layouts, components)
    │   ├── data.ts           # Data namespace (State, Computed)
    │   ├── logic.ts          # Logic namespace (Handler, Tool, Extension)
    │   ├── view.ts           # View namespace (UI components)
    │   └── panel.ts          # Root panel AST combining all namespaces
    │
    ├── schemas/              # Zod validation schemas
    │   ├── index.ts          # Schema module exports
    │   ├── data.ts           # Data namespace validation
    │   ├── logic.ts          # Logic namespace validation
    │   ├── view.ts           # View namespace validation
    │   └── panel.ts          # Full panel validation with cross-references
    │
    ├── nog/                  # Nexus Object Graph system
    │   ├── index.ts          # NOG module exports
    │   ├── entity.ts         # Semantic entity definitions
    │   ├── relationship.ts   # Entity relationship types
    │   ├── graph.ts          # Graph operations and queries
    │   └── patch.ts          # Explicit sync workflow patches
    │
    └── utils/                # Utility functions
        ├── index.ts          # Utils module exports
        └── types.ts          # TypeScript helpers and common utilities
```

## Quick Start

### Defining a Panel AST

```typescript
import type { NexusPanelAST } from '@nexus/protocol';

const panel: NexusPanelAST = {
  meta: {
    id: 'file-browser',
    title: 'File Browser',
    version: '1.0.0',
  },
  data: {
    state: [
      { name: 'currentPath', type: 'string', default: '/' },
      { name: 'files', type: 'list', default: [] },
      { name: 'loading', type: 'boolean', default: false },
    ],
    computed: [
      { name: 'fileCount', expression: '$state.files.length' },
    ],
  },
  logic: {
    handlers: [
      {
        name: 'fetchFiles',
        args: [{ name: 'path', type: 'string' }],
        code: `
          $state.loading = true;
          const files = await $ext.fs.readDir(path);
          $state.files = files;
          $state.loading = false;
        `,
      },
    ],
    tools: [
      {
        name: 'navigate',
        description: 'Navigate to a directory',
        handler: 'fetchFiles',
        args: ['$state.currentPath'],
      },
    ],
    lifecycle: [
      { event: 'mount', handler: 'fetchFiles', args: ['$state.currentPath'] },
    ],
    extensions: [
      { alias: 'fs', capabilityId: 'nexus.fs' },
    ],
  },
  view: {
    root: {
      type: 'Layout',
      props: { strategy: 'stack', gap: 16 },
      children: [
        {
          type: 'Text',
          props: { content: 'Current: {$state.currentPath}', variant: 'heading' },
        },
        {
          type: 'Button',
          props: { label: 'Refresh', trigger: 'navigate', variant: 'primary' },
        },
      ],
    },
  },
};
```

### Validating a Panel

```typescript
import { validateNexusPanelAST, NexusPanelASTSchemaStrict } from '@nexus/protocol';

// Quick validation with Zod
const result = NexusPanelASTSchemaStrict.safeParse(panel);
if (!result.success) {
  console.error(result.error.issues);
}

// Comprehensive validation with warnings
const validation = validateNexusPanelAST(panel);
if (!validation.valid) {
  console.error('Errors:', validation.errors);
}
if (validation.warnings.length > 0) {
  console.warn('Warnings:', validation.warnings);
}
```

### Traversing the View Tree

```typescript
import { traverseViewTree, getAllBindings, getAllTriggers } from '@nexus/protocol';

// Visit every node in the view tree
traverseViewTree(panel.view.root, (node, path) => {
  console.log(`${path.join('.')} -> ${node.type}`);
});

// Extract all state bindings
const bindings = getAllBindings(panel.view.root);
// ['$state.currentPath', '$state.files']

// Extract all tool triggers
const triggers = getAllTriggers(panel.view.root);
// ['navigate']
```

### Working with NOG

```typescript
import {
  createNOGGraph,
  createEntity,
  createRelationship,
  addEntity,
  addRelationship,
  findPath,
} from '@nexus/protocol';

// Create a new graph
let graph = createNOGGraph('project-alpha');

// Add entities
const userEntity = createEntity('component', 'UserProfile', {
  description: 'Displays user information',
});
graph = addEntity(graph, userEntity);

const dataEntity = createEntity('data', 'userData', {
  type: 'object',
  source: 'api',
});
graph = addEntity(graph, dataEntity);

// Create relationships
const rel = createRelationship(userEntity.id, dataEntity.id, 'uses', {
  description: 'UserProfile displays userData',
});
graph = addRelationship(graph, rel);

// Query the graph
const path = findPath(graph, userEntity.id, dataEntity.id);
```

### Creating Patches for Sync

```typescript
import {
  createPatchSet,
  createEntityPatch,
  PatchOperation,
} from '@nexus/protocol';

// Create a patch set for review
const patchSet = createPatchSet('Update navigation component', 'user-123');

// Add entity patches
const entityPatch = createEntityPatch(
  PatchOperation.UPDATE,
  'entity-nav-001',
  { properties: { expanded: true } },
  'panel-a',
  'panel-b'
);

patchSet.patches.entity.push(entityPatch);

// User reviews and approves patches before applying
```

## Module Reference

### AST Types

| Type | Description |
|------|-------------|
| `NexusPanelAST` | Root panel structure combining all namespaces |
| `DataAST` | Data namespace with state and computed definitions |
| `LogicAST` | Logic namespace with handlers, tools, lifecycle, extensions |
| `ViewAST` | View namespace with component tree |
| `StateNode` | Mutable reactive state variable |
| `ComputedNode` | Derived read-only computed value |
| `HandlerNode` | Sandboxed JavaScript function |
| `ToolNode` | Atomic callable operation |
| `ExtensionNode` | External capability declaration |
| `ViewNode` | Union type of all view components |

### Validation Schemas

| Schema | Description |
|--------|-------------|
| `NexusPanelASTSchema` | Basic structural validation |
| `NexusPanelASTSchemaStrict` | Full validation with cross-reference checks |
| `DataASTSchema` | Data namespace validation |
| `LogicASTSchema` | Logic namespace validation |
| `ViewNodeSchema` | Recursive view tree validation |

### NOG Types

| Type | Description |
|------|-------------|
| `NOGEntity` | Semantic entity in the knowledge graph |
| `NOGRelationship` | Directed edge between entities |
| `NOGGraph` | Complete graph with entities and relationships |
| `PatchSet` | Collection of patches for explicit sync |
| `EntityPatch` | Patch operation for an entity |

### Utility Functions

| Function | Description |
|----------|-------------|
| `traverseViewTree()` | Walk the view component tree |
| `getAllBindings()` | Extract state/scope bindings from view |
| `getAllTriggers()` | Extract tool triggers from view |
| `validatePanelAST()` | Check cross-namespace references |
| `generateId()` | Create unique identifiers |
| `deepClone()` | Deep clone objects |
| `deepMerge()` | Deep merge objects |

## Design Principles

### Namespace Isolation

NXML separates concerns into three isolated namespaces:

1. **Data**: What the panel knows (state variables, computed values)
2. **Logic**: What the panel can do (handlers, tools, lifecycle hooks)
3. **View**: What the panel shows (component tree)

Namespaces can only reference each other through explicit bindings (`$state.x`) and triggers (`trigger: 'toolName'`).

### Explicit Sync Workflow

Panels don't auto-synchronize. When state changes in one panel:

1. NOG detects affected entities and relationships
2. AI generates patch proposals for related panels
3. User reviews and approves/rejects patches
4. Approved patches are applied atomically

This ensures users maintain control over cross-panel effects.

### Sandbox Security

Handler code is validated to block dangerous globals:

- `window`, `document`, `global`, `globalThis`
- `eval`, `Function` constructor
- `require`, `import` (except allowed extensions)

Extensions provide safe, capability-based access to external resources.

### Immutable AST Operations

All AST manipulation functions return new objects rather than mutating in place. This enables reliable change detection and undo/redo support.

## TypeScript Configuration

This package requires TypeScript 5.0+ with strict mode. Recommended tsconfig options:

```json
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true
  }
}
```

## License

MIT © Nexus Team
