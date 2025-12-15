/**
 * @fileoverview View namespace AST definitions
 * @module @nexus/protocol/ast/view
 * 
 * The View namespace defines the UI structure of a NexusPanel.
 * It uses semantic components rather than raw HTML, supporting:
 * - Layout components (Layout, Container)
 * - Control flow (If, Iterate)
 * - Standard Component Library (SCL)
 * 
 * All components support reactive bindings via {$state.x} syntax.
 */

import type { 
  BaseNode, 
  Identifier, 
  BindingExpression,
  Expression,
  LayoutStrategy,
  GapSize,
  Alignment,
  TextVariant,
  ButtonVariant,
  StatusType,
  ChartType,
  ContainerVariant,
  ColumnSpan,
} from './common';

// =============================================================================
// Base View Node
// =============================================================================

/**
 * Base interface for all view nodes
 */
export interface ViewNodeBase<P = Record<string, unknown>> extends BaseNode {
  /**
   * Component type name
   */
  type: string;

  /**
   * Unique identifier for imperative View manipulation
   * Required for referencing via $view (e.g., $view.getElementById('logs'))
   */
  id?: string;

  /**
   * Component properties (may contain binding expressions)
   */
  props: P;

  /**
   * Child nodes
   */
  children: ViewNode[];

  /**
   * Layout information injected by LayoutEngine
   * Not present in raw XML, added during layout computation
   */
  layout?: LayoutInfo;
}

/**
 * Layout information added by the LayoutEngine
 */
export interface LayoutInfo {
  /**
   * Column span in 12-column grid (1-12)
   */
  colSpan: ColumnSpan;
  
  /**
   * Computed CSS class names
   */
  className: string;
  
  /**
   * Whether this node starts a new row
   */
  newRow?: boolean;
}

// =============================================================================
// Layout Components
// =============================================================================

/**
 * Layout component props
 */
export interface LayoutProps {
  /**
   * Optional ID for imperative view manipulation
   */
  id?: string;

  /**
   * Layout strategy
   * - auto: Intelligent 12-column grid with weight heuristics
   * - stack: Vertical flex column
   * - row: Horizontal flex row
   */
  strategy?: LayoutStrategy;
  
  /**
   * Gap between items
   */
  gap?: GapSize;
  
  /**
   * Alignment for flex layouts
   */
  align?: Alignment;
  
  /**
   * Justify content for flex layouts
   */
  justify?: Alignment;
}

/**
 * Layout node for arranging children
 * 
 * @example
 * ```xml
 * <Layout strategy="auto" gap="md">
 *   <Metric label="CPU" value="{$state.cpu}" />
 *   <Chart type="line" data="{$state.history}" />
 * </Layout>
 * ```
 */
export interface LayoutNode extends ViewNodeBase<LayoutProps> {
  type: 'Layout';
  props: LayoutProps;
}

/**
 * Container component props
 */
export interface ContainerProps {
  /**
   * Optional ID for imperative view manipulation
   */
  id?: string;

  /**
   * Container title (optional header)
   */
  title?: string;
  
  /**
   * Container variant style
   */
  variant?: ContainerVariant;
}

/**
 * Container node for grouping content
 * 
 * @example
 * ```xml
 * <Container title="Settings" variant="card">
 *   <Input bind="$state.name" placeholder="Name" />
 * </Container>
 * ```
 */
export interface ContainerNode extends ViewNodeBase<ContainerProps> {
  type: 'Container';
  props: ContainerProps;
}

// =============================================================================
// Control Flow Components
// =============================================================================

/**
 * If component props
 */
export interface IfProps {
  /**
   * Optional ID for reference
   */
  id?: string;

  /**
   * Condition expression to evaluate
   */
  condition: BindingExpression;
}

/**
 * Conditional rendering node
 * 
 * @example
 * ```xml
 * <If condition="{$state.count > 0}">
 *   <Text content="Has items" />
 * </If>
 * ```
 */
export interface IfNode extends ViewNodeBase<IfProps> {
  type: 'If';
  props: IfProps;
}

/**
 * Iterate component props
 */
export interface IterateProps {
  /**
   * Optional ID for reference
   */
  id?: string;

  /**
   * Array to iterate over
   */
  items: BindingExpression;
  
  /**
   * Loop variable name (accessible via $scope.{as})
   */
  as: Identifier;
  
