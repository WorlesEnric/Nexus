# Nexus GraphStudio IDE

A modern, AI-powered graphical authoring IDE built with React that supports multiple creative workflows through a unified panel-based architecture.

## Overview

Nexus GraphStudio is designed to handle various graphical authoring tasks in a unified way:

- **Flowchart Creation** - Visual flow diagram editing with drag-and-drop nodes
- **Kanban Boards** - Task management with customizable columns
- **Code Editing** - Syntax-highlighted code editor with multiple language support
- **Creative Canvas** - Shape drawing and manipulation
- **AI Chat Assistant** - Contextual AI assistance across all panels
- **Source Notes** - Reference material management

The IDE follows a "Tri-Fold Flow" paradigm inspired by NotebookLM, where panels represent functional units that can be expanded, minimized, or hidden based on user workflow needs.

## Architecture

### Core Concepts

**Panel-Based Architecture**

Each functional unit is a "Panel" - a self-contained micro-application that implements a standard interface (`IStudioPanelDefinition`). Panels can:

- Render their own UI
- Expose data to AI through standardized context methods
- Accept drag-and-drop data from other panels
- Export content in multiple formats

**The Shell (Container)**

The Shell acts as the "commander," coordinating collaboration between panels. It manages:

- Layout and panel modes (hidden, minimized, flexible, fullscreen)
- Command palette for quick actions
- Global keyboard shortcuts
- Cross-panel drag-and-drop coordination
- AI context aggregation

**Panel Modes**

| Mode | Description |
|------|-------------|
| `hidden` | Panel lives only in sidebar, not visible in workspace |
| `minimized` | Visible as a thin vertical bar in workspace |
| `flexible` | Takes shared available space (default) |
| `fullscreen` | Occupies entire workspace |

### Project Structure

```
Nexus/
├── src/
│   ├── App.jsx                 # Root component
│   ├── main.jsx                # Entry point
│   ├── index.css               # Global styles & utilities
│   │
│   ├── components/             # Shell components
│   │   ├── Shell.jsx           # Main container/commander
│   │   ├── Sidebar.jsx         # The Dock (panel icons)
│   │   ├── Workspace.jsx       # Panel layout area
│   │   ├── PanelContainer.jsx  # Individual panel wrapper
│   │   ├── PanelHeader.jsx     # Panel chrome (title, controls)
│   │   ├── CommandPalette.jsx  # Quick actions (⌘K)
│   │   └── AddPanelModal.jsx   # Panel type selector
│   │
│   ├── context/
│   │   └── StudioContext.jsx   # Global state (Zustand store)
│   │
│   ├── hooks/
│   │   └── useDragDrop.js      # Drag & drop utilities
│   │
│   └── panels/                 # Panel implementations
│       ├── BasePanelInterface.js    # Interface definition
│       ├── registry.js              # Panel registration
│       ├── DummyCanvasPanel.jsx     # Shape drawing
│       ├── DummyChatPanel.jsx       # AI assistant
│       ├── DummyCodePanel.jsx       # Code editor
│       ├── DummyFlowchartPanel.jsx  # Flow diagrams
│       ├── DummyKanbanPanel.jsx     # Task boards
│       └── DummyNotesPanel.jsx      # Source notes
│
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
# Clone or extract the project
cd Nexus

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

The development server runs at `http://localhost:5173`

## Usage

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open Command Palette |
| `⌘N` / `Ctrl+N` | Add New Panel |
| `Escape` | Close modals |

### Basic Workflow

1. **Add Panels** - Click the `+` button in the sidebar or press `⌘N`
2. **Arrange Layout** - Panels automatically share space in flexible mode
3. **Focus Panel** - Click a panel to focus it; use maximize button for fullscreen
4. **Enable AI Context** - Click the eye icon to let AI observe panel content
5. **Use Command Palette** - Press `⌘K` for quick actions

### Panel Controls

Each panel header provides:

