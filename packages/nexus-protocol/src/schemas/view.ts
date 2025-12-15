/**
 * @fileoverview Zod schemas for View namespace validation
 * @module @nexus/protocol/schemas/view
 */

import { z } from 'zod';

// =============================================================================
// Source Location Schema
// =============================================================================

const SourceLocationSchema = z.object({
  startLine: z.number(),
  startColumn: z.number(),
  endLine: z.number(),
  endColumn: z.number(),
}).optional();

// =============================================================================
// Binding Expression Schema
// =============================================================================

/**
 * Binding expression pattern: {$state.xxx} or {$scope.xxx} or {expression}
 */
export const BindingExpressionSchema = z
  .string()
  .refine(
    (val) => {
      // Must be wrapped in curly braces if it's a binding
      if (val.startsWith('{') && val.endsWith('}')) {
        return true;
      }
      // Or it's a plain string value
      return true;
    },
    { message: 'Invalid binding expression' }
  );

// =============================================================================
// Layout Types
// =============================================================================

export const LayoutStrategySchema = z.enum(['auto', 'stack', 'row']);
export const GapSizeSchema = z.enum(['sm', 'md', 'lg']);
export const AlignmentSchema = z.enum(['start', 'center', 'end', 'stretch']);

// =============================================================================
// Component Variant Types
// =============================================================================

export const TextVariantSchema = z.enum(['h1', 'h2', 'h3', 'h4', 'body', 'code', 'caption']);
export const ButtonVariantSchema = z.enum(['primary', 'secondary', 'danger', 'ghost']);
export const StatusTypeSchema = z.enum(['success', 'warn', 'error', 'info']);
export const ChartTypeSchema = z.enum(['line', 'bar', 'pie', 'area']);
export const ContainerVariantSchema = z.enum(['card', 'panel', 'section', 'transparent']);

// =============================================================================
// Layout Info (injected by LayoutEngine)
// =============================================================================

export const LayoutInfoSchema = z.object({
  colSpan: z.number().int().min(1).max(12),
  className: z.string(),
  newRow: z.boolean().optional(),
});

// =============================================================================
// Component Props Schemas
// =============================================================================

// Layout Props
export const LayoutPropsSchema = z.object({
  id: z.string().optional(),
  strategy: LayoutStrategySchema.optional().default('auto'),
  gap: GapSizeSchema.optional().default('md'),
  align: AlignmentSchema.optional(),
  justify: AlignmentSchema.optional(),
});

// Container Props
export const ContainerPropsSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  variant: ContainerVariantSchema.optional().default('card'),
});

// If Props
export const IfPropsSchema = z.object({
  id: z.string().optional(),
  condition: BindingExpressionSchema,
});

// Iterate Props
export const IteratePropsSchema = z.object({
  id: z.string().optional(),
  items: BindingExpressionSchema,
  as: z.string().min(1),
  key: z.string().optional(),
});

// Text Props
export const TextPropsSchema = z.object({
  id: z.string().optional(),
  content: z.union([z.string(), BindingExpressionSchema]),
  variant: TextVariantSchema.optional().default('body'),
});

// Metric Props
export const MetricPropsSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  value: z.union([z.string(), BindingExpressionSchema]),
  trend: BindingExpressionSchema.optional(),
  unit: z.string().optional(),
});

// StatusBadge Props
export const StatusBadgePropsSchema = z.object({
  id: z.string().optional(),
  label: z.union([z.string(), BindingExpressionSchema]),
  status: z.union([StatusTypeSchema, BindingExpressionSchema]).optional(),
  value: z.union([z.string(), BindingExpressionSchema]).optional(),
});

// LogStream Props
export const LogStreamPropsSchema = z.object({
  id: z.string().optional(),
  data: BindingExpressionSchema,
  height: z.union([z.number(), z.string()]).optional(),
  autoScroll: z.boolean().optional().default(true),
});

// Input Props
export const InputPropsSchema = z.object({
  id: z.string().optional(),
  bind: z.string(),
  placeholder: z.string().optional(),
  inputType: z.enum(['text', 'number', 'password', 'email']).optional().default('text'),
  disabled: z.union([z.boolean(), BindingExpressionSchema]).optional(),
});

// Button Props
export const ButtonPropsSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  trigger: z.string().optional(),
  variant: ButtonVariantSchema.optional().default('primary'),
  args: BindingExpressionSchema.optional(),
  payload: z.string().optional(),
  disabled: z.union([z.boolean(), BindingExpressionSchema]).optional(),
});

// Switch Props
export const SwitchPropsSchema = z.object({
  id: z.string().optional(),
  bind: z.string(),
  label: z.string().optional(),
  disabled: z.union([z.boolean(), BindingExpressionSchema]).optional(),
});

// Chart Props
export const ChartPropsSchema = z.object({
  id: z.string().optional(),
  type: ChartTypeSchema,
  data: BindingExpressionSchema,
  xKey: z.string().optional(),
  yKey: z.string().optional(),
  height: z.union([z.number(), z.string()]).optional(),
});

