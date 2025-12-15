# @nexus/reactor

> Isomorphic execution engine for Nexus Panels. Transforms NXML definitions into living, interactive React applications.

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()

## 📖 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [NXML Language](#nxml-language)
- [Components](#components)
- [Examples](#examples)
- [Development](#development)
- [Testing](#testing)
- [Performance](#performance)
- [Security](#security)
- [Contributing](#contributing)

## Overview

The **Nexus Reactor** is the runtime execution engine that powers Nexus Panels. It takes declarative NXML (Nexus Extensible Markup Language) source code and transforms it into fully interactive React applications with:

- 🔄 **Reactive state management** with automatic dependency tracking
- 🔒 **Sandboxed JavaScript execution** for secure handler code
- 🎨 **12-column responsive grid layout** with automatic flow
- 🤖 **AI-native tool exposure** via Model Context Protocol (MCP)
- ⚡ **Imperative view manipulation** for high-performance updates
- 🧩 **Standard Component Library** with 13+ pre-built components

### What is NXML?

NXML is a semantic markup language that separates concerns into three isolated namespaces:

- **Data** - Reactive state and computed values
- **Logic** - Sandboxed tools, handlers, and lifecycle hooks
- **View** - Semantic UI component tree

```xml
<NexusPanel title="Counter">
  <Data>
    <State name="count" type="number" default="0" />
  </Data>

  <Logic>
    <Tool name="increment">
      <Handler>$state.count++</Handler>
    </Tool>
  </Logic>

  <View>
    <Layout strategy="stack">
      <Text content="Count: {$state.count}" variant="h2" />
      <Button label="Increment" trigger="increment" />
    </Layout>
  </View>
</NexusPanel>
```

## Features

### Core Capabilities

- ✅ **Full NXML Parser** - Tokenizer, AST generator, and validator
- ✅ **Reactive State** - Proxy-based fine-grained reactivity with computed values
- ✅ **Secure Sandbox** - Isolated execution environment with forbidden global shadowing
- ✅ **Layout Engine** - Automatic 12-column grid layout with "Tetris" algorithm
- ✅ **Component Library** - 13 pre-built components (Button, Input, Chart, etc.)
- ✅ **MCP Integration** - AI-ready tool exposure and state inspection
- ✅ **Lifecycle Hooks** - Mount/unmount handlers
- ✅ **Extensions API** - Pluggable external capabilities (HTTP, FS, etc.)
- ✅ **Event System** - Type-safe event emitter for lifecycle events
- ✅ **Debug Mode** - Comprehensive logging and inspection

### Security Features

- 🔒 **No Direct DOM Access** - Handlers cannot access `window` or `document`
- 🔒 **No Network Access** - Handlers cannot use `fetch` or `XMLHttpRequest`
- 🔒 **No Global Mutation** - Forbidden globals shadowed as `undefined`
- 🔒 **Type Validation** - Runtime type checking for state and arguments
- 🔒 **Expression Sandboxing** - Safe evaluation of binding expressions

## Installation

```bash
npm install @nexus/reactor
```

### Peer Dependencies

```bash
npm install react@^18.0.0 react-dom@^18.0.0
```

## Quick Start

### Basic Usage

```typescript
import { NexusReactor } from '@nexus/reactor';

const nxmlSource = `
<NexusPanel title="Hello World">
  <Data>
    <State name="message" type="string" default="Hello, Nexus!" />
  </Data>

  <View>
    <Text content="{$state.message}" variant="h1" />
  </View>
</NexusPanel>
`;

// Create reactor instance
const reactor = new NexusReactor({
  source: nxmlSource,
  debug: true,
});

// Mount and get React component
await reactor.mount();
const PanelComponent = reactor.getComponent();

// Render in your React app
function App() {
  return <PanelComponent />;
}
```

### With Extensions

```typescript
const reactor = new NexusReactor({
  source: nxmlSource,

  // Provide external capabilities
  extensions: {
    http: {
      get: async (url: string) => {
        const response = await fetch(url);
        return { json: await response.json(), status: response.status };
      },
    },
  },
});
```

### With Initial State

```typescript
const reactor = new NexusReactor({
  source: nxmlSource,

  // Restore previous state
  initialState: {
    count: 42,
    username: 'Alice',
  },
});
```

## Architecture

### Data Flow

```
NXML Source
    ↓
[Parser] → AST
    ↓
[Validator] → Validated AST
    ↓
[Layout Engine] → Layout-enhanced AST
    ↓
┌─────────────────┬──────────────────┬─────────────────┐
│   State Store   │  Sandbox         │  View Registry  │
│   (Reactive)    │  (Execution)     │  (Imperative)   │
└─────────────────┴──────────────────┴─────────────────┘
         ↓                ↓                  ↓
    [Hydrator] ────────────────────────────────→
         ↓
    React Component
```

### Modules

```
@nexus/reactor/
├── core/          # Core types, constants, errors, events
├── parser/        # NXML lexer, parser, validator
├── state/         # Reactive state store, proxy, computed
├── sandbox/       # Secure handler execution
├── layout/        # Grid layout engine
├── view/          # Hydrator, registry, scope, bindings
├── components/    # Standard Component Library (SCL)
├── mcp/           # Model Context Protocol bridge
└── utils/         # Expression evaluation, coercion, debug
```

## API Reference

### NexusReactor

The main reactor class that orchestrates everything.

#### Constructor

```typescript
new NexusReactor(config: ReactorConfig)
```

**ReactorConfig:**

```typescript
interface ReactorConfig {
  /** NXML source code */
  source: string;

  /** External capabilities (HTTP, FS, etc.) */
  extensions?: Record<string, unknown>;

  /** Initial state values (for restoration) */
  initialState?: Record<string, RuntimeValue>;

  /** Enable debug logging */
  debug?: boolean;
}
```

#### Methods

```typescript
// Lifecycle
await reactor.mount(): Promise<void>
await reactor.unmount(): Promise<void>

// Component
reactor.getComponent(): React.FC

// State
reactor.getState(): Record<string, RuntimeValue>
reactor.setState(values: Record<string, RuntimeValue>): void

// Tools
await reactor.executeTool(name: string, args?: Record<string, unknown>): Promise<ToolResult>
reactor.getTools(): MCPTool[]

// MCP
reactor.readResource(uri: string): { content: unknown; mimeType: string } | null

// Events
reactor.events: ReactorEventEmitter
reactor.logStream: LogStream
```

#### Events

```typescript
reactor.events.on('mount', (event) => { /* ... */ });
reactor.events.on('unmount', (event) => { /* ... */ });
reactor.events.on('stateChange', (event) => { /* ... */ });
reactor.events.on('toolExecute', (event) => { /* ... */ });
reactor.events.on('error', (event) => { /* ... */ });
reactor.events.on('emit', (event) => { /* ... */ });
```

### Parser API

```typescript
import { parse, validate, validateOrThrow } from '@nexus/reactor';

// Parse NXML to AST
const ast = parse(nxmlSource);

// Validate AST
const result = validate(ast);
if (!result.valid) {
  console.error(result.errors);
}

// Validate or throw
validateOrThrow(ast); // Throws on validation failure
```

### State API

```typescript
import { createStateStore, subscribe, getSnapshot } from '@nexus/reactor';

// Create store
const store = createStateStore(dataAST, initialValues);

// Subscribe to changes
const unsubscribe = subscribe(store, () => {
  console.log('State changed:', getSnapshot(store));
}, 'subscriber-id');

// Access state
const value = store.proxy.count;
store.proxy.count = 42;
```

## NXML Language

### Data Namespace

Define reactive state and computed values.

```xml
<Data>
  <!-- State variables -->
  <State name="count" type="number" default="0" />
  <State name="items" type="list" default="[]" />
  <State name="config" type="object" default="{}" />

  <!-- Computed values -->
  <Computed name="doubleCount" value="$state.count * 2" />
  <Computed name="itemCount" value="$state.items.length" />
</Data>
```

**Supported Types:**
- `string` - Text values
- `number` - Numeric values
- `boolean` - True/false
- `list` - Arrays
- `object` - Key-value maps

### Logic Namespace

Define behavior with sandboxed JavaScript.

```xml
<Logic>
  <!-- Extensions (external capabilities) -->
  <Extension name="nexus.http" alias="http" />

  <!-- Tools (functions callable by UI or AI) -->
  <Tool name="fetchData" description="Fetch data from API">
    <Arg name="url" type="string" required="true" />
    <Arg name="method" type="string" default="GET" />

    <Handler>
      $log('Fetching:', $args.url);

      try {
        const response = await $ext.http.get($args.url);
        $state.data = response.json;
        $emit('toast', 'Data loaded');
      } catch (error) {
        $state.error = error.message;
        $emit('toast', 'Failed to load data');
      }
    </Handler>
  </Tool>

  <!-- Lifecycle hooks -->
  <Lifecycle on="mount">
    <Handler>
      $log('Panel mounted');
      $state.initialized = true;
    </Handler>
  </Lifecycle>
</Logic>
```

**Sandbox APIs:**

| Global | Type | Description |
|--------|------|-------------|
| `$state` | `Proxy` | Read/write access to reactive state |
| `$args` | `Object` | Read-only tool arguments |
| `$view` | `Object` | Imperative UI manipulation |
| `$emit` | `Function` | Event emitter (toast, modal, etc.) |
| `$ext` | `Object` | Access to extensions |
| `$log` | `Function` | Safe logging |

### View Namespace

Define UI structure with semantic components.

```xml
<View>
  <Layout strategy="auto" gap="md">
    <!-- Display components -->
    <Text content="Hello World" variant="h1" />
    <Metric label="CPU" value="{$state.cpu}" unit="%" />
    <StatusBadge label="{$state.status}" status="success" />

    <!-- Input components -->
    <Input bind="$state.username" placeholder="Username" />
    <Switch bind="$state.enabled" label="Enable feature" />
    <Button label="Submit" trigger="submitForm" variant="primary" />

    <!-- Control flow -->
    <If condition="{$state.items.length > 0}">
      <Iterate items="{$state.items}" as="item" key="id">
        <Text content="{$scope.item.name}" />
      </Iterate>
    </If>
  </Layout>
</View>
```

## Components

### Layout Components

#### Layout
Arranges children in a grid or stack.

```xml
<Layout strategy="auto" gap="md" align="center" justify="start">
  <!-- children -->
</Layout>
```

**Props:**
- `strategy`: `'auto'` | `'stack'` | `'row'` (default: `'auto'`)
- `gap`: `'sm'` | `'md'` | `'lg'` (default: `'md'`)
- `align`: `'start'` | `'center'` | `'end'` | `'stretch'`
- `justify`: `'start'` | `'center'` | `'end'` | `'stretch'`

#### Container
Groups content with optional title and styling.

```xml
<Container title="Settings" variant="card">
  <!-- children -->
</Container>
```

**Props:**
- `title`: Optional header title
- `variant`: `'card'` | `'panel'` | `'section'` | `'transparent'`

### Display Components

#### Text
Displays text with various styles.

```xml
<Text content="Hello" variant="h1" />
<Text content="{$state.message}" variant="body" />
```

**Props:**
- `content`: Text or binding expression
- `variant`: `'h1'` | `'h2'` | `'h3'` | `'h4'` | `'body'` | `'code'` | `'caption'`

#### Metric
Displays a metric with optional unit and trend.

```xml
<Metric label="CPU Usage" value="{$state.cpu}" unit="%" trend="{$state.trend}" />
```

#### StatusBadge
Shows status with color coding.

```xml
<StatusBadge label="{$state.status}" status="success" />
```

**Status values:** `'success'` | `'warn'` | `'error'` | `'info'`

#### Chart
Renders data visualizations.

```xml
<Chart type="line" data="{$state.history}" xKey="time" yKey="value" height="300" />
```

**Types:** `'line'` | `'bar'` | `'pie'` | `'area'`

#### LogStream
Scrollable log viewer.

```xml
<LogStream data="{$state.logs}" height="200" autoScroll="true" />
```

### Input Components

#### Input
Text input with two-way binding.

```xml
<Input bind="$state.username" placeholder="Enter name" inputType="text" />
```

**Input types:** `'text'` | `'number'` | `'password'` | `'email'`

#### Button / Action
Clickable button that triggers a tool.

```xml
<Button label="Submit" trigger="submit" variant="primary" />
<Action label="Delete" trigger="delete" variant="danger" args="[$scope.item.id]" />
```

**Variants:** `'primary'` | `'secondary'` | `'danger'` | `'ghost'`

#### Switch
Toggle switch with two-way binding.

```xml
<Switch bind="$state.enabled" label="Enable feature" />
```

### Control Flow Components

#### If
Conditional rendering.

```xml
<If condition="{$state.isLoggedIn}">
  <Text content="Welcome back!" />
</If>
```

#### Iterate
Loop over an array.

```xml
<Iterate items="{$state.todos}" as="todo" key="id">
  <Text content="{$scope.todo.text}" />
  <Button label="Delete" trigger="delete" args="[$scope.todo.id]" />
</Iterate>
```

**Dynamic Args (Thunk Pattern):**
The `args` attribute is evaluated at interaction time, allowing you to pass loop item data to tools.

## Examples

### Counter

```xml
<NexusPanel title="Counter">
  <Data>
    <State name="count" type="number" default="0" />
  </Data>

  <Logic>
    <Tool name="increment">
      <Handler>$state.count++</Handler>
    </Tool>
    <Tool name="decrement">
      <Handler>$state.count--</Handler>
    </Tool>
    <Tool name="reset">
      <Handler>$state.count = 0</Handler>
    </Tool>
  </Logic>

  <View>
    <Layout strategy="stack" gap="md">
      <Text content="Count: {$state.count}" variant="h1" />
      <Layout strategy="row" gap="sm">
        <Button label="-" trigger="decrement" variant="secondary" />
        <Button label="Reset" trigger="reset" variant="ghost" />
        <Button label="+" trigger="increment" variant="primary" />
      </Layout>
    </Layout>
  </View>
</NexusPanel>
```

### Todo List

```xml
<NexusPanel title="Todo List">
  <Data>
    <State name="todos" type="list" default="[]" />
    <State name="input" type="string" default="" />
    <Computed name="remaining" value="$state.todos.filter(t => !t.done).length" />
  </Data>

  <Logic>
    <Tool name="add">
      <Handler>
        if ($state.input.trim()) {
          $state.todos.push({
            id: Date.now(),
            text: $state.input,
            done: false
          });
          $state.input = "";
        }
      </Handler>
    </Tool>

    <Tool name="toggle">
      <Arg name="id" type="number" required="true" />
      <Handler>
        const todo = $state.todos.find(t => t.id === $args.id);
        if (todo) todo.done = !todo.done;
      </Handler>
    </Tool>

    <Tool name="remove">
      <Arg name="id" type="number" required="true" />
      <Handler>
        $state.todos = $state.todos.filter(t => t.id !== $args.id);
      </Handler>
    </Tool>
  </Logic>

  <View>
    <Layout strategy="stack" gap="md">
      <Text content="Tasks ({$state.remaining} remaining)" variant="h2" />

      <Layout strategy="row" gap="sm">
        <Input bind="$state.input" placeholder="What needs to be done?" />
        <Button label="Add" trigger="add" variant="primary" />
      </Layout>

      <Iterate items="{$state.todos}" as="todo" key="id">
        <Layout strategy="row" align="center" gap="sm">
          <Switch bind="$scope.todo.done" />
          <Text content="{$scope.todo.text}" />
          <Button label="×" trigger="remove" variant="danger" args="[$scope.todo.id]" />
        </Layout>
      </Iterate>
    </Layout>
  </View>
</NexusPanel>
```

### Server Monitor

```xml
<NexusPanel title="Server Monitor">
  <Data>
    <State name="status" type="string" default="offline" />
    <State name="cpu" type="number" default="0" />
    <State name="memory" type="number" default="0" />
    <State name="logs" type="list" default="[]" />
    <Computed name="isHealthy" value="$state.cpu < 80 && $state.memory < 80" />
  </Data>

  <Logic>
    <Extension name="nexus.http" alias="http" />

    <Tool name="checkHealth">
      <Handler>
        try {
          const response = await $ext.http.get('https://api.server.com/health');
          $state.status = response.json.status;
          $state.cpu = response.json.cpu;
          $state.memory = response.json.memory;
          $state.logs.push(`Health check: ${response.json.status}`);
        } catch (error) {
          $state.status = 'error';
          $state.logs.push(`Error: ${error.message}`);
        }
      </Handler>
    </Tool>

    <Lifecycle on="mount">
      <Handler>
        $log('Server monitor initialized');
      </Handler>
    </Lifecycle>
  </Logic>

  <View>
    <Layout strategy="stack" gap="md">
      <Container title="Status">
        <Layout strategy="auto" gap="md">
          <StatusBadge
            label="{$state.status}"
            status="{$state.isHealthy ? 'success' : 'error'}"
          />
          <Metric label="CPU" value="{$state.cpu}" unit="%" />
          <Metric label="Memory" value="{$state.memory}" unit="%" />
          <Action label="Refresh" trigger="checkHealth" variant="primary" />
        </Layout>
      </Container>

      <Container title="Logs">
        <LogStream data="{$state.logs}" height="200" />
      </Container>
    </Layout>
  </View>
</NexusPanel>
```

## Development

### Setup

```bash
# Clone repository
git clone https://github.com/your-org/nexus-mono.git
cd nexus-mono/packages/nexus-reactor

# Install dependencies
npm install

# Run type checking
npm run typecheck

# Start dev server
npm run dev
```

### Project Structure

```
nexus-reactor/
├── src/
│   ├── core/          # Types, constants, errors
│   ├── parser/        # Lexer, parser, validator
│   ├── state/         # State store, reactivity
│   ├── sandbox/       # Handler execution
│   ├── layout/        # Grid layout engine
│   ├── view/          # Hydrator, registry
│   ├── components/    # SCL components
│   ├── mcp/           # MCP bridge
│   ├── utils/         # Utilities
│   ├── reactor.ts     # Main reactor class
│   └── index.ts       # Public API
├── test/
│   ├── App.tsx        # Test harness
│   ├── main.tsx       # Entry point
│   └── index.html     # HTML template
└── dist/              # Compiled output
```

### Build

```bash
# Type check
npm run typecheck

# Build library
npm run build

# Preview build
npm run preview
```

## Testing

### Test Harness

The reactor includes a comprehensive test harness with two example panels:

```bash
npm run dev
# Open http://localhost:3000
```

**Examples:**
1. **Server Monitor** - Tests async handlers, extensions, imperative view
2. **Todo List** - Tests Iterate, dynamic args, two-way binding

### Manual Testing

```typescript
import { NexusReactor } from '@nexus/reactor';

const nxml = `/* your NXML */`;

const reactor = new NexusReactor({
  source: nxml,
  debug: true, // Enable logging
});

// Listen to events
reactor.events.on('mount', () => console.log('Mounted'));
reactor.events.on('toolExecute', (e) => console.log('Tool:', e));
reactor.events.on('error', (e) => console.error('Error:', e));

await reactor.mount();
const Component = reactor.getComponent();
```

### Unit Tests

```bash
# Run tests (when available)
npm test
```

## Performance

### Optimization Tips

1. **Use Computed Values** - Avoid redundant calculations
   ```xml
   <Computed name="filteredItems" value="$state.items.filter(i => i.active)" />
   ```

2. **Minimize State Updates** - Batch updates when possible
   ```javascript
   // Bad: Multiple updates
   $state.x = 1;
   $state.y = 2;
   $state.z = 3;

   // Good: Single update
   Object.assign($state, { x: 1, y: 2, z: 3 });
   ```

3. **Use Imperative View for High-Frequency Updates**
   ```javascript
   // For rapidly changing data (e.g., logs)
   $view.getElementById('logs').setProp('data', newLogs);
   ```

4. **Specify Keys in Iterate**
   ```xml
   <Iterate items="{$state.items}" as="item" key="id">
     <!-- React can optimize re-renders -->
   </Iterate>
   ```

### Performance Characteristics

- **State updates**: O(1) for direct access, O(n) for subscribers
- **Computed values**: Cached until dependencies change
- **Layout calculation**: O(n) for component count
- **Rendering**: Standard React Virtual DOM performance

## Security

### Sandbox Security Model

The reactor enforces a strict security boundary:

**✅ Allowed:**
- Read/write reactive state (`$state`)
- Call registered tools
- Use provided extensions (`$ext`)
- Emit events (`$emit`)
- Log messages (`$log`)

**❌ Forbidden:**
- Access `window`, `document`, `globalThis`
- Use `fetch`, `XMLHttpRequest`, `WebSocket`
- Call `eval()` or `Function()` constructor
- Access `localStorage`, `sessionStorage`
- Use timers (`setTimeout`, `setInterval`)
- Direct DOM manipulation

### Extension Security

Extensions should be carefully vetted:

```typescript
// ✅ Good: Controlled HTTP access
extensions: {
  http: {
    get: async (url: string) => {
      // Validate URL, add auth headers, rate limit, etc.
      if (!isAllowedURL(url)) throw new Error('Forbidden');
      return authenticatedFetch(url);
    },
  },
}

// ❌ Bad: Direct fetch access
extensions: {
  http: fetch, // Don't do this!
}
```

### Best Practices

1. **Validate Tool Arguments** - The reactor validates types, but add business logic validation
2. **Sanitize User Input** - React escapes output by default, but validate inputs
3. **Rate Limit Tools** - Add rate limiting for expensive operations
4. **Audit Extensions** - Review extension code carefully
5. **Use CSP Headers** - Add Content-Security-Policy headers in production

## Contributing

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run type checking (`npm run typecheck`)
5. Test your changes (`npm run dev`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Code Style

- Use TypeScript for all new code
- Follow existing code conventions
- Add JSDoc comments for public APIs
- Write tests for new features
- Keep files focused and modular

### Reporting Issues

Please use GitHub Issues to report bugs or request features. Include:

- Reactor version
- NXML source (if applicable)
- Steps to reproduce
- Expected vs actual behavior
- Error messages / stack traces

## License

MIT © Nexus Team

---

## Resources

- **Documentation**: [Nexus Protocol Spec](../../docs/01_protocol_spec.md)
- **Reactor Spec**: [Reactor Implementation Spec](../../docs/01_reactor_spec.md)
- **Examples**: [Test Harness](./test/App.tsx)
- **Issue Tracker**: GitHub Issues
- **Discussions**: GitHub Discussions

## Acknowledgments

Built with:
- React 18 - UI framework
- TypeScript - Type safety
- Vite - Build tool
- Zod - Schema validation (via @nexus/protocol)

---

**Made with ❤️ by the Nexus Team**
