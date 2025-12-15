/**
 * @fileoverview Zod schema for complete NexusPanel validation
 * @module @nexus/protocol/schemas/panel
 */

import { z } from 'zod';
import { DataASTSchema } from './data';
import { LogicASTSchema, validateExtensionUsage } from './logic';
import { ViewASTSchema, extractBindingReferences, extractTriggerReferences } from './view';

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
// Panel Metadata Schema
// =============================================================================

/**
 * Panel metadata for identification and display
 */
export const PanelMetaSchema = z.object({
  title: z.string().min(1).max(128),
  description: z.string().max(1024).optional(),
  id: z.string().optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// =============================================================================
// NexusPanel AST Schema
// =============================================================================

/**
 * Complete NexusPanel AST schema
 */
export const NexusPanelASTSchema = z.object({
  kind: z.literal('NexusPanel'),
  meta: PanelMetaSchema,
  data: DataASTSchema,
  logic: LogicASTSchema,
  view: ViewASTSchema,
  loc: SourceLocationSchema,
});

/**
 * Extended validation that checks cross-namespace references
 */
export const NexusPanelASTSchemaStrict = NexusPanelASTSchema.refine(
  (panel) => {
    // Get all defined state names
    const stateNames = new Set([
      ...panel.data.states.map(s => s.name),
      ...panel.data.computed.map(c => c.name),
    ]);
    
    // Get all defined tool names
    const toolNames = new Set(panel.logic.tools.map(t => t.name));
    
    // Extract references from view
    const { stateRefs } = extractBindingReferences(panel.view.root);
    const triggers = extractTriggerReferences(panel.view.root);
    
    // Check all state references are valid
    for (const ref of stateRefs) {
      if (!stateNames.has(ref)) {
        return false;
      }
    }
    
    // Check all triggers reference valid tools
    for (const trigger of triggers) {
      if (!toolNames.has(trigger)) {
        return false;
      }
    }
    
    // Check extension usage in handlers
    const extUsage = validateExtensionUsage(panel.logic);
    if (!extUsage.valid) {
      return false;
    }
    
    return true;
  },
  { message: 'Cross-namespace reference validation failed' }
);

// =============================================================================
// Validation Result Types
// =============================================================================

export interface PanelValidationResult {
  valid: boolean;
  errors: PanelValidationError[];
  warnings: PanelValidationWarning[];
}

export interface PanelValidationError {
  code: string;
  message: string;
  path: string[];
  severity: 'error';
}

export interface PanelValidationWarning {
  code: string;
  message: string;
  path: string[];
  severity: 'warning';
}

// =============================================================================
// Comprehensive Validation
// =============================================================================

/**
 * Perform comprehensive validation of a NexusPanel AST
 * Returns detailed errors and warnings
 */
export function validateNexusPanelAST(ast: unknown): PanelValidationResult {
  const errors: PanelValidationError[] = [];
  const warnings: PanelValidationWarning[] = [];
  
  // Basic schema validation
  const schemaResult = NexusPanelASTSchema.safeParse(ast);
  
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      errors.push({
        code: 'SCHEMA_ERROR',
        message: issue.message,
        path: issue.path.map(String),
        severity: 'error',
      });
    }
    return { valid: false, errors, warnings };
  }
  
  const panel = schemaResult.data;
  
  // Get all defined names
  const stateNames = new Set([
    ...panel.data.states.map(s => s.name),
    ...panel.data.computed.map(c => c.name),
  ]);
  
  const toolNames = new Set(panel.logic.tools.map(t => t.name));
  
  // Validate view bindings
  const { stateRefs, scopeRefs } = extractBindingReferences(panel.view.root);
  
  for (const ref of stateRefs) {
    if (!stateNames.has(ref)) {
      errors.push({
        code: 'UNDEFINED_STATE_REFERENCE',
        message: `View references undefined state: "${ref}"`,
        path: ['view'],
        severity: 'error',
      });
    }
  }
  
  // Validate triggers
  const triggers = extractTriggerReferences(panel.view.root);
  
  for (const trigger of triggers) {
    if (!toolNames.has(trigger)) {
      errors.push({
        code: 'UNDEFINED_TOOL_REFERENCE',
        message: `View triggers undefined tool: "${trigger}"`,
        path: ['view'],
        severity: 'error',
      });
    }
  }
  
  // Validate extension usage
  const extUsage = validateExtensionUsage(panel.logic);
  for (const undeclared of extUsage.undeclared) {
    errors.push({
      code: 'UNDECLARED_EXTENSION',
      message: `Handler uses undeclared extension: "${undeclared}"`,
      path: ['logic'],
      severity: 'error',
    });
  }
  
  // Check for unused state (warning)
  for (const stateName of stateNames) {
    if (!stateRefs.includes(stateName)) {
      // Check if used in computed or handlers
      const usedInComputed = panel.data.computed.some(c => 
        c.value.includes(`$state.${stateName}`)
      );
      const usedInHandlers = panel.logic.tools.some(t =>
        t.handler.code.includes(`$state.${stateName}`)
      ) || panel.logic.lifecycles.some(l =>
        l.handler.code.includes(`$state.${stateName}`)
      );
      
      if (!usedInComputed && !usedInHandlers) {
        warnings.push({
          code: 'UNUSED_STATE',
          message: `State "${stateName}" is defined but never used`,
          path: ['data', stateName],
          severity: 'warning',
        });
      }
    }
  }
  
  // Check for unused tools (warning)
  for (const toolName of toolNames) {
    if (!triggers.includes(toolName)) {
      warnings.push({
        code: 'UNUSED_TOOL',
        message: `Tool "${toolName}" is defined but not triggered from view`,
        path: ['logic', 'tools', toolName],
        severity: 'warning',
      });
    }
  }
  
  // Check for missing mount lifecycle when extensions are used
  if (panel.logic.extensions.length > 0) {
    const hasMountLifecycle = panel.logic.lifecycles.some(l => l.on === 'mount');
    if (!hasMountLifecycle) {
      warnings.push({
        code: 'NO_MOUNT_WITH_EXTENSIONS',
        message: 'Panel uses extensions but has no mount lifecycle for initialization',
        path: ['logic', 'lifecycles'],
        severity: 'warning',
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Quick validation (schema only, no cross-reference checks)
 */
export function validateNexusPanelASTQuick(ast: unknown) {
  return NexusPanelASTSchema.safeParse(ast);
}

/**
 * Strict validation (schema + cross-reference checks)
 */
export function validateNexusPanelASTStrict(ast: unknown) {
  return NexusPanelASTSchemaStrict.safeParse(ast);
}

// =============================================================================
// Type Exports
// =============================================================================

export type PanelMetaInput = z.input<typeof PanelMetaSchema>;
export type PanelMetaOutput = z.output<typeof PanelMetaSchema>;
export type NexusPanelASTInput = z.input<typeof NexusPanelASTSchema>;
export type NexusPanelASTOutput = z.output<typeof NexusPanelASTSchema>;