// Action Props
export const ActionPropsSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  trigger: z.string(),
  variant: ButtonVariantSchema.optional().default('primary'),
  args: BindingExpressionSchema.optional(),
  payload: z.string().optional(),
  disabled: z.union([z.boolean(), BindingExpressionSchema]).optional(),
});

// =============================================================================
// View Node Schema
// =============================================================================

/**
 * View node shape interface for recursive type definition
 */
export interface ViewNodeShape {
  type: string;
  id?: string | undefined;
  props: Record<string, unknown>;
  children: ViewNodeShape[];
  layout?: { colSpan: number; className: string; newRow?: boolean | undefined } | undefined;
  loc?: { startLine: number; startColumn: number; endLine: number; endColumn: number } | undefined;
}

/**
 * Base view node schema
 * Uses recursive definition for children
 */
export const ViewNodeSchema: z.ZodType<ViewNodeShape> = z.lazy(() =>
  z.object({
    type: z.string().min(1),
    id: z.string().optional(),
    props: z.record(z.string(), z.unknown()),
    children: z.array(ViewNodeSchema),
    layout: LayoutInfoSchema.optional(),
    loc: SourceLocationSchema,
  })
);

// =============================================================================
// View AST Schema
// =============================================================================

export const ViewASTSchema = z.object({
  kind: z.literal('View'),
  root: ViewNodeSchema,
  loc: SourceLocationSchema,
});

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Component props validators registry
 */
const propsValidators: Record<string, z.ZodType<unknown>> = {
  Layout: LayoutPropsSchema,
  Container: ContainerPropsSchema,
  If: IfPropsSchema,
  Iterate: IteratePropsSchema,
  Text: TextPropsSchema,
  Metric: MetricPropsSchema,
  StatusBadge: StatusBadgePropsSchema,
  LogStream: LogStreamPropsSchema,
  Input: InputPropsSchema,
  Button: ButtonPropsSchema,
  Switch: SwitchPropsSchema,
  Chart: ChartPropsSchema,
  Action: ActionPropsSchema,
};

/**
 * Validate a view node with type-specific props validation
 */
export function validateViewNode(node: unknown) {
  const baseResult = ViewNodeSchema.safeParse(node);
  if (!baseResult.success) {
    return baseResult;
  }
  
  const { type, props } = baseResult.data;
  const propsValidator = propsValidators[type];
  
  if (propsValidator) {
    const propsResult = propsValidator.safeParse(props);
    if (!propsResult.success) {
      return {
        success: false as const,
        error: new z.ZodError([
          ...propsResult.error.issues.map(issue => ({
            ...issue,
            path: ['props', ...issue.path],
          })),
        ]),
      };
    }
  }
  
  return baseResult;
}

/**
 * Validate the complete View AST
 */
export function validateViewAST(ast: unknown) {
  return ViewASTSchema.safeParse(ast);
}

/**
 * Check if a value is a binding expression
 */
export function isBindingExpression(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^\{.+\}$/.test(value);
}

/**
 * Extract binding references from a view tree
 */
export function extractBindingReferences(
  node: z.infer<typeof ViewNodeSchema>
): { stateRefs: string[]; scopeRefs: string[] } {
  const stateRefs: string[] = [];
  const scopeRefs: string[] = [];
  
  function processValue(value: unknown) {
    if (typeof value !== 'string' || !isBindingExpression(value)) return;
    
    const stateMatches = value.matchAll(/\$state\.(\w+)/g);
    for (const match of stateMatches) {
      if (match[1]) stateRefs.push(match[1]);
    }
    
    const scopeMatches = value.matchAll(/\$scope\.(\w+)/g);
    for (const match of scopeMatches) {
      if (match[1]) scopeRefs.push(match[1]);
    }
  }
  
  function traverse(n: z.infer<typeof ViewNodeSchema>) {
    for (const value of Object.values(n.props)) {
      processValue(value);
    }
    for (const child of n.children) {
      traverse(child as z.infer<typeof ViewNodeSchema>);
    }
  }
  
  traverse(node);
  
  return {
    stateRefs: [...new Set(stateRefs)],
    scopeRefs: [...new Set(scopeRefs)],
  };
}

/**
 * Extract all trigger references from a view tree
 */
export function extractTriggerReferences(
  node: z.infer<typeof ViewNodeSchema>
): string[] {
  const triggers: string[] = [];
  
  function traverse(n: z.infer<typeof ViewNodeSchema>) {
    const trigger = n.props['trigger'];
    if (typeof trigger === 'string') {
      triggers.push(trigger);
    }
    for (const child of n.children) {
      traverse(child as z.infer<typeof ViewNodeSchema>);
    }
  }
  
  traverse(node);
  
  return [...new Set(triggers)];
}

// =============================================================================
// Type Exports
// =============================================================================

export type ViewNodeInput = z.input<typeof ViewNodeSchema>;
export type ViewNodeOutput = z.output<typeof ViewNodeSchema>;
export type ViewASTInput = z.input<typeof ViewASTSchema>;
export type ViewASTOutput = z.output<typeof ViewASTSchema>;
export type LayoutPropsInput = z.input<typeof LayoutPropsSchema>;
export type LayoutPropsOutput = z.output<typeof LayoutPropsSchema>;