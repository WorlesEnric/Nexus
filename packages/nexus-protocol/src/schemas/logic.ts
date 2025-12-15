/**
 * @fileoverview Zod schemas for Logic namespace validation
 * @module @nexus/protocol/schemas/logic
 */

import { z } from 'zod';
import { IdentifierSchema, NXMLPrimitiveTypeSchema } from './data';

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
// Arg Node Schema
// =============================================================================

/**
 * Schema for Tool argument definition
 */
export const ArgNodeSchema = z.object({
  kind: z.literal('Arg'),
  name: IdentifierSchema,
  type: NXMLPrimitiveTypeSchema,
  required: z.boolean().optional().default(true),
  default: z.unknown().optional(),
  description: z.string().optional(),
  loc: SourceLocationSchema,
});

// =============================================================================
// Handler Node Schema
// =============================================================================

/**
 * Handler code validation
 * Checks for forbidden globals and basic syntax
 */
export const HandlerCodeSchema = z
  .string()
  .min(1)
  .refine(
    (code) => {
      // Check for forbidden globals
      // Added fetch and XMLHttpRequest to forbid direct network access
      const forbidden = ['window', 'document', 'eval', 'Function', 'fetch', 'XMLHttpRequest'];
      for (const word of forbidden) {
        // Simple check - not foolproof but catches obvious cases
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        if (regex.test(code)) {
          return false;
        }
      }
      return true;
    },
    { message: 'Handler code contains forbidden globals (window, document, eval, Function, fetch, XMLHttpRequest)' }
  );

/**
 * Schema for Handler node
 */
export const HandlerNodeSchema = z.object({
  kind: z.literal('Handler'),
  code: HandlerCodeSchema,
  isAsync: z.boolean().optional(),
  loc: SourceLocationSchema,
});

// =============================================================================
// Tool Node Schema
// =============================================================================

/**
 * Schema for Tool definition
 */
export const ToolNodeSchema = z.object({
  kind: z.literal('Tool'),
  name: IdentifierSchema,
  description: z.string().optional(),
  args: z.array(ArgNodeSchema),
  handler: HandlerNodeSchema,
  loc: SourceLocationSchema,
});

// =============================================================================
// Lifecycle Node Schema
// =============================================================================

/**
 * Valid lifecycle events
 */
export const LifecycleEventSchema = z.enum(['mount', 'unmount']);

/**
 * Schema for Lifecycle hook
 */
export const LifecycleNodeSchema = z.object({
  kind: z.literal('Lifecycle'),
  on: LifecycleEventSchema,
  handler: HandlerNodeSchema,
  loc: SourceLocationSchema,
});

// =============================================================================
// Extension Node Schema
// =============================================================================

/**
 * Extension name format (e.g., "nexus.fs", "org.ollama")
 */
export const ExtensionNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/, 'Invalid extension name format');

/**
 * Schema for Extension declaration
 */
export const ExtensionNodeSchema = z.object({
  kind: z.literal('Extension'),
  name: ExtensionNameSchema,
  alias: IdentifierSchema,
  source: z.string().optional(),
  loc: SourceLocationSchema,
});

// =============================================================================
// Logic AST Schema
// =============================================================================

/**
 * Schema for complete Logic AST
 */
export const LogicASTSchema = z.object({
  kind: z.literal('Logic'),
  extensions: z.array(ExtensionNodeSchema),
  tools: z.array(ToolNodeSchema),
  lifecycles: z.array(LifecycleNodeSchema),
  loc: SourceLocationSchema,
}).refine(
  (logic) => {
    // Check for duplicate tool names
    const toolNames = logic.tools.map(t => t.name);
    return new Set(toolNames).size === toolNames.length;
  },
  { message: 'Duplicate tool names detected' }
).refine(
  (logic) => {
    // Check for duplicate extension aliases
    const aliases = logic.extensions.map(e => e.alias);
    return new Set(aliases).size === aliases.length;
  },
  { message: 'Duplicate extension aliases detected' }
).refine(
  (logic) => {
    // Only one mount and one unmount lifecycle allowed
    const mounts = logic.lifecycles.filter(l => l.on === 'mount').length;
    const unmounts = logic.lifecycles.filter(l => l.on === 'unmount').length;
    return mounts <= 1 && unmounts <= 1;
  },
  { message: 'Only one mount and one unmount lifecycle allowed' }
);

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate an arg node
 */
export function validateArgNode(node: unknown) {
  return ArgNodeSchema.safeParse(node);
}

/**
 * Validate a handler node
 */
export function validateHandlerNode(node: unknown) {
  return HandlerNodeSchema.safeParse(node);
}

/**
 * Validate a tool node
 */
export function validateToolNode(node: unknown) {
  return ToolNodeSchema.safeParse(node);
}

/**
 * Validate a lifecycle node
 */
export function validateLifecycleNode(node: unknown) {
  return LifecycleNodeSchema.safeParse(node);
}

/**
 * Validate an extension node
 */
export function validateExtensionNode(node: unknown) {
  return ExtensionNodeSchema.safeParse(node);
}

/**
 * Validate the complete Logic AST
 */
export function validateLogicAST(ast: unknown) {
  return LogicASTSchema.safeParse(ast);
}

/**
 * Check if handler code uses async patterns
 */
export function detectAsyncHandler(code: string): boolean {
  return /\bawait\b/.test(code) || /\basync\b/.test(code);
}

/**
 * Extract extension references from handler code
 * Returns array of alias names that are used
 */
export function extractExtensionUsage(code: string): string[] {
  const matches = code.matchAll(/\$ext\.(\w+)/g);
  return [...new Set([...matches].map(m => m[1]).filter((m): m is string => m !== undefined))];
}

/**
 * Validate that all extension usages in handlers are declared
 */
export function validateExtensionUsage(
  logic: z.infer<typeof LogicASTSchema>
): { valid: boolean; undeclared: string[] } {
  const declaredAliases = new Set(logic.extensions.map(e => e.alias));
  const undeclared: string[] = [];
  
  // Check all tool handlers
  for (const tool of logic.tools) {
    const usages = extractExtensionUsage(tool.handler.code);
    for (const usage of usages) {
      if (!declaredAliases.has(usage)) {
        undeclared.push(usage);
      }
    }
  }
  
  // Check all lifecycle handlers
  for (const lifecycle of logic.lifecycles) {
    const usages = extractExtensionUsage(lifecycle.handler.code);
    for (const usage of usages) {
      if (!declaredAliases.has(usage)) {
        undeclared.push(usage);
      }
    }
  }
  
  return {
    valid: undeclared.length === 0,
    undeclared: [...new Set(undeclared)],
  };
}

// =============================================================================
// Type Exports
// =============================================================================

export type ArgNodeInput = z.input<typeof ArgNodeSchema>;
export type ArgNodeOutput = z.output<typeof ArgNodeSchema>;
export type HandlerNodeInput = z.input<typeof HandlerNodeSchema>;
export type HandlerNodeOutput = z.output<typeof HandlerNodeSchema>;
export type ToolNodeInput = z.input<typeof ToolNodeSchema>;
export type ToolNodeOutput = z.output<typeof ToolNodeSchema>;
export type LifecycleNodeInput = z.input<typeof LifecycleNodeSchema>;
export type LifecycleNodeOutput = z.output<typeof LifecycleNodeSchema>;
export type ExtensionNodeInput = z.input<typeof ExtensionNodeSchema>;
export type ExtensionNodeOutput = z.output<typeof ExtensionNodeSchema>;
export type LogicASTInput = z.input<typeof LogicASTSchema>;
export type LogicASTOutput = z.output<typeof LogicASTSchema>;