- **AI Toggle** (eye icon) - Enable/disable AI observation
- **Minimize** - Collapse to vertical bar
- **Maximize** - Expand to fullscreen
- **More Menu** - Rename, duplicate, export, remove
- **Close** - Hide panel (remains in sidebar)

## Features

### Cross-Panel Drag & Drop

The IDE supports dragging content between panels:

```javascript
// Content types supported
ContentTypes = {
  TEXT_PLAIN: 'text/plain',
  TEXT_MARKDOWN: 'text/markdown',
  TEXT_CODE: 'text/code',
  DSL_FLOWCHART: 'dsl/flowchart',
  DSL_KANBAN: 'dsl/kanban',
  DSL_SVG: 'dsl/svg',
  IMAGE_PNG: 'image/png',
  IMAGE_SVG: 'image/svg+xml',
  JSON: 'application/json',
  PANEL_REF: 'application/x-panel-ref',
}
```

Each panel declares what content types it accepts via `dropZone.acceptTypes`.

### AI Integration

Panels implement two key methods for AI integration:

- `getLLMContext()` - Returns panel data for AI to understand current state
- `applyLLMChange()` - Applies AI-generated changes to panel

When AI observation is enabled (eye icon active), the Chat panel can aggregate context from all observed panels.

### Command Palette

The command palette (`⌘K`) provides:

- Global commands (add panel, settings, help)
- Panel-specific actions (show/hide/focus/remove)
- Quick panel creation shortcuts
- Fuzzy search across all commands

## Technology Stack

- **React 18** - UI framework
- **Zustand** - State management
- **Framer Motion** - Animations
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **Vite** - Build tool

## Implementation Status

### Fully Implemented

- ✅ Panel Interface Protocol (`IStudioPanelDefinition`)
- ✅ Panel Registry with dynamic registration
- ✅ Four layout modes (hidden, minimized, flexible, fullscreen)
- ✅ Command Palette with fuzzy search
- ✅ Sidebar dock with panel management
- ✅ Drag & drop infrastructure
- ✅ AI observation flag per panel
- ✅ Six demo panels (Canvas, Chat, Code, Flowchart, Kanban, Notes)

### Partially Implemented

- ⚠️ Cross-panel drag & drop (infrastructure ready, handlers need real logic)
- ⚠️ AI context aggregation (interface defined, needs LLM integration)
- ⚠️ Panel export functionality (UI present, needs implementation)

### Not Yet Implemented

- ❌ Context Linking/Wiring between panels
- ❌ Multi-monitor/Pop-out support
- ❌ Real AI/LLM integration
- ❌ DSL conversion between panel types
- ❌ Undo/redo system
- ❌ Persistence/save functionality

## Design Philosophy

### The Tri-Fold Flow

The IDE follows a three-layer paradigm:

1. **Input Layer (Left)** - Context and source materials (Notes, documents)
2. **Thinking Layer (Center)** - AI dialogue and instruction (Chat)
3. **Output Layer (Right)** - Creative canvases (Flowchart, Canvas, Code)

### AI-Native Design

Every panel is designed with AI integration in mind:

- Standardized context export (`getLLMContext`)
- Declarative change application (`applyLLMChange`)
- Observable state for AI assistants
- DSL-based data representation for AI comprehension

## Contributing

### Adding New Panels

See [PANEL_CUSTOMIZATION.md](./PANEL_CUSTOMIZATION.md) for detailed instructions on:

- Implementing the `IStudioPanelDefinition` interface
- Registering panels with the registry
- Setting up drag & drop
- Integrating with AI context

### Code Style

- Use functional React components with hooks
- Follow the existing Tailwind utility patterns
- Implement all interface methods, even if stubbed
- Document panel-specific state shape

## License

Proprietary - See LICENSE for details

## Acknowledgments

- UI inspiration from NotebookLM's tri-column layout
- Glass morphism design patterns
- VS Code's command palette concept