  /**
   * Key expression for React reconciliation (optional)
   */
  key?: string;
}

/**
 * Loop rendering node
 * 
 * @example
 * ```xml
 * <Iterate items="{$state.tasks}" as="task">
 *   <Text content="{$scope.task.title}" />
 * </Iterate>
 * ```
 */
export interface IterateNode extends ViewNodeBase<IterateProps> {
  type: 'Iterate';
  props: IterateProps;
}

// =============================================================================
// Display Components (SCL)
// =============================================================================

/**
 * Text component props
 */
export interface TextProps {
  /**
   * Optional ID for imperative view manipulation
   */
  id?: string;

  /**
   * Text content (supports binding)
   */
  content: string | BindingExpression;
  
  /**
   * Text variant/style
   */
  variant?: TextVariant;
}

/**
 * Text display node
 */
export interface TextNode extends ViewNodeBase<TextProps> {
  type: 'Text';
  props: TextProps;
}

/**
 * Metric component props
 */
export interface MetricProps {
  /**
   * Optional ID for imperative view manipulation
   */
  id?: string;

  /**
   * Label describing the metric
   */
  label: string;
  
  /**
   * Value to display
   */
  value: string | BindingExpression;
  
  /**
   * Trend direction indicator
   */
  trend?: BindingExpression;
  
  /**
   * Unit suffix (e.g., "%", "ms")
   */
  unit?: string;
}

/**
 * Metric display node (stat card)
 */
export interface MetricNode extends ViewNodeBase<MetricProps> {
  type: 'Metric';
  props: MetricProps;
}

/**
 * StatusBadge component props
 */
export interface StatusBadgeProps {
  /**
   * Optional ID for imperative view manipulation
   */
  id?: string;

  /**
   * Badge label
   */
  label: string | BindingExpression;
  
  /**
   * Status type for coloring
   */
  status?: StatusType | BindingExpression;
  
  /**
   * Alternative: value prop (same as label)
   */
  value?: string | BindingExpression;
}

/**
 * Status badge display node
 */
export interface StatusBadgeNode extends ViewNodeBase<StatusBadgeProps> {
  type: 'StatusBadge';
  props: StatusBadgeProps;
}

/**
 * LogStream component props
 */
export interface LogStreamProps {
  /**
   * Optional ID for imperative view manipulation
   * (e.g., $view.getElementById('logs').setFilter(level))
   */
  id?: string;

  /**
   * Log data array
   */
  data: BindingExpression;
  
  /**
   * Fixed height in pixels
   */
  height?: number | string;
  
  /**
   * Whether to auto-scroll to bottom
   */
  autoScroll?: boolean;
}

/**
 * Log stream display node
 */
export interface LogStreamNode extends ViewNodeBase<LogStreamProps> {
  type: 'LogStream';
  props: LogStreamProps;
}

// =============================================================================
// Input Components (SCL)
// =============================================================================

/**
 * Input component props
 */
export interface InputProps {
  /**
   * Optional ID for imperative view manipulation
   */
  id?: string;

  /**
   * Two-way binding to state path
   */
  bind: string;
  
  /**
   * Placeholder text
   */
  placeholder?: string;
  
  /**
   * Input type
   */
  inputType?: 'text' | 'number' | 'password' | 'email';
  
  /**
   * Whether the input is disabled
   */
  disabled?: boolean | BindingExpression;
}

/**
 * Text input node
 */
export interface InputNode extends ViewNodeBase<InputProps> {
  type: 'Input';
  props: InputProps;
}

/**
 * Button component props
 */
export interface ButtonProps {
  /**
   * Optional ID for imperative view manipulation
   */
  id?: string;

  /**
   * Button label
   */
  label: string;
  
  /**
   * Tool name to trigger on click
   */
  trigger?: string;
  
  /**
   * Button style variant
   */
  variant?: ButtonVariant;
  
  /**
   * Arguments to pass to the tool
   * @example "[$scope.item.id]" or "{ force: true }"
   */
  args?: BindingExpression;

  /**
   * Payload (Legacy alias for args)
   */
  payload?: string;
  
  /**
   * Whether the button is disabled
   */
  disabled?: boolean | BindingExpression;
}

/**
 * Button node
 */
