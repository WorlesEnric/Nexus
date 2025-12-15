/**
 * @fileoverview Zod schemas for Data namespace validation
 * @module @nexus/protocol/schemas/data
 */

import { z } from 'zod';

// =============================================================================
// Primitive Types
// =============================================================================

/**
 * Valid NXML primitive types
 */
export const NXMLPrimitiveTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'list',
  'object',
]);

/**
 * JavaScript identifier pattern
 */
export const IdentifierSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/, 'Invalid identifier');

/**
 * Runtime value that can be stored in state
 */
export const RuntimeValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.undefined(),
    z.array(RuntimeValueSchema),
    z.record(z.string(), RuntimeValueSchema),
  ])
);

// =============================================================================
// State Node Schema
// =============================================================================

/**
 * Schema for State node
 */
export const StateNodeSchema = z.object({
  kind: z.literal('State'),
  name: IdentifierSchema,
  type: NXMLPrimitiveTypeSchema,
  default: RuntimeValueSchema.optional(),
  loc: z.object({
    startLine: z.number(),
    startColumn: z.number(),
    endLine: z.number(),
    endColumn: z.number(),
  }).optional(),
});

// =============================================================================
// Computed Node Schema
// =============================================================================

/**
 * Expression string schema
 */
export const ExpressionSchema = z
  .string()
  .min(1)
  .refine(
    (val) => {
      // Basic check for balanced parentheses and valid JS-ish expression
      try {
        // Check for balanced brackets
        let depth = 0;
        for (const char of val) {
          if (char === '(' || char === '[' || char === '{') depth++;
          if (char === ')' || char === ']' || char === '}') depth--;
          if (depth < 0) return false;
        }
        return depth === 0;
      } catch {
        return false;
      }
    },
    { message: 'Invalid expression syntax' }
  );

/**
 * Schema for Computed node
 */
export const ComputedNodeSchema = z.object({
  kind: z.literal('Computed'),
  name: IdentifierSchema,
  value: ExpressionSchema,
  loc: z.object({
    startLine: z.number(),
    startColumn: z.number(),
    endLine: z.number(),
    endColumn: z.number(),
  }).optional(),
});

// =============================================================================
// Data AST Schema
// =============================================================================

/**
 * Schema for complete Data AST
 */
export const DataASTSchema = z.object({
  kind: z.literal('Data'),
  states: z.array(StateNodeSchema),
  computed: z.array(ComputedNodeSchema),
  loc: z.object({
    startLine: z.number(),
    startColumn: z.number(),
    endLine: z.number(),
    endColumn: z.number(),
  }).optional(),
}).refine(
  (data) => {
    // Check for duplicate names
    const names = [
      ...data.states.map(s => s.name),
      ...data.computed.map(c => c.name),
    ];
    return new Set(names).size === names.length;
  },
  { message: 'Duplicate state/computed names detected' }
);

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a state node
 */
export function validateStateNode(node: unknown) {
  return StateNodeSchema.safeParse(node);
}

/**
 * Validate a computed node
 */
export function validateComputedNode(node: unknown) {
  return ComputedNodeSchema.safeParse(node);
}

/**
 * Validate the complete Data AST
 */
export function validateDataAST(ast: unknown) {
  return DataASTSchema.safeParse(ast);
}

/**
 * Validate that a default value matches the declared type
 */
export function validateDefaultValueType(
  value: unknown,
  type: z.infer<typeof NXMLPrimitiveTypeSchema>
): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'list':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return false;
  }
}

// =============================================================================
// Type Exports
// =============================================================================

export type StateNodeInput = z.input<typeof StateNodeSchema>;
export type StateNodeOutput = z.output<typeof StateNodeSchema>;
export type ComputedNodeInput = z.input<typeof ComputedNodeSchema>;
export type ComputedNodeOutput = z.output<typeof ComputedNodeSchema>;
export type DataASTInput = z.input<typeof DataASTSchema>;
export type DataASTOutput = z.output<typeof DataASTSchema>;
