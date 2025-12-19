# Panel Customization & Interface Adaptation Guide

This document provides comprehensive guidance for creating custom panels in Nexus GraphStudio IDE and adapting to the panel interface protocol.

## Table of Contents

1. [Interface Overview](#interface-overview)
2. [Creating a New Panel](#creating-a-new-panel)
3. [Interface Specification](#interface-specification)
4. [AI Integration](#ai-integration)
5. [Drag & Drop Support](#drag--drop-support)
6. [Export Functionality](#export-functionality)
7. [Best Practices](#best-practices)
8. [Examples](#examples)

---

## Interface Overview

Every panel in Nexus GraphStudio must implement the `IStudioPanelDefinition` interface. This ensures consistent behavior across all panels and enables the Shell to coordinate panel interactions.

### Core Principles

1. **Self-Contained** - Panels manage their own state and rendering
2. **AI-Native** - Every panel can expose context to and receive changes from AI
3. **Interoperable** - Panels can exchange data via drag & drop
4. **Exportable** - Panels can export their content in standard formats

### The Panel Lifecycle

```
Register → Mount → Render → [Focus/Blur] → [AI Observe] → Unmount
```

---

## Creating a New Panel

### Step 1: Create the Panel File

Create a new file in `src/panels/` following the naming convention `YourPanelName.jsx`:

```jsx
import React, { useState } from 'react';
import { YourIcon } from 'lucide-react';
import { createPanelDefinition, PanelCategories, ContentTypes } from './BasePanelInterface';

// Main View Component
function YourPanelMainView({ panelState, updateState, isFocused, panelId }) {
  // Your panel's main UI
  return (
    <div className="flex flex-col h-full">
      {/* Panel content */}
    </div>
  );
}

// Optional: Properties Panel Component
function YourPanelProperties({ panelState }) {
  return (
    <div className="p-4">
      {/* Inspector/properties UI */}
    </div>
  );
}

// Panel Definition
const YourPanel = createPanelDefinition({
  id: 'your-panel-id',
  name: 'Your Panel Name',
  description: 'Brief description of what this panel does',
  icon: YourIcon,
  category: PanelCategories.CREATION,
  accentColor: 'violet',
  
  renderMainView: (props) => <YourPanelMainView {...props} />,
  renderPropertiesPanel: (props) => <YourPanelProperties {...props} />,
  
  getInitialState: () => ({
    // Your panel's initial state
  }),
  
  getLLMContext: async (panelState) => {
    // Return context for AI
  },
  
  applyLLMChange: async (panelState, updateState, dslDiff) => {
    // Apply AI-generated changes
  },
  
  dropZone: {
    acceptTypes: [ContentTypes.TEXT_PLAIN],
    onDrop: (data, panelState, updateState) => {
      // Handle dropped content
    },
  },
  
  exportFormats: [
    { format: 'json', label: 'JSON', mimeType: 'application/json' },
  ],
  
  actions: [
    { id: 'your-panel.action', label: 'Custom Action', category: 'Your Panel' },
  ],
});

export default YourPanel;
```

### Step 2: Register the Panel

Add your panel to `src/panels/registry.js`:

```javascript
import YourPanel from './YourPanel';

// In initializeBuiltInPanels():
export function initializeBuiltInPanels() {
  // ... existing panels
  registerPanel(YourPanel);
}
```

### Step 3: Panel is Ready

Your panel will now appear in:
- The "Add Panel" modal (`⌘N`)
- The Command Palette (`⌘K`)
- Panel type filtering by category

---

## Interface Specification

### Required Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique identifier for the panel type |
| `name` | `string` | Display name shown in UI |
| `description` | `string` | Brief description for tooltips |
| `icon` | `React.ElementType` | Lucide icon component |
| `category` | `PanelCategory` | Grouping category |
| `accentColor` | `string` | Theme color name |

### Panel Categories

```javascript
PanelCategories = {
  CREATION: 'creation',    // Canvas, editors (flowchart, SVG, code)
  DATA: 'data',            // Notes, sources, data views
  AI: 'ai',                // Chat, AI assistants
  UTILITY: 'utility',      // Settings, config, tools
  PREVIEW: 'preview',      // Previews, output views
}
```

### Accent Colors

Available accent colors (Tailwind-based):
- `violet` (default)
- `cyan`
- `amber`
- `green`
- `blue`
- `emerald`
- `pink`

### Rendering Methods

#### `renderMainView(props)`

**Required.** Renders the panel's main content area.

```typescript
interface RenderMainViewProps {
  panelState: object;           // Current panel state
  updateState: (newState) => void;  // State updater
  isFocused: boolean;           // Whether panel has focus
  panelId: string;              // Unique instance ID
}
```

**Example:**

```jsx
renderMainView: ({ panelState, updateState, isFocused }) => {
  return (
    <div className={`h-full ${isFocused ? 'ring-1 ring-violet-500' : ''}`}>
      <MyCanvas 
        data={panelState.canvasData}
        onChange={(data) => updateState({ canvasData: data })}
      />
    </div>
  );
}
```

#### `renderPropertiesPanel(props)`

**Optional.** Renders inspector/properties sidebar content.

```jsx
renderPropertiesPanel: ({ panelState }) => {
  return (
    <div className="p-4 space-y-4">
      <h3>Properties</h3>
      {/* Property editors */}
    </div>
  );
}
```

#### `renderToolbar(props)`

**Optional.** Renders a custom toolbar above the main view.

```jsx
renderToolbar: ({ panelState, updateState }) => {
  return (
    <div className="flex items-center gap-2 p-2 border-b">
      <button onClick={() => updateState({ tool: 'select' })}>
        Select
      </button>
    </div>
  );
}
```

### State Management

#### `getInitialState()`

Returns the default state for new panel instances:

```javascript
getInitialState: () => ({
  items: [],
  selectedId: null,
  zoom: 1,
  tool: 'select',
})
```

#### State Updates

Use the `updateState` function passed to render methods:

```javascript
// Partial update (merges with existing state)
updateState({ selectedId: 'item-1' });

// Multiple properties
updateState({ 
  items: [...items, newItem],
  selectedId: newItem.id 
});
```

### Lifecycle Hooks

```javascript
{
  onMount: (panelState) => {
    // Called when panel instance is created
    console.log('Panel mounted');
  },
  
  onUnmount: (panelState) => {
    // Called when panel is removed
    // Clean up subscriptions, timers, etc.
  },
  
  onFocus: (panelState) => {
    // Called when panel gains focus
  },
  
  onBlur: (panelState) => {
    // Called when panel loses focus
  },
}
```

---

## AI Integration

AI integration is a core feature of Nexus GraphStudio. Every panel should implement these methods to participate in AI-assisted workflows.

### `getLLMContext(panelState)`

Returns data that AI can use to understand the panel's current state.

**Signature:**
```typescript
getLLMContext: (panelState: object) => Promise<{
  contentType: string;
  data: any;
  schemaVersion: string;
}>
```

**Best Practices:**

1. **Use descriptive content types** - Help AI understand the data format
2. **Include schema version** - Enable future compatibility
3. **Return structured data** - JSON or DSL that AI can parse
4. **Be comprehensive** - Include all relevant state

**Examples:**

```javascript
// Flowchart Panel
getLLMContext: async (panelState) => {
  const { nodes, connections } = panelState;
  
  // Convert to Mermaid DSL for AI comprehension
  let mermaid = 'graph TD\n';
  nodes.forEach(n => {
    mermaid += `  ${n.id}[${n.label}]\n`;
  });
  connections.forEach(c => {
    mermaid += `  ${c.from} --> ${c.to}\n`;
  });
  
  return {
    contentType: 'dsl/flowchart',
    data: {
      type: 'flowchart',
      mermaid,           // DSL representation
      nodes,             // Raw data for precise operations
      connections,
    },
    schemaVersion: '1.0',
  };
}

// Code Editor Panel
getLLMContext: async (panelState) => ({
  contentType: 'text/code',
  data: {
    type: 'code',
    language: panelState.language,
    code: panelState.code,
    lineCount: panelState.code.split('\n').length,
    // Include cursor position for targeted assistance
    cursorLine: panelState.cursorLine,
    selection: panelState.selection,
  },
  schemaVersion: '1.0',
})

// Kanban Panel
getLLMContext: async (panelState) => {
  const tasks = panelState.tasks || [];
  return {
    contentType: 'dsl/kanban',
    data: {
      type: 'kanban',
      totalTasks: tasks.length,
      columns: {
        todo: tasks.filter(t => t.columnId === 'todo'),
        inProgress: tasks.filter(t => t.columnId === 'in-progress'),
        done: tasks.filter(t => t.columnId === 'done'),
      },
    },
    schemaVersion: '1.0',
  };
}
```

### `applyLLMChange(panelState, updateState, dslDiff)`

Applies changes generated by AI to the panel state.

**Signature:**
```typescript
applyLLMChange: (
  panelState: object,
  updateState: (newState: object) => void,
  dslDiff: any
) => Promise<boolean>
```

**Return Value:**
- `true` - Change was applied successfully
- `false` - Change could not be applied

**Examples:**

```javascript
// Flowchart Panel
applyLLMChange: async (panelState, updateState, dslDiff) => {
  if (dslDiff.addNode) {
    const nodes = [...panelState.nodes, {
      id: `node-${Date.now()}`,
      ...dslDiff.addNode,
    }];
    updateState({ nodes });
    return true;
  }
  
  if (dslDiff.nodes && dslDiff.connections) {
    // Full replacement
    updateState({ 
      nodes: dslDiff.nodes, 
      connections: dslDiff.connections 
    });
    return true;
  }
  
  return false;
}

// Code Editor Panel
applyLLMChange: async (panelState, updateState, dslDiff) => {
  if (dslDiff.code !== undefined) {
    updateState({ 
      code: dslDiff.code,
      language: dslDiff.language || panelState.language,
    });
    return true;
  }
  
  if (dslDiff.insertAtCursor) {
    // Insert text at cursor position
    const { code, cursorPosition } = panelState;
    const newCode = 
      code.slice(0, cursorPosition) + 
      dslDiff.insertAtCursor + 
      code.slice(cursorPosition);
    updateState({ code: newCode });
    return true;
  }
  
  return false;
}
```

### AI Observation

When `isAIObserving` is enabled for a panel (via the eye icon), the Chat panel will include this panel's context in AI requests.

```jsx
// Visual indicator in your panel
function YourPanelMainView({ panelState, isFocused }) {
  const panel = useStudioStore(state => 
    state.panels.find(p => p.panelTypeId === 'your-panel-id')
  );
  
  return (
    <div className={panel?.isAIObserving ? 'glow-active' : ''}>
      {/* Panel content */}
    </div>
  );
}
```

---

## Drag & Drop Support

### Configuring Drop Zones

Declare what content types your panel accepts:

```javascript
dropZone: {
  acceptTypes: [
    ContentTypes.TEXT_PLAIN,
    ContentTypes.TEXT_MARKDOWN,
    ContentTypes.JSON,
    ContentTypes.DSL_FLOWCHART,
  ],
  onDrop: (data, panelState, updateState) => {
    // Handle the drop
  },
}
```

### Available Content Types

```javascript
ContentTypes = {
  // Text formats
  TEXT_PLAIN: 'text/plain',
  TEXT_MARKDOWN: 'text/markdown',
  TEXT_CODE: 'text/code',
  
  // DSL formats
  DSL_FLOWCHART: 'dsl/flowchart',
  DSL_KANBAN: 'dsl/kanban',
  DSL_SVG: 'dsl/svg',
  
  // Image formats
  IMAGE_PNG: 'image/png',
  IMAGE_SVG: 'image/svg+xml',
  
  // Data formats
  JSON: 'application/json',
  
  // Internal
  PANEL_REF: 'application/x-panel-ref',
}
```

### Handling Drops

```javascript
onDrop: (data, panelState, updateState) => {
  const { contentType, data: payload, sourcePanelId } = data;
  
  switch (contentType) {
    case ContentTypes.TEXT_PLAIN:
      // Add text as a note or label
      updateState({
        items: [...panelState.items, {
          id: `item-${Date.now()}`,
          type: 'text',
          content: payload,
        }]
      });
      break;
      
    case ContentTypes.DSL_FLOWCHART:
      // Convert flowchart to your format
      const converted = convertFromFlowchart(payload);
      updateState({ items: converted });
      break;
      
    case ContentTypes.JSON:
      // Handle generic JSON
      try {
        const parsed = typeof payload === 'string' 
          ? JSON.parse(payload) 
          : payload;
        processJsonData(parsed, updateState);
      } catch (e) {
        console.error('Invalid JSON dropped');
      }
      break;
  }
}
```

### Making Panel Content Draggable

Use the `useDragSource` hook to make content draggable:

```jsx
import { useDragSource } from '../hooks/useDragDrop';

function DraggableItem({ item, panelId }) {
  const { dragProps, isDragging } = useDragSource(panelId);
  
  const handleDragStart = (e) => {
    dragProps.onDragStart(
      e,
      ContentTypes.JSON,           // Content type
      { id: item.id, data: item }, // Data payload
    );
  };
  
  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={dragProps.onDragEnd}
      className={isDragging ? 'opacity-50' : ''}
    >
      {item.label}
    </div>
  );
}
```

---

## Export Functionality

### Declaring Export Formats

```javascript
exportFormats: [
  { format: 'png', label: 'PNG Image', mimeType: 'image/png' },
  { format: 'svg', label: 'SVG Vector', mimeType: 'image/svg+xml' },
  { format: 'json', label: 'JSON Data', mimeType: 'application/json' },
  { format: 'pdf', label: 'PDF Document', mimeType: 'application/pdf' },
]
```

### Implementing Export (Future)

```javascript
// This method would be called when user selects export
exportArtifact: async (format, panelState) => {
  switch (format) {
    case 'png':
      // Use html2canvas or similar
      const canvas = await html2canvas(containerRef.current);
      return canvas.toBlob();
      
    case 'svg':
      // Generate SVG string
      const svg = generateSVG(panelState);
      return new Blob([svg], { type: 'image/svg+xml' });
      
    case 'json':
      // Export raw state
      return new Blob(
        [JSON.stringify(panelState, null, 2)],
        { type: 'application/json' }
      );
  }
}
```

---

## Best Practices

### 1. State Design

```javascript
// ✅ Good: Normalized, predictable state
getInitialState: () => ({
  items: [],           // Array of item objects
  selectedIds: [],     // Array of selected IDs
  viewSettings: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  tool: 'select',
})

// ❌ Bad: Nested, denormalized state
getInitialState: () => ({
  canvas: {
    layers: [{
      items: [{
        selected: true,  // Selection mixed with data
        // ...
      }]
    }]
  }
})
```

### 2. Performance

```jsx
// ✅ Good: Memoize expensive renders
const MemoizedItem = React.memo(({ item, onSelect }) => (
  <div onClick={() => onSelect(item.id)}>{item.label}</div>
));

// ✅ Good: Use callbacks
const handleSelect = useCallback((id) => {
  updateState({ selectedId: id });
}, [updateState]);
```

### 3. Styling Consistency

```jsx
// ✅ Good: Use existing design tokens
<div className="rounded-xl bg-zinc-800/50 border border-white/5">
  <button className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10">
    Action
  </button>
</div>

// ❌ Bad: Custom colors that don't match
<div style={{ background: '#1a1a1a', border: '1px solid #333' }}>
```

### 4. AI Context Quality

```javascript
// ✅ Good: Rich, structured context
getLLMContext: async (state) => ({
  contentType: 'dsl/flowchart',
  data: {
    type: 'flowchart',
    description: 'User authentication flow',
    nodeCount: state.nodes.length,
    nodes: state.nodes.map(n => ({
      id: n.id,
      type: n.type,
      label: n.label,
      // Include semantic info
      purpose: n.metadata?.purpose,
    })),
    connections: state.connections,
  },
  schemaVersion: '1.0',
})

// ❌ Bad: Raw dump without structure
getLLMContext: async (state) => ({
  contentType: 'application/json',
  data: state,  // Entire state without filtering
  schemaVersion: '1.0',
})
```

### 5. Error Handling

```javascript
applyLLMChange: async (panelState, updateState, dslDiff) => {
  try {
    if (!dslDiff || typeof dslDiff !== 'object') {
      console.warn('Invalid dslDiff received');
      return false;
    }
    
    // Validate before applying
    if (dslDiff.nodes && !Array.isArray(dslDiff.nodes)) {
      console.warn('Invalid nodes format');
      return false;
    }
    
    updateState({ nodes: dslDiff.nodes });
    return true;
  } catch (error) {
    console.error('Failed to apply LLM change:', error);
    return false;
  }
}
```

---

## Examples

### Minimal Panel Template

```jsx
import React from 'react';
import { Box } from 'lucide-react';
import { createPanelDefinition, PanelCategories, ContentTypes } from './BasePanelInterface';

function MinimalPanelView({ panelState, updateState, isFocused }) {
  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-zinc-400">Minimal Panel Content</p>
    </div>
  );
}

const MinimalPanel = createPanelDefinition({
  id: 'minimal',
  name: 'Minimal Panel',
  description: 'A minimal panel template',
  icon: Box,
  category: PanelCategories.UTILITY,
  accentColor: 'violet',
  
  renderMainView: (props) => <MinimalPanelView {...props} />,
  
  getInitialState: () => ({}),
  
  getLLMContext: async () => ({
    contentType: 'text/plain',
    data: { type: 'minimal' },
    schemaVersion: '1.0',
  }),
});

export default MinimalPanel;
```

### Interactive Panel with Toolbar

```jsx
import React, { useState, useCallback } from 'react';
import { Layers, Plus, Trash2, Move } from 'lucide-react';
import { createPanelDefinition, PanelCategories, ContentTypes } from './BasePanelInterface';

function LayersPanelView({ panelState, updateState, isFocused }) {
  const [tool, setTool] = useState('select');
  const layers = panelState?.layers || [];
  
  const addLayer = useCallback(() => {
    const newLayer = {
      id: `layer-${Date.now()}`,
      name: `Layer ${layers.length + 1}`,
      visible: true,
    };
    updateState({ layers: [...layers, newLayer] });
  }, [layers, updateState]);
  
  const deleteLayer = useCallback((id) => {
    updateState({ layers: layers.filter(l => l.id !== id) });
  }, [layers, updateState]);
  
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-white/10">
        <button
          onClick={() => setTool('select')}
          className={`p-2 rounded-lg ${tool === 'select' ? 'bg-violet-500' : 'hover:bg-white/10'}`}
        >
          <Move size={16} />
        </button>
        <button
          onClick={addLayer}
          className="p-2 rounded-lg hover:bg-white/10"
        >
          <Plus size={16} />
        </button>
      </div>
      
      {/* Layer list */}
      <div className="flex-1 overflow-auto p-2">
        {layers.map(layer => (
          <div 
            key={layer.id}
            className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5"
          >
            <span className="text-sm">{layer.name}</span>
            <button
              onClick={() => deleteLayer(layer.id)}
              className="p-1 text-zinc-500 hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const LayersPanel = createPanelDefinition({
  id: 'layers',
  name: 'Layers Manager',
  description: 'Manage document layers',
  icon: Layers,
  category: PanelCategories.UTILITY,
  accentColor: 'cyan',
  
  renderMainView: (props) => <LayersPanelView {...props} />,
  
  getInitialState: () => ({
    layers: [
      { id: 'layer-1', name: 'Background', visible: true },
      { id: 'layer-2', name: 'Content', visible: true },
    ],
  }),
  
  getLLMContext: async (panelState) => ({
    contentType: 'application/json',
    data: {
      type: 'layers',
      layerCount: panelState?.layers?.length || 0,
      layers: panelState?.layers || [],
    },
    schemaVersion: '1.0',
  }),
  
  applyLLMChange: async (panelState, updateState, dslDiff) => {
    if (dslDiff.addLayer) {
      const layers = [...(panelState?.layers || []), {
        id: `layer-${Date.now()}`,
        ...dslDiff.addLayer,
      }];
      updateState({ layers });
      return true;
    }
    if (dslDiff.layers) {
      updateState({ layers: dslDiff.layers });
      return true;
    }
    return false;
  },
  
  dropZone: {
    acceptTypes: [ContentTypes.JSON],
    onDrop: (data, panelState, updateState) => {
      if (data.data?.layers) {
        updateState({ layers: data.data.layers });
      }
    },
  },
  
  actions: [
    { id: 'layers.add', label: 'Add Layer', category: 'Layers' },
    { id: 'layers.flatten', label: 'Flatten All', category: 'Layers' },
  ],
});

export default LayersPanel;
```

---

## Troubleshooting

### Panel Not Appearing

1. Check that the panel is registered in `registry.js`
2. Verify the `id` is unique
3. Check browser console for errors

### State Not Updating

1. Use `updateState` from props, not local state for shared data
2. Ensure `getInitialState` returns a valid object
3. Check that state updates are objects (partial merge)

### Drag & Drop Not Working

1. Verify `dropZone.acceptTypes` includes the source content type
2. Check that `onDrop` handler is implemented
3. Ensure draggable elements have `draggable={true}`

### AI Context Not Available

1. Verify `getLLMContext` returns the correct structure
2. Check that `isAIObserving` is enabled for the panel
3. Ensure the Chat panel is active

---

## Future Considerations

### Planned Features

- **Panel Persistence** - Save/load panel state
- **Panel Templates** - Pre-configured panel setups
- **Plugin System** - Third-party panel packages
- **Real-time Collaboration** - Multi-user editing
- **Version History** - Undo/redo with history

### Interface Extensions

Future versions may add:

```typescript
interface IStudioPanelDefinition {
  // ... existing interface ...
  
  // Collaboration
  onRemoteChange?: (change: RemoteChange) => void;
  
  // History
  getUndoState?: () => UndoableState;
  applyUndo?: (state: UndoableState) => void;
  
  // Templates
  getTemplates?: () => PanelTemplate[];
}
```

---

For questions or issues, please refer to the main README or open an issue in the project repository.