export interface ButtonNode extends ViewNodeBase<ButtonProps> {
  type: 'Button';
  props: ButtonProps;
}

/**
 * Switch component props
 */
export interface SwitchProps {
  /**
   * Optional ID for imperative view manipulation
   */
  id?: string;

  /**
   * Two-way binding to boolean state
   */
  bind: string;
  
  /**
   * Switch label
   */
  label?: string;
  
  /**
   * Whether the switch is disabled
   */
  disabled?: boolean | BindingExpression;
}

/**
 * Toggle switch node
 */
export interface SwitchNode extends ViewNodeBase<SwitchProps> {
  type: 'Switch';
  props: SwitchProps;
}

// =============================================================================
// Visualization Components (SCL)
// =============================================================================

/**
 * Chart component props
 */
export interface ChartProps {
  /**
   * Optional ID for imperative view manipulation
   */
  id?: string;

  /**
   * Chart type
   */
  type: ChartType;
  
  /**
   * Chart data array
   */
  data: BindingExpression;
  
  /**
   * X-axis data key
   */
  xKey?: string;
  
  /**
   * Y-axis data key
   */
  yKey?: string;
  
  /**
   * Chart height
   */
  height?: number | string;
}

/**
 * Chart visualization node
 */
export interface ChartNode extends ViewNodeBase<ChartProps> {
  type: 'Chart';
  props: ChartProps;
}

/**
 * Action component props (alias for Button with trigger)
 */
export interface ActionProps {
  /**
   * Optional ID for imperative view manipulation
   */
  id?: string;

  /**
   * Action label
   */
  label: string;
  
  /**
   * Tool name to trigger
   */
  trigger: string;
  
  /**
   * Action style variant
   */
  variant?: ButtonVariant;

  /**
   * Arguments to pass to the tool
   * Essential for passing dynamic args from the UI to the Tool
   */
  args?: BindingExpression;

  /**
   * Payload (Legacy alias for args)
   */
  payload?: string;

  /**
   * Whether the action is disabled
   */
  disabled?: boolean | BindingExpression;
}

/**
 * Action node (semantic button for triggering tools)
 */
export interface ActionNode extends ViewNodeBase<ActionProps> {
  type: 'Action';
  props: ActionProps;
}

// =============================================================================
// Custom Component Extension
// =============================================================================

/**
 * CustomComponent props for loading external React components
 */
export interface CustomComponentProps {
  /**
   * Optional ID for imperative view manipulation
   */
  id?: string;

  /**
   * Module path to load the component from
   * Can be:
   * - npm package: "@nexus-panels/figma-x6-editor"
   * - local file: "./components/MyComponent"
   * - CDN URL: "https://cdn.example.com/panel.js"
   */
  module: string;

  /**
   * Component name to import from the module
   * @example "FigmaEditor", "AdvancedChart"
   */
  component: string;

  /**
   * State bindings to pass as props to the custom component
   * Key is prop name, value is binding expression
   * @example { document: "$state.document", selection: "$state.selection" }
   */
  bindings?: Record<string, BindingExpression>;

  /**
   * Event handlers for custom component events
   * Key is event name (without 'on' prefix), value is handler expression
   * @example { change: "(doc) => { $state.document = doc; }" }
   */
  events?: Record<string, Expression>;

  /**
   * Additional static props to pass to the component
   */
  [key: string]: unknown;
}

/**
 * Custom component node for embedding external React components
 *
 * This allows users to create highly customized panels that cannot be
 * easily modeled by declarative NXML. The custom component can access
 * NXML state through bindings and trigger NXML handlers through events.
 *
 * @example
 * ```xml
 * <CustomComponent
 *   module="@nexus-panels/figma-x6-editor"
 *   component="FigmaEditor"
 *   bind:document="$state.document"
 *   bind:selection="$state.selection"
 *   on:change="(doc) => { $state.document = doc; }"
 *   on:save="() => { $emit('save', $state.document); }"
 * />
 * ```
 *
 * @example Local component
 * ```xml
 * <CustomComponent
 *   module="./components/AdvancedChart"
 *   component="AdvancedChart"
 *   bind:data="$state.chartData"
 *   bind:config="$state.chartConfig"
 *   on:dataPointClick="(point) => { $state.selectedPoint = point; }"
 * />
 * ```
 */
