# Nexus Protocol Specification

Version: 1.1.0 (Reactor Ready)

Last Updated: December 2025

Status: Implementation Standard

Target Package: @nexus/reactor

Reference Implementation: @nexus/protocol v1.0.0

------

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [NXML Language Specification](#3-nxml-language-specification)
4. [AST Structure Reference](#4-ast-structure-reference)
5. [Zod Schema Reference](#5-zod-schema-reference)
6. [Validation Rules](#6-validation-rules)
7. [NOG (Nexus Object Graph)](#7-nog-nexus-object-graph)
8. [Explicit Sync Workflow](#8-explicit-sync-workflow)
9. [Security Model](#9-security-model)
10. [Utility Types and Functions](#10-utility-types-and-functions)
11. [Usage Examples](#11-usage-examples)
12. [Appendix: Layout Weights](#12-appendix-layout-weights)
13. [Appendix: API Reference](#13-appendix-api-reference)

------

## 1. Overview

### 1.1 Purpose

The Nexus Protocol defines the contract for the Nexus platform. It specifies the structure of **Panels** (UI units), the **NXML** markup language, and the **Runtime Environment** required to execute them securely in browsers and server-side WASM containers.

### 1.2 Package Structure

```
@nexus/protocol
├── ast/        # AST type definitions
│   ├── common.ts   # Shared types and constants
│   ├── data.ts     # Data namespace AST
│   ├── logic.ts    # Logic namespace AST
│   ├── view.ts     # View namespace AST
│   └── panel.ts    # Root NexusPanel AST
├── schemas/    # Zod validation schemas
│   ├── data.ts     # Data validation
│   ├── logic.ts    # Logic validation
│   ├── view.ts     # View validation
│   └── panel.ts    # Panel validation
├── nog/        # Nexus Object Graph
│   ├── entity.ts   # Entity definitions
│   ├── relationship.ts # Relationship definitions
│   ├── graph.ts    # Graph operations
│   └── patch.ts    # Sync patch definitions
└── utils/      # Utility functions
    └── types.ts    # Helper types and functions
```

### 1.3 Design Principles

- **Isomorphic Execution**: Panels must run in a browser (full UI) and in a headless backend (logic/AI only).
- **Sandboxed Logic**: No direct access to globals; all side effects must go through managed APIs (`$state`, `$ext`, `$view`).
- **Hybrid Reactivity**: Supports standard reactive data binding AND imperative UI manipulation for high-performance needs.
- **AI-Native**: Tools are self-describing typed functions that the NexusOS AI can invoke directly.
- **Type-Safe Validation**: All structures are validated with Zod schemas at runtime.

------

## 2. Architecture

### 2.1 Namespace Isolation

NXML separates concerns into three distinct namespaces to ensure security and clean architecture.

```
graph TD
    subgraph NexusPanel
        Data[Data Namespace] -->|Proxy| Logic
        Data -->|Binding| View
        
        Logic[Logic Namespace] -->|Mutate| Data
        Logic -->|Imperative| View
        Logic -->|Emit| Host[Host System]
        
        View[View Namespace] -->|Trigger| Logic
        View -->|Read| Data
    end
```

1. **DATA**: Reactive state and computed values.
2. **LOGIC**: Sandboxed functions (Tools, Handlers) and Lifecycle hooks.
3. **VIEW**: Semantic component tree (Layouts, Controls, Visualizations).

### 2.2 Data Flow

```
NXML Source → Parser → AST → Validation → Reactor
                                              ↓
                              ┌───────────────┼───────────────┐
                              ↓               ↓               ↓
                         StateStore      Sandbox         ViewEngine
                              ↓               ↓               ↓
                         (Reactive)     (Execution)     (Rendering)
                              └───────────────┴───────────────┘
                                              ↓
                                       React Component
```

------

## 3. NXML Language Specification

### 3.1 Document Structure

```xml
<NexusPanel title="Panel Title" version="1.0.0">
  <Data>...</Data>
  <Logic>...</Logic>
  <View>...</View>
</NexusPanel>
```

### 3.2 Data Namespace

Defines the reactive state. Changes to `$state` automatically trigger View updates.

```xml
<Data>
  <State name="count" type="number" default="0" />
  <State name="user" type="object" default="{}" />
  <State name="items" type="list" default="[]" />
  
  <Computed name="doubleCount" value="$state.count * 2" />
  <Computed name="hasItems" value="$state.items.length > 0" />
</Data>
```

#### Supported Types

| Type | TypeScript Equivalent | Default Value | Description |
|------|-----------------------|---------------|-------------|
| `string` | `string` | `""` | Text values |
| `number` | `number` | `0` | Numeric values |
| `boolean` | `boolean` | `false` | True/false |
| `list` | `RuntimeValue[]` | `[]` | Array of values |
| `object` | `Record<string, RuntimeValue>` | `{}` | Key-value map |

#### Default Value Coercion

The parser automatically coerces string default values:

```typescript
// parseDefaultValue(value: string, type: NXMLPrimitiveType): RuntimeValue
parseDefaultValue("123", "number")     // → 123
parseDefaultValue("true", "boolean")   // → true
parseDefaultValue("[]", "list")        // → []
parseDefaultValue("{}", "object")      // → {}
```

### 3.3 Logic Namespace

Defines behavior using sandboxed JavaScript.

#### The Sandbox API

Code inside handlers runs in a restricted scope. It **cannot** access `window`, `document`, `fetch`, `XMLHttpRequest`, `eval`, or `Function`.

| **API** | **Type** | **Description** | **Example** |
|---------|----------|-----------------|-------------|
| `$state` | `Proxy` | Read/Write access to Data. | `$state.count++` |
| `$args` | `Object` | Read-only arguments passed to the tool. | `$args.id` |
| `$view` | `Object` | Imperative UI manipulation. | `$view.getElementById('log').setProp(...)` |
| `$emit` | `Function` | Send events to host (e.g., Toast). | `$emit('toast', 'Success')` |
| `$ext` | `Object` | Access registered Extensions. | `await $ext.http.get(...)` |
| `$log` | `Function` | Safe console logging. | `$log('Debug info')` |

#### Tools & Handlers

Tools are the public API of the panel (callable by UI or AI). Handlers are the code implementation nested **within** the Tool.

```xml
<Logic>
  <Extension name="nexus.http" alias="http" />
  
  <Tool name="addItem" description="Adds an item to the list">
    <Arg name="text" type="string" required="true" />
    <Arg name="priority" type="number" default="1" description="Item priority (1-5)" />
    
    <Handler>
      $state.items.push({ 
        id: Date.now(), 
        text: $args.text,
        priority: $args.priority
      });
      $emit('toast', 'Item added');
    </Handler>
  </Tool>

  <Lifecycle on="mount">
    <Handler>
      $log('Panel Mounted');
    </Handler>
  </Lifecycle>
  
  <Lifecycle on="unmount">
    <Handler>
      $log('Panel Unmounting');
    </Handler>
  </Lifecycle>
</Logic>
```

#### Lifecycle Events

| Event | Description | Use Cases |
|-------|-------------|-----------|
| `mount` | Fires once when panel loads | Initialize state, fetch data |
| `unmount` | Fires when panel is destroyed | Cleanup, save state |

**Note:** Only one mount and one unmount lifecycle hook is allowed per panel.

#### Extensions

Declarations of external capabilities required by the panel.

```xml
<Extension name="nexus.http" alias="http" />
<Extension name="nexus.fs" alias="fs" />
<Extension name="org.ollama" alias="ai" source="ollama:latest" />
```

Extension naming convention: `{namespace}.{capability}` (e.g., `nexus.fs`, `org.ollama`)

### 3.4 View Namespace

Defines the UI structure using the **Standard Component Library (SCL)**.

#### Global Attributes

All View components support the following attributes:

- **`id`**: Unique identifier for imperative access via `$view`.
- **`trigger`**: Name of a Tool to execute on interaction (click/change).
- **`args`**: Arguments to pass to the tool (Dynamic Expression).

#### Component Categories

| Category | Components | Description |
|----------|------------|-------------|
| **Layout** | `Layout`, `Container` | Structure and arrangement |
| **Control Flow** | `If`, `Iterate` | Conditional and loop rendering |
| **Display** | `Text`, `Metric`, `StatusBadge`, `LogStream`, `Chart` | Data visualization |
| **Input** | `Input`, `Switch`, `Button`, `Action` | User interaction |

#### Layout Component

```xml
<Layout strategy="auto" gap="md" align="center">
  <!-- children -->
</Layout>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `strategy` | `'auto' \| 'stack' \| 'row'` | `'auto'` | Layout algorithm |
| `gap` | `'sm' \| 'md' \| 'lg'` | `'md'` | Spacing between items |
| `align` | `'start' \| 'center' \| 'end' \| 'stretch'` | - | Cross-axis alignment |
| `justify` | `'start' \| 'center' \| 'end' \| 'stretch'` | - | Main-axis alignment |

#### Container Component

```xml
<Container title="Settings" variant="card">
  <!-- children -->
</Container>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | - | Header title |
| `variant` | `'card' \| 'panel' \| 'section' \| 'transparent'` | `'card'` | Visual style |

#### Control Flow Components

**If (Conditional Rendering)**

```xml
<If condition="{$state.count > 0}">
  <Text content="Has items" />
</If>
```

**Iterate (Loop Rendering)**

```xml
<Iterate items="{$state.todos}" as="todo" key="id">
  <Text content="{$scope.todo.title}" />
  <Button label="Delete" trigger="deleteTodo" args="[$scope.todo.id]" />
</Iterate>
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `items` | `BindingExpression` | Yes | Array to iterate |
| `as` | `Identifier` | Yes | Loop variable name |
| `key` | `string` | No | Key for React reconciliation |

#### Display Components

**Text**

```xml
<Text content="{$state.message}" variant="h1" />
```

| Prop | Type | Default | Options |
|------|------|---------|---------|
| `content` | `string \| BindingExpression` | Required | - |
| `variant` | `TextVariant` | `'body'` | `h1`, `h2`, `h3`, `h4`, `body`, `code`, `caption` |

**Metric**

```xml
<Metric label="CPU Usage" value="{$state.cpu}" unit="%" trend="{$state.cpuTrend}" />
```

| Prop | Type | Description |
|------|------|-------------|
| `label` | `string` | Metric label |
| `value` | `string \| BindingExpression` | Display value |
| `unit` | `string` | Unit suffix (e.g., "%", "ms") |
| `trend` | `BindingExpression` | Trend direction |

**StatusBadge**

```xml
<StatusBadge label="{$state.status}" status="{$state.status === 'active' ? 'success' : 'error'}" />
```

| Prop | Type | Options |
|------|------|---------|
| `label` | `string \| BindingExpression` | Badge text |
| `status` | `StatusType \| BindingExpression` | `success`, `warn`, `error`, `info` |

**LogStream**

```xml
<LogStream id="logs" data="{$state.logs}" height="200" autoScroll="true" />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `BindingExpression` | Required | Log entries array |
| `height` | `number \| string` | - | Fixed height |
| `autoScroll` | `boolean` | `true` | Auto-scroll to bottom |

**Chart**

```xml
<Chart type="line" data="{$state.history}" xKey="timestamp" yKey="value" height="300" />
```

| Prop | Type | Options |
|------|------|---------|
| `type` | `ChartType` | `line`, `bar`, `pie`, `area` |
| `data` | `BindingExpression` | Chart data array |
| `xKey` | `string` | X-axis data key |
| `yKey` | `string` | Y-axis data key |
| `height` | `number \| string` | Chart height |

#### Input Components

**Input**

```xml
<Input bind="$state.username" placeholder="Enter username" inputType="text" />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `bind` | `string` | Required | Two-way binding path |
| `placeholder` | `string` | - | Placeholder text |
| `inputType` | `'text' \| 'number' \| 'password' \| 'email'` | `'text'` | Input type |
| `disabled` | `boolean \| BindingExpression` | - | Disable state |

**Button**

```xml
<Button label="Submit" trigger="submitForm" variant="primary" />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | Required | Button text |
| `trigger` | `string` | - | Tool to invoke |
| `variant` | `ButtonVariant` | `'primary'` | `primary`, `secondary`, `danger`, `ghost` |
| `args` | `BindingExpression` | - | Tool arguments |
| `disabled` | `boolean \| BindingExpression` | - | Disable state |

**Action** (Semantic alias for Button with required trigger)

```xml
<Action label="Delete" trigger="deleteItem" variant="danger" args="[$scope.item.id]" />
```

**Switch**

```xml
<Switch bind="$state.enabled" label="Enable feature" />
```

| Prop | Type | Description |
|------|------|-------------|
| `bind` | `string` | Two-way binding to boolean state |
| `label` | `string` | Switch label |
| `disabled` | `boolean \| BindingExpression` | Disable state |

#### Dynamic Arguments (The "Thunk" Pattern)

To pass context (like a loop item ID) to a tool, use the `args` attribute with a binding expression:

```xml
<Iterate items="{$state.todos}" as="todo">
  <Action 
    label="Delete" 
    trigger="deleteTodo" 
    args="[$scope.todo.id]" 
  />
</Iterate>
```

------

## 4. AST Structure Reference

### 4.1 Common Types

```typescript
/**
 * Supported primitive types in NXML state definitions
 */
type NXMLPrimitiveType = 'string' | 'number' | 'boolean' | 'list' | 'object';

/**
 * JavaScript identifier pattern for variable names
 */
type Identifier = string;

/**
 * Expression string that will be evaluated at runtime
 * Examples: "$state.count > 0", "$state.price * $state.qty"
 */
type Expression = string;

/**
 * Binding expression with interpolation syntax
 * Examples: "{$state.user.name}", "{$scope.item.title}"
 */
type BindingExpression = string;

/**
 * Handler code block that runs in the sandbox
 */
type HandlerCode = string;

/**
 * Layout strategy determines how children are arranged
 */
type LayoutStrategy = 'auto' | 'stack' | 'row';

/**
 * Gap sizing options
 */
type GapSize = 'sm' | 'md' | 'lg';

/**
 * Alignment options for flex layouts
 */
type Alignment = 'start' | 'center' | 'end' | 'stretch';

/**
 * Text variant options
 */
type TextVariant = 'h1' | 'h2' | 'h3' | 'h4' | 'body' | 'code' | 'caption';

/**
 * Button variant options
 */
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

/**
 * Status badge states
 */
type StatusType = 'success' | 'warn' | 'error' | 'info';

/**
 * Chart type options
 */
type ChartType = 'line' | 'bar' | 'pie' | 'area';

/**
 * Container variant options
 */
type ContainerVariant = 'card' | 'panel' | 'section' | 'transparent';

/**
 * Lifecycle event types
 */
type LifecycleEvent = 'mount' | 'unmount';

/**
 * Column span for 12-column grid (1-12)
 */
type ColumnSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * Source location for error reporting
 */
interface SourceLocation {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * Base interface for all AST nodes
 */
interface BaseNode {
  loc?: SourceLocation;
}

/**
 * Runtime value that can be stored in state
 */
type RuntimeValue = 
  | string 
  | number 
  | boolean 
  | RuntimeValue[] 
  | { [key: string]: RuntimeValue }
  | null
  | undefined;

/**
 * Validation error structure
 */
interface ValidationError {
  code: string;
  message: string;
  path: string[];
  loc?: SourceLocation;
}

/**
 * Validation result
 */
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
```

### 4.2 NexusPanelAST (Root)

```typescript
interface PanelMeta {
  title: string;
  description?: string;
  id?: string;
  version?: string;
  author?: string;
  tags?: string[];
}

interface NexusPanelAST extends BaseNode {
  readonly kind: 'NexusPanel';
  meta: PanelMeta;
  data: DataAST;
  logic: LogicAST;
  view: ViewAST;
}
```

### 4.3 DataAST

```typescript
interface StateNode extends BaseNode {
  readonly kind: 'State';
  name: Identifier;
  type: NXMLPrimitiveType;
  default?: RuntimeValue;
}

interface ComputedNode extends BaseNode {
  readonly kind: 'Computed';
  name: Identifier;
  value: Expression;  // JavaScript expression referencing $state
}

interface DataAST extends BaseNode {
  readonly kind: 'Data';
  states: StateNode[];
  computed: ComputedNode[];
}
```

### 4.4 LogicAST

```typescript
interface ArgNode extends BaseNode {
  readonly kind: 'Arg';
  name: Identifier;
  type: NXMLPrimitiveType;
  required?: boolean;  // default: true
  default?: unknown;
  description?: string;  // For AI understanding
}

interface HandlerNode extends BaseNode {
  readonly kind: 'Handler';
  code: HandlerCode;
  isAsync?: boolean;  // Detected by presence of 'await'
}

interface ToolNode extends BaseNode {
  readonly kind: 'Tool';
  name: Identifier;
  description?: string;  // For AI understanding
  args: ArgNode[];
  handler: HandlerNode;
}

interface LifecycleNode extends BaseNode {
  readonly kind: 'Lifecycle';
  on: LifecycleEvent;  // 'mount' | 'unmount'
  handler: HandlerNode;
}

interface ExtensionNode extends BaseNode {
  readonly kind: 'Extension';
  name: string;      // Capability ID (e.g., "nexus.fs")
  alias: Identifier; // Access via $ext.{alias}
  source?: string;   // Optional version/source
}

interface LogicAST extends BaseNode {
  readonly kind: 'Logic';
  extensions: ExtensionNode[];
  tools: ToolNode[];
  lifecycles: LifecycleNode[];
}
```

### 4.5 ViewAST

```typescript
interface LayoutInfo {
  colSpan: ColumnSpan;  // 1-12
  className: string;
  newRow?: boolean;
}

interface ViewNodeBase extends BaseNode {
  type: string;
  id?: string;
  props: Record<string, unknown>;
  children: ViewNode[];
  layout?: LayoutInfo;  // Injected by LayoutEngine
}

// Layout Components
interface LayoutNode extends ViewNodeBase {
  type: 'Layout';
  props: {
    id?: string;
    strategy?: LayoutStrategy;
    gap?: GapSize;
    align?: Alignment;
    justify?: Alignment;
  };
}

interface ContainerNode extends ViewNodeBase {
  type: 'Container';
  props: {
    id?: string;
    title?: string;
    variant?: ContainerVariant;
  };
}

// Control Flow Components
interface IfNode extends ViewNodeBase {
  type: 'If';
  props: {
    id?: string;
    condition: BindingExpression;
  };
}

interface IterateNode extends ViewNodeBase {
  type: 'Iterate';
  props: {
    id?: string;
    items: BindingExpression;
    as: Identifier;
    key?: string;
  };
}

// Display Components
interface TextNode extends ViewNodeBase {
  type: 'Text';
  props: {
    id?: string;
    content: string | BindingExpression;
    variant?: TextVariant;
  };
}

interface MetricNode extends ViewNodeBase {
  type: 'Metric';
  props: {
    id?: string;
    label: string;
    value: string | BindingExpression;
    trend?: BindingExpression;
    unit?: string;
  };
}

interface StatusBadgeNode extends ViewNodeBase {
  type: 'StatusBadge';
  props: {
    id?: string;
    label: string | BindingExpression;
    status?: StatusType | BindingExpression;
    value?: string | BindingExpression;
  };
}

interface LogStreamNode extends ViewNodeBase {
  type: 'LogStream';
  props: {
    id?: string;
    data: BindingExpression;
    height?: number | string;
    autoScroll?: boolean;
  };
}

interface ChartNode extends ViewNodeBase {
  type: 'Chart';
  props: {
    id?: string;
    type: ChartType;
    data: BindingExpression;
    xKey?: string;
    yKey?: string;
    height?: number | string;
  };
}

// Input Components
interface InputNode extends ViewNodeBase {
  type: 'Input';
  props: {
    id?: string;
    bind: string;
    placeholder?: string;
    inputType?: 'text' | 'number' | 'password' | 'email';
    disabled?: boolean | BindingExpression;
  };
}

interface ButtonNode extends ViewNodeBase {
  type: 'Button';
  props: {
    id?: string;
    label: string;
    trigger?: string;
    variant?: ButtonVariant;
    args?: BindingExpression;
    payload?: string;  // Legacy alias for args
    disabled?: boolean | BindingExpression;
  };
}

interface SwitchNode extends ViewNodeBase {
  type: 'Switch';
  props: {
    id?: string;
    bind: string;
    label?: string;
    disabled?: boolean | BindingExpression;
  };
}

interface ActionNode extends ViewNodeBase {
  type: 'Action';
  props: {
    id?: string;
    label: string;
    trigger: string;  // Required for Action
    variant?: ButtonVariant;
    args?: BindingExpression;
    payload?: string;
    disabled?: boolean | BindingExpression;
  };
}

// Generic node for custom/unknown components
interface GenericViewNode extends ViewNodeBase {
  type: string;
  props: Record<string, unknown>;
}

type ViewNode =
  | LayoutNode
  | ContainerNode
  | IfNode
  | IterateNode
  | TextNode
  | MetricNode
  | StatusBadgeNode
  | LogStreamNode
  | InputNode
  | ButtonNode
  | SwitchNode
  | ChartNode
  | ActionNode
  | GenericViewNode;

interface ViewAST extends BaseNode {
  readonly kind: 'View';
  root: ViewNode;
}
```

------

## 5. Zod Schema Reference

### 5.1 Data Schemas

```typescript
import { z } from 'zod';

// Primitive type enum
const NXMLPrimitiveTypeSchema = z.enum([
  'string', 'number', 'boolean', 'list', 'object'
]);

// Valid JavaScript identifier
const IdentifierSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/, 'Invalid identifier');

// State node schema
const StateNodeSchema = z.object({
  kind: z.literal('State'),
  name: IdentifierSchema,
  type: NXMLPrimitiveTypeSchema,
  default: RuntimeValueSchema.optional(),
  loc: SourceLocationSchema.optional(),
});

// Computed node schema
const ComputedNodeSchema = z.object({
  kind: z.literal('Computed'),
  name: IdentifierSchema,
  value: ExpressionSchema,
  loc: SourceLocationSchema.optional(),
});

// Data AST schema with uniqueness check
const DataASTSchema = z.object({
  kind: z.literal('Data'),
  states: z.array(StateNodeSchema),
  computed: z.array(ComputedNodeSchema),
  loc: SourceLocationSchema.optional(),
}).refine(
  (data) => {
    const names = [...data.states.map(s => s.name), ...data.computed.map(c => c.name)];
    return new Set(names).size === names.length;
  },
  { message: 'Duplicate state/computed names detected' }
);
```

### 5.2 Logic Schemas

```typescript
// Handler code validation - checks for forbidden globals
const HandlerCodeSchema = z
  .string()
  .min(1)
  .refine(
    (code) => {
      const forbidden = ['window', 'document', 'eval', 'Function', 'fetch', 'XMLHttpRequest'];
      for (const word of forbidden) {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        if (regex.test(code)) return false;
      }
      return true;
    },
    { message: 'Handler code contains forbidden globals' }
  );

// Tool node schema
const ToolNodeSchema = z.object({
  kind: z.literal('Tool'),
  name: IdentifierSchema,
  description: z.string().optional(),
  args: z.array(ArgNodeSchema),
  handler: HandlerNodeSchema,
  loc: SourceLocationSchema.optional(),
});

// Extension name format (e.g., "nexus.fs", "org.ollama")
const ExtensionNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/);

// Logic AST with validation rules
const LogicASTSchema = z.object({
  kind: z.literal('Logic'),
  extensions: z.array(ExtensionNodeSchema),
  tools: z.array(ToolNodeSchema),
  lifecycles: z.array(LifecycleNodeSchema),
  loc: SourceLocationSchema.optional(),
}).refine(
  (logic) => new Set(logic.tools.map(t => t.name)).size === logic.tools.length,
  { message: 'Duplicate tool names detected' }
).refine(
  (logic) => new Set(logic.extensions.map(e => e.alias)).size === logic.extensions.length,
  { message: 'Duplicate extension aliases detected' }
).refine(
  (logic) => {
    const mounts = logic.lifecycles.filter(l => l.on === 'mount').length;
    const unmounts = logic.lifecycles.filter(l => l.on === 'unmount').length;
    return mounts <= 1 && unmounts <= 1;
  },
  { message: 'Only one mount and one unmount lifecycle allowed' }
);
```

### 5.3 Panel Schema (Cross-Namespace Validation)

```typescript
// Comprehensive panel validation with cross-reference checks
const NexusPanelASTSchemaStrict = NexusPanelASTSchema.refine(
  (panel) => {
    const stateNames = new Set([
      ...panel.data.states.map(s => s.name),
      ...panel.data.computed.map(c => c.name),
    ]);
    const toolNames = new Set(panel.logic.tools.map(t => t.name));
    
    // Extract references from view
    const { stateRefs } = extractBindingReferences(panel.view.root);
    const triggers = extractTriggerReferences(panel.view.root);
    
    // Validate state references
    for (const ref of stateRefs) {
      if (!stateNames.has(ref)) return false;
    }
    
    // Validate trigger references
    for (const trigger of triggers) {
      if (!toolNames.has(trigger)) return false;
    }
    
    // Validate extension usage
    const extUsage = validateExtensionUsage(panel.logic);
    return extUsage.valid;
  },
  { message: 'Cross-namespace reference validation failed' }
);
```

------

## 6. Validation Rules

### 6.1 Syntax & Schema Validation

| Rule | Description | Error Code |
|------|-------------|------------|
| Forbidden Globals | Code must not contain `window`, `document`, `fetch`, `XMLHttpRequest`, `eval`, `Function` | `FORBIDDEN_GLOBAL` |
| Valid Identifiers | State, Tool, and Arg names must match `/^[a-zA-Z_$][a-zA-Z0-9_$]*$/` | `INVALID_IDENTIFIER` |
| Unique State Names | No duplicate names in states + computed | `DUPLICATE_STATE` |
| Unique Tool Names | No duplicate tool names | `DUPLICATE_TOOL` |
| Unique View IDs | All `id` attributes must be unique | `DUPLICATE_VIEW_ID` |
| Unique Extension Aliases | No duplicate extension aliases | `DUPLICATE_EXTENSION_ALIAS` |
| Single Lifecycle | Only one `mount` and one `unmount` allowed | `DUPLICATE_LIFECYCLE` |

### 6.2 Cross-Reference Integrity

| Rule | Description | Error Code |
|------|-------------|------------|
| State Bindings | `{$state.x}` must resolve to defined State or Computed | `UNDEFINED_STATE_REFERENCE` |
| Trigger References | `trigger="toolName"` must resolve to defined Tool | `UNDEFINED_TOOL_REFERENCE` |
| Scope References | `$scope.x` only valid inside `<Iterate as="x">` | `INVALID_SCOPE_REFERENCE` |
| Extension Usage | `$ext.alias` must match declared Extension | `UNDECLARED_EXTENSION` |

### 6.3 Validation Warnings

| Warning | Description | Code |
|---------|-------------|------|
| Unused State | State defined but never referenced | `UNUSED_STATE` |
| Unused Tool | Tool defined but not triggered from view | `UNUSED_TOOL` |
| No Mount with Extensions | Extensions declared but no mount lifecycle | `NO_MOUNT_WITH_EXTENSIONS` |

### 6.4 Validation API

```typescript
interface PanelValidationResult {
  valid: boolean;
  errors: PanelValidationError[];
  warnings: PanelValidationWarning[];
}

interface PanelValidationError {
  code: string;
  message: string;
  path: string[];
  severity: 'error';
}

interface PanelValidationWarning {
  code: string;
  message: string;
  path: string[];
  severity: 'warning';
}

// Validation functions
function validateNexusPanelAST(ast: unknown): PanelValidationResult;
function validateNexusPanelASTQuick(ast: unknown): z.SafeParseReturnType;  // Schema only
function validateNexusPanelASTStrict(ast: unknown): z.SafeParseReturnType; // With cross-refs
```

------

## 7. NOG (Nexus Object Graph)

The NOG represents the semantic "Truth" of the project. It enables cross-panel synchronization and AI understanding.

### 7.1 Entity Types

```typescript
type EntityCategory =
  | 'concept'     // Abstract ideas or requirements
  | 'component'   // UI or system components
  | 'data'        // Data structures or models
  | 'action'      // Behaviors or operations
  | 'resource'    // External resources or assets
  | 'constraint'  // Rules or limitations
  | 'milestone'   // Project milestones
  | 'custom';

type EntityStatus = 'draft' | 'active' | 'deprecated' | 'archived';

interface NOGEntity {
  id: string;
  name: string;
  category: EntityCategory;
  status: EntityStatus;
  description?: string;
  sourcePanel?: string;
  tags: string[];
  properties: Record<string, EntityPropertyValue>;
  createdAt: number;
  updatedAt: number;
  version: number;
}

// Specialized entity types
interface ConceptEntity extends NOGEntity {
  category: 'concept';
  properties: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    complexity?: 'simple' | 'moderate' | 'complex';
    implementedBy?: EntityRef[];
    dependsOn?: EntityRef[];
  };
}

interface ComponentEntity extends NOGEntity {
  category: 'component';
  properties: {
    type?: 'ui' | 'service' | 'utility' | 'integration';
    panelId?: string;
    stateBindings?: string[];
    toolBindings?: string[];
  };
}

interface DataEntity extends NOGEntity {
  category: 'data';
  properties: {
    schema?: string;
    source?: 'local' | 'remote' | 'computed';
    persistence?: 'memory' | 'session' | 'persistent';
  };
}

interface ActionEntity extends NOGEntity {
  category: 'action';
  properties: {
    trigger?: 'manual' | 'automatic' | 'scheduled';
    inputs?: EntityRef[];
    outputs?: EntityRef[];
    effects?: string[];
    toolName?: string;
  };
}

interface ResourceEntity extends NOGEntity {
  category: 'resource';
  properties: {
    resourceType?: 'api' | 'file' | 'database' | 'service';
    url?: string;
    extensionName?: string;
  };
}
```

### 7.2 Relationship Types

```typescript
type RelationshipType =
  // Structural
  | 'contains'      // Parent-child
  | 'part_of'       // Inverse of contains
  | 'extends'       // Inheritance
  | 'implements'    // Realization
  // Dependencies
  | 'depends_on'    // Requires
  | 'required_by'   // Inverse
  | 'uses'          // Utilizes
  | 'used_by'       // Inverse
  // Data Flow
  | 'produces'      // Outputs
  | 'consumes'      // Inputs
  | 'transforms'    // Modifies
  // Associations
  | 'related_to'    // General
  | 'similar_to'    // Similarity
  | 'conflicts_with'// Contradiction
  // Temporal
  | 'precedes'      // Before
  | 'follows'       // After
  | 'triggers'      // Causes
  | 'custom';

interface NOGRelationship {
  id: string;
  from: string;      // Source entity ID
  to: string;        // Target entity ID
  type: RelationshipType;
  label?: string;    // For custom type
  meta: {
    strength?: number;    // 0-1
    confidence?: number;  // 0-1
    auto?: boolean;
    source?: 'user' | 'ai' | 'system';
    notes?: string;
  };
  properties: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}
```

### 7.3 NOG Graph Operations

```typescript
interface NOGGraph {
  entities: Map<string, NOGEntity>;
  relationships: NOGRelationship[];
  meta: NOGGraphMeta;
}

interface NOGGraphMeta {
  id: string;
  version: number;
  createdAt: number;
  updatedAt: number;
}

// Graph operations
function createNOGGraph(): NOGGraph;
function addEntity(graph: NOGGraph, entity: NOGEntity): NOGGraph;
function removeEntity(graph: NOGGraph, entityId: string): NOGGraph;
function addRelationship(graph: NOGGraph, rel: NOGRelationship): NOGGraph;
function findEntitiesByCategory(graph: NOGGraph, category: EntityCategory): NOGEntity[];
function findConnectedEntities(graph: NOGGraph, entityId: string, depth?: number): NOGEntity[];
function findPath(graph: NOGGraph, fromId: string, toId: string): NOGRelationship[] | null;
```

------

## 8. Explicit Sync Workflow

Nexus does not automatically sync state between panels. All synchronization is explicit and user-approved.

### 8.1 Patch Types

```typescript
type PatchOperation = 'create' | 'update' | 'delete' | 'move' | 'merge' | 'split';
type PatchStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'failed' | 'expired';

interface BasePatch {
  id: string;
  operation: PatchOperation;
  sourcePanel: string;
  targetPanel: string;
  status: PatchStatus;
  description: string;
  reasoning?: string;  // AI-generated explanation
  confidence: number;  // 0-1
  createdAt: number;
  reviewedAt?: number;
  appliedAt?: number;
}

interface EntityPatch extends BasePatch {
  patchType: 'entity';
  entityId?: string;
  data?: Partial<NOGEntity>;
  previousState?: NOGEntity;
}

interface RelationshipPatch extends BasePatch {
  patchType: 'relationship';
  relationshipId?: string;
  data?: Partial<NOGRelationship>;
  previousState?: NOGRelationship;
}

interface ViewPatch extends BasePatch {
  patchType: 'view';
  path: string[];
  value: unknown;
  previousValue?: unknown;
  nxmlDiff?: string;
}

type NOGPatch = EntityPatch | RelationshipPatch | ViewPatch;
```

### 8.2 Sync Workflow

```
1. User Action    → User modifies Panel A
2. NOG Update     → NexusOS updates the graph
3. Detection      → System detects Panel B relies on changed data
4. Patch Gen      → A Patch is generated (status: 'pending')
5. Review         → User reviews proposed changes
6. Decision       → User accepts or rejects patch
7. Apply          → Accepted patches update target panel
```

### 8.3 Patch Operations

```typescript
function createPatchSet(
  sourcePanel: string,
  patches: NOGPatch[],
  summary: string,
  nogVersion: number
): PatchSet;

function approvePatch<T extends NOGPatch>(patch: T): T;
function rejectPatch<T extends NOGPatch>(patch: T): T;
function markPatchApplied<T extends NOGPatch>(patch: T): T;
function markPatchFailed<T extends NOGPatch>(patch: T): T;
```

------

## 9. Security Model

### 9.1 The Logic Sandbox

**Implementation**: `new Function(...)` with shadowed globals.

**Forbidden Globals** (shadowed as `undefined`):
- `window`
- `document`
- `fetch`
- `XMLHttpRequest`
- `eval`
- `Function`

**Injected API**:

| Global | Access | Description |
|--------|--------|-------------|
| `$state` | Read/Write | Reactive state proxy |
| `$args` | Read-only | Tool arguments |
| `$view` | Read/Write | Imperative UI handle |
| `$ext` | Async | Extension capabilities |
| `$emit` | Write | Event emitter |
| `$log` | Write | Safe logging |

### 9.2 Async Handler Wrapper

```typescript
function createHandler(code: string, context: SandboxContext) {
  const argNames = Object.keys(context);
  const shadowedGlobals = ['window', 'document', 'fetch', 'XMLHttpRequest', 'eval', 'Function'];
  
  const body = `
    "use strict";
    return (async function() {
      try { 
        ${code} 
      } catch (e) { 
        throw e; 
      }
    })();
  `;

  const factory = new Function(...argNames, ...shadowedGlobals, body);
  
  return () => factory(
    ...Object.values(context), 
    ...shadowedGlobals.map(() => undefined)
  );
}
```

### 9.3 View Security

- **Sanitization**: All `{binding}` outputs are escaped by React.
- **No Scripting**: NXML does not support `<script>` tags in the View namespace.
- **ID Uniqueness**: View IDs must be unique (validated at parse time).

------

## 10. Utility Types and Functions

### 10.1 Result Type

```typescript
interface Success<T> {
  readonly success: true;
  readonly value: T;
}

interface Failure<E = Error> {
  readonly success: false;
  readonly error: E;
}

type Result<T, E = Error> = Success<T> | Failure<E>;

function success<T>(value: T): Success<T>;
function failure<E>(error: E): Failure<E>;
function isSuccess<T, E>(result: Result<T, E>): result is Success<T>;
function isFailure<T, E>(result: Result<T, E>): result is Failure<E>;
```

### 10.2 ID Generation

```typescript
function generateId(prefix?: string): string;    // e.g., "id_lxyz123_abc456"
function generateShortId(): string;              // e.g., "xyz12abc"
function isValidId(id: string): boolean;
```

### 10.3 Object Utilities

```typescript
function deepClone<T>(obj: T): T;
function deepMerge<T extends object>(target: T, ...sources: Partial<T>[]): T;
function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>;
function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K>;
```

### 10.4 Async Utilities

```typescript
function delay(ms: number): Promise<void>;
function retry<T>(fn: () => Promise<T>, options?: { maxAttempts?: number; delay?: number }): Promise<T>;
function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T>;
```

------

## 11. Usage Examples

### 11.1 Interactive Server Monitor

Demonstrates **Action**, **Imperative View**, and **Extensions**.

```xml
<NexusPanel title="Server Monitor" version="1.1.0">
  <Data>
    <State name="status" type="string" default="offline" />
    <State name="logs" type="list" default="[]" />
  </Data>

  <Logic>
    <Extension name="nexus.http" alias="http" />

    <Tool name="checkHealth" description="Pings server status">
      <Handler>
        $view.getElementById('status-badge').setProp('status', 'info');
        
        try {
          const res = await $ext.http.get('https://api.server.com/health');
          $state.status = res.json.status;
          $emit('toast', 'Health check complete');
        } catch (e) {
          $state.status = 'error';
          $state.logs.push(`Check failed: ${e.message}`);
        }
      </Handler>
    </Tool>
    
    <Tool name="clearLogs">
      <Handler>
        $state.logs = [];
      </Handler>
    </Tool>
  </Logic>

  <View>
    <Layout strategy="stack" gap="md">
      <Container title="Control Panel">
        <Layout strategy="row" align="center">
          <StatusBadge 
            id="status-badge"
            label="{$state.status}" 
            status="{$state.status == 'active' ? 'success' : 'error'}" 
          />
          <Action 
            label="Refresh" 
            trigger="checkHealth" 
            variant="primary" 
          />
        </Layout>
      </Container>

      <Container title="System Logs">
        <LogStream data="{$state.logs}" height="200" />
        <Button label="Clear" trigger="clearLogs" variant="ghost" />
      </Container>
    </Layout>
  </View>
</NexusPanel>
```

### 11.2 Todo List (Dynamic Args)

Demonstrates the **Thunk Pattern** for tool arguments.

```xml
<NexusPanel title="Tasks">
  <Data>
    <State name="todos" type="list" default="[]" />
    <State name="input" type="string" default="" />
    <Computed name="hasItems" value="$state.todos.length > 0" />
    <Computed name="itemCount" value="$state.todos.length" />
  </Data>

  <Logic>
    <Tool name="add" description="Add a new todo item">
      <Handler>
        if ($state.input) {
          $state.todos.push({ id: Date.now(), text: $state.input, done: false });
          $state.input = "";
        }
      </Handler>
    </Tool>

    <Tool name="remove" description="Remove a todo by ID">
      <Arg name="id" type="number" required="true" description="Todo item ID" />
      <Handler>
        $state.todos = $state.todos.filter(t => t.id !== $args.id);
      </Handler>
    </Tool>
    
    <Tool name="toggle" description="Toggle todo completion">
      <Arg name="id" type="number" required="true" />
      <Handler>
        const todo = $state.todos.find(t => t.id === $args.id);
        if (todo) todo.done = !todo.done;
      </Handler>
    </Tool>
  </Logic>

  <View>
    <Layout strategy="stack" gap="md">
      <Text content="Tasks" variant="h2" />
      <Text content="Total: {$state.itemCount}" variant="caption" />
      
      <Layout strategy="row" gap="sm">
        <Input bind="$state.input" placeholder="New Task..." />
        <Button label="Add" trigger="add" />
      </Layout>

      <If condition="{$state.hasItems}">
        <Iterate items="{$state.todos}" as="item" key="id">
          <Layout strategy="row" align="center" gap="sm">
            <Switch bind="$scope.item.done" />
            <Text content="{$scope.item.text}" />
            <Button 
              label="X" 
              variant="danger" 
              trigger="remove" 
              args="[$scope.item.id]" 
            />
          </Layout>
        </Iterate>
      </If>
    </Layout>
  </View>
</NexusPanel>
```

------

## 12. Appendix: Layout Weights

For the `auto` layout strategy, the reactor uses a 12-column grid system. Components are assigned default weights (column spans) which determine their flow.

### 12.1 Component Weight Table

| **Component** | **ColSpan** | **Items Per Row** |
|---------------|-------------|-------------------|
| `Metric` | 3 | 4 |
| `StatusBadge` | 3 | 4 |
| `Switch` | 3 | 4 |
| `Button` | 3 | 4 |
| `Chart` | 6 | 2 |
| `Input` | 6 | 2 |
| `LogStream` | 12 | 1 |
| `Text` | 12 | 1 |
| `Container` | 12 | 1 |
| Default | 6 | 2 |

### 12.2 Weight Constants

```typescript
const COMPONENT_WEIGHTS: Record<string, ColumnSpan> = {
  Metric: 3,
  StatusBadge: 3,
  Switch: 3,
  Button: 3,
  Chart: 6,
  Input: 6,
  LogStream: 12,
  Text: 12,
  Container: 12,
  default: 6,
};

function getComponentWeight(componentType: string): ColumnSpan {
  return COMPONENT_WEIGHTS[componentType] ?? COMPONENT_WEIGHTS['default'] ?? 6;
}
```

### 12.3 Layout Algorithm ("Tetris")

```
Input: List of ViewNode children

1. Initialize currentRowWeight = 0
2. For each child:
   a. Get weight from COMPONENT_WEIGHTS
   b. If (currentRowWeight + weight > 12):
      - Mark child with newRow: true
      - Reset currentRowWeight = weight
   c. Else:
      - currentRowWeight += weight
   d. Assign layout.colSpan = weight
3. Output: Nodes decorated with layout data
```

------

## 13. Appendix: API Reference

### 13.1 Factory Functions

```typescript
// Data
function createStateNode(name: Identifier, type: NXMLPrimitiveType, defaultValue?: RuntimeValue): StateNode;
function createComputedNode(name: Identifier, value: Expression): ComputedNode;
function createDataAST(): DataAST;

// Logic
function createArgNode(name: Identifier, type: NXMLPrimitiveType, options?: { required?: boolean; default?: unknown; description?: string }): ArgNode;
function createHandlerNode(code: HandlerCode): HandlerNode;
function createToolNode(name: Identifier, handler: HandlerNode, options?: { description?: string; args?: ArgNode[] }): ToolNode;
function createLifecycleNode(on: LifecycleEvent, handler: HandlerNode): LifecycleNode;
function createExtensionNode(name: string, alias?: Identifier, source?: string): ExtensionNode;
function createLogicAST(): LogicAST;

// View
function createViewNode(type: string, props?: Record<string, unknown>, children?: ViewNode[]): ViewNode;
function createLayoutNode(props?: LayoutProps, children?: ViewNode[]): LayoutNode;
function createViewAST(): ViewAST;

// Panel
function createNexusPanelAST(meta: PanelMeta): NexusPanelAST;

// NOG
function createEntity(name: string, category: EntityCategory, options?: Partial<NOGEntity>): NOGEntity;
function createRelationship(from: string, to: string, type: RelationshipType, options?: { meta?: RelationshipMeta }): NOGRelationship;
function createNOGGraph(): NOGGraph;
```

### 13.2 Type Guards

```typescript
// Data
function isStateNode(node: unknown): node is StateNode;
function isComputedNode(node: unknown): node is ComputedNode;
function isDataNode(node: unknown): node is DataNode;

// Logic
function isArgNode(node: unknown): node is ArgNode;
function isHandlerNode(node: unknown): node is HandlerNode;
function isToolNode(node: unknown): node is ToolNode;
function isLifecycleNode(node: unknown): node is LifecycleNode;
function isExtensionNode(node: unknown): node is ExtensionNode;
function isLogicNode(node: unknown): node is LogicNode;

// View
function isLayoutNode(node: ViewNode): node is LayoutNode;
function isContainerNode(node: ViewNode): node is ContainerNode;
function isIfNode(node: ViewNode): node is IfNode;
function isIterateNode(node: ViewNode): node is IterateNode;
function isControlFlowNode(node: ViewNode): node is IfNode | IterateNode;
function isBindingExpression(value: unknown): value is BindingExpression;

// Panel
function isNexusPanelAST(node: unknown): node is NexusPanelAST;

// NOG
function isConceptEntity(entity: NOGEntity): entity is ConceptEntity;
function isComponentEntity(entity: NOGEntity): entity is ComponentEntity;
function isDataEntity(entity: NOGEntity): entity is DataEntity;
function isActionEntity(entity: NOGEntity): entity is ActionEntity;
function isResourceEntity(entity: NOGEntity): entity is ResourceEntity;
function isEntityPatch(patch: NOGPatch): patch is EntityPatch;
function isRelationshipPatch(patch: NOGPatch): patch is RelationshipPatch;
function isViewPatch(patch: NOGPatch): patch is ViewPatch;
```

### 13.3 Query Functions

```typescript
// Data
function getStateNames(data: DataAST): string[];
function findDataNode(data: DataAST, name: string): DataNode | undefined;
function getDefaultForType(type: NXMLPrimitiveType): RuntimeValue;
function parseDefaultValue(value: string, type: NXMLPrimitiveType): RuntimeValue;

// Logic
function getToolNames(logic: LogicAST): string[];
function findTool(logic: LogicAST, name: string): ToolNode | undefined;
function findExtensionByAlias(logic: LogicAST, alias: string): ExtensionNode | undefined;
function hasAsyncHandlers(logic: LogicAST): boolean;
function getExtensionAliases(logic: LogicAST): Map<string, string>;

// View
function extractExpression(binding: BindingExpression): Expression;
function referencesState(expr: Expression): boolean;
function referencesScope(expr: Expression): boolean;
function traverseViewTree(node: ViewNode, visitor: (node: ViewNode, parent?: ViewNode) => void, parent?: ViewNode): void;
function findViewNodes(root: ViewNode, predicate: (node: ViewNode) => boolean): ViewNode[];
function getAllBindings(root: ViewNode): BindingExpression[];
function getAllTriggers(root: ViewNode): string[];

// Panel
function validatePanelAST(ast: NexusPanelAST): ValidationResult;
function serializePanelAST(ast: NexusPanelAST): string;
function deserializePanelAST(json: string): NexusPanelAST;
function analyzePanelAST(ast: NexusPanelAST): PanelSummary;
function extractStateDependencies(ast: NexusPanelAST): Map<string, string[]>;
function hasAsyncOperations(ast: NexusPanelAST): boolean;

// NOG
function findEntitiesByCategory(graph: NOGGraph, category: EntityCategory): NOGEntity[];
function findEntitiesByTag(graph: NOGGraph, tag: string): NOGEntity[];
function getOutgoingRelationships(relationships: NOGRelationship[], entityId: string): NOGRelationship[];
function getIncomingRelationships(relationships: NOGRelationship[], entityId: string): NOGRelationship[];
function findDirectRelationship(relationships: NOGRelationship[], fromId: string, toId: string): NOGRelationship | undefined;
```

### 13.4 Validation Functions

```typescript
// Schema validation
function validateStateNode(node: unknown): z.SafeParseReturnType;
function validateComputedNode(node: unknown): z.SafeParseReturnType;
function validateDataAST(ast: unknown): z.SafeParseReturnType;
function validateArgNode(node: unknown): z.SafeParseReturnType;
function validateHandlerNode(node: unknown): z.SafeParseReturnType;
function validateToolNode(node: unknown): z.SafeParseReturnType;
function validateLifecycleNode(node: unknown): z.SafeParseReturnType;
function validateExtensionNode(node: unknown): z.SafeParseReturnType;
function validateLogicAST(ast: unknown): z.SafeParseReturnType;
function validateViewNode(node: unknown): z.SafeParseReturnType;
function validateViewAST(ast: unknown): z.SafeParseReturnType;

// Panel validation
function validateNexusPanelAST(ast: unknown): PanelValidationResult;
function validateNexusPanelASTQuick(ast: unknown): z.SafeParseReturnType;
function validateNexusPanelASTStrict(ast: unknown): z.SafeParseReturnType;

// Logic-specific
function detectAsyncHandler(code: string): boolean;
function extractExtensionUsage(code: string): string[];
function validateExtensionUsage(logic: LogicAST): { valid: boolean; undeclared: string[] };
function validateDefaultValueType(value: unknown, type: NXMLPrimitiveType): boolean;

// View-specific
function isBindingExpression(value: unknown): boolean;
function extractBindingReferences(node: ViewNode): { stateRefs: string[]; scopeRefs: string[] };
function extractTriggerReferences(node: ViewNode): string[];
```

------

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Nov 2025 | Initial specification |
| 1.1.0 | Dec 2025 | Reactor Ready - Added nested handlers, imperative bridges, thunks, comprehensive AST/Schema documentation |