export interface CustomComponentNode extends ViewNodeBase<CustomComponentProps> {
  type: 'CustomComponent';
  props: CustomComponentProps;
}

// =============================================================================
// Union Types
// =============================================================================

/**
 * All possible view node types
 */
export type ViewNode =
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
  | CustomComponentNode
  | GenericViewNode;

/**
 * Generic view node for unknown/custom components
 */
export interface GenericViewNode extends ViewNodeBase<Record<string, unknown>> {
  type: string;
  props: Record<string, unknown>;
}

// =============================================================================
// View AST
// =============================================================================

/**
 * The complete View namespace AST
 */
export interface ViewAST extends BaseNode {
  readonly kind: 'View';
  
  /**
   * Root view node (usually a Layout)
   */
  root: ViewNode;
}

// =============================================================================
// Type Guards
// =============================================================================

export function isLayoutNode(node: ViewNode): node is LayoutNode {
  return node.type === 'Layout';
}

export function isContainerNode(node: ViewNode): node is ContainerNode {
  return node.type === 'Container';
}

export function isIfNode(node: ViewNode): node is IfNode {
  return node.type === 'If';
}

export function isIterateNode(node: ViewNode): node is IterateNode {
  return node.type === 'Iterate';
}

export function isControlFlowNode(node: ViewNode): node is IfNode | IterateNode {
  return isIfNode(node) || isIterateNode(node);
}

export function isCustomComponentNode(node: ViewNode): node is CustomComponentNode {
  return node.type === 'CustomComponent';
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a generic view node
 */
export function createViewNode(
  type: string,
  props: Record<string, unknown> = {},
  children: ViewNode[] = []
): ViewNode {
  return {
    type,
    props,
    children,
  };
}

/**
 * Create a Layout node
 */
export function createLayoutNode(
  props: LayoutProps = {},
  children: ViewNode[] = []
): LayoutNode {
  return {
    type: 'Layout',
    props: {
      strategy: props.strategy ?? 'auto',
      gap: props.gap ?? 'md',
      ...props,
    },
    children,
  };
}

/**
 * Create an empty ViewAST
 */
export function createViewAST(): ViewAST {
  return {
    kind: 'View',
    root: createLayoutNode(),
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a string is a binding expression
 */
export function isBindingExpression(value: unknown): value is BindingExpression {
  if (typeof value !== 'string') return false;
  return /^\{.*\}$/.test(value);
}

/**
 * Extract the expression from a binding string
 * "{$state.count}" -> "$state.count"
 */
export function extractExpression(binding: BindingExpression): Expression {
  const match = binding.match(/^\{(.*)\}$/);
  return match?.[1] ?? binding;
}

/**
 * Check if an expression references $state
 */
export function referencesState(expr: Expression): boolean {
  return expr.includes('$state.');
}

/**
 * Check if an expression references $scope
 */
export function referencesScope(expr: Expression): boolean {
  return expr.includes('$scope.');
}

/**
 * Traverse all nodes in a view tree
 */
export function traverseViewTree(
  node: ViewNode,
  visitor: (node: ViewNode, parent?: ViewNode) => void,
  parent?: ViewNode
): void {
  visitor(node, parent);
  for (const child of node.children) {
    traverseViewTree(child, visitor, node);
  }
}

/**
 * Find all nodes matching a predicate
 */
export function findViewNodes(
  root: ViewNode,
  predicate: (node: ViewNode) => boolean
): ViewNode[] {
  const results: ViewNode[] = [];
  traverseViewTree(root, (node) => {
    if (predicate(node)) {
      results.push(node);
    }
  });
  return results;
}

/**
 * Get all binding expressions in a view tree
 */
export function getAllBindings(root: ViewNode): BindingExpression[] {
  const bindings: BindingExpression[] = [];
  
  traverseViewTree(root, (node) => {
    for (const value of Object.values(node.props)) {
      if (isBindingExpression(value)) {
        bindings.push(value);
      }
    }
  });
  
  return bindings;
}

/**
 * Get all tool triggers in a view tree
 */
export function getAllTriggers(root: ViewNode): string[] {
  const triggers: string[] = [];

  traverseViewTree(root, (node) => {
    if ('trigger' in node.props) {
      const trigger = node.props.trigger;
      if (typeof trigger === 'string') {
        triggers.push(trigger);
      }
    }
  });

  return triggers;
}