/**
 * @nexus/reactor - AST Validator
 */

import type { NexusPanelAST, DataAST, LogicAST, ViewAST, ViewNode, ValidationResult, ValidationError, ValidationWarning } from '../core/types';
import { ValidationError as ValidationErrorClass, AggregateValidationError } from '../core/errors';
import { IDENTIFIER_PATTERN, FORBIDDEN_GLOBALS, ERROR_CODES, WARNING_CODES } from '../core/constants';
import { extractStateRefs, extractScopeRefs, isBindingExpression } from '../utils/expression';

export function validate(ast: NexusPanelAST): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  validateData(ast.data, errors, warnings);
  validateLogic(ast.logic, errors, warnings);
  validateView(ast.view, ast.data, ast.logic, errors, warnings);
  validateCrossReferences(ast, errors, warnings);
  return { valid: errors.length === 0, errors, warnings };
}

export function validateOrThrow(ast: NexusPanelAST): void {
  const result = validate(ast);
  if (!result.valid) {
    const errorObjs = result.errors.map(e => new ValidationErrorClass(e.code, e.message, { path: e.path, loc: e.loc }));
    const warningObjs = result.warnings.map(w => new ValidationErrorClass(w.code, w.message, { path: w.path, severity: 'warning' }));
    throw new AggregateValidationError(errorObjs, warningObjs);
  }
}

function validateData(data: DataAST, errors: ValidationError[], warnings: ValidationWarning[]): void {
  const names = new Set<string>();
  for (const state of data.states) {
    if (!IDENTIFIER_PATTERN.test(state.name)) {
      errors.push({ code: ERROR_CODES.INVALID_IDENTIFIER, message: `Invalid state name: "${state.name}"`, path: ['data', 'states', state.name], loc: state.loc });
    }
    if (names.has(state.name)) {
      errors.push({ code: ERROR_CODES.DUPLICATE_STATE, message: `Duplicate state/computed name: "${state.name}"`, path: ['data', 'states', state.name], loc: state.loc });
    }
    names.add(state.name);
  }
  for (const computed of data.computed) {
    if (!IDENTIFIER_PATTERN.test(computed.name)) {
      errors.push({ code: ERROR_CODES.INVALID_IDENTIFIER, message: `Invalid computed name: "${computed.name}"`, path: ['data', 'computed', computed.name], loc: computed.loc });
    }
    if (names.has(computed.name)) {
      errors.push({ code: ERROR_CODES.DUPLICATE_STATE, message: `Duplicate state/computed name: "${computed.name}"`, path: ['data', 'computed', computed.name], loc: computed.loc });
    }
    names.add(computed.name);
  }
}

function validateLogic(logic: LogicAST, errors: ValidationError[], warnings: ValidationWarning[]): void {
  const toolNames = new Set<string>();
  const extensionAliases = new Set<string>();

  for (const ext of logic.extensions) {
    if (!IDENTIFIER_PATTERN.test(ext.alias)) {
      errors.push({ code: ERROR_CODES.INVALID_IDENTIFIER, message: `Invalid extension alias: "${ext.alias}"`, path: ['logic', 'extensions', ext.alias], loc: ext.loc });
    }
    if (extensionAliases.has(ext.alias)) {
      errors.push({ code: ERROR_CODES.DUPLICATE_EXTENSION_ALIAS, message: `Duplicate extension alias: "${ext.alias}"`, path: ['logic', 'extensions', ext.alias], loc: ext.loc });
    }
    extensionAliases.add(ext.alias);
  }

  for (const tool of logic.tools) {
    if (!IDENTIFIER_PATTERN.test(tool.name)) {
      errors.push({ code: ERROR_CODES.INVALID_IDENTIFIER, message: `Invalid tool name: "${tool.name}"`, path: ['logic', 'tools', tool.name], loc: tool.loc });
    }
    if (toolNames.has(tool.name)) {
      errors.push({ code: ERROR_CODES.DUPLICATE_TOOL, message: `Duplicate tool name: "${tool.name}"`, path: ['logic', 'tools', tool.name], loc: tool.loc });
    }
    toolNames.add(tool.name);
    validateHandlerCode(tool.handler.code, extensionAliases, ['logic', 'tools', tool.name, 'handler'], errors);
  }

  let mountCount = 0, unmountCount = 0;
  for (const lifecycle of logic.lifecycles) {
    if (lifecycle.on === 'mount') { mountCount++; if (mountCount > 1) errors.push({ code: ERROR_CODES.DUPLICATE_LIFECYCLE, message: 'Only one mount lifecycle allowed', path: ['logic', 'lifecycles', 'mount'], loc: lifecycle.loc }); }
    else if (lifecycle.on === 'unmount') { unmountCount++; if (unmountCount > 1) errors.push({ code: ERROR_CODES.DUPLICATE_LIFECYCLE, message: 'Only one unmount lifecycle allowed', path: ['logic', 'lifecycles', 'unmount'], loc: lifecycle.loc }); }
    validateHandlerCode(lifecycle.handler.code, extensionAliases, ['logic', 'lifecycles', lifecycle.on, 'handler'], errors);
  }

  if (logic.extensions.length > 0 && mountCount === 0) {
    warnings.push({ code: WARNING_CODES.NO_MOUNT_WITH_EXTENSIONS, message: 'Extensions declared but no mount lifecycle to initialize them', path: ['logic', 'extensions'] });
  }
}

function validateHandlerCode(code: string, extensionAliases: Set<string>, path: string[], errors: ValidationError[]): void {
  for (const global of FORBIDDEN_GLOBALS) {
    const regex = new RegExp(`\\b${global}\\b`);
    if (regex.test(code)) {
      errors.push({ code: ERROR_CODES.FORBIDDEN_GLOBAL, message: `Handler code contains forbidden global: "${global}"`, path });
    }
  }
  const extUsagePattern = /\$ext\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  let match;
  while ((match = extUsagePattern.exec(code)) !== null) {
    if (!extensionAliases.has(match[1])) {
      errors.push({ code: ERROR_CODES.UNDECLARED_EXTENSION, message: `Usage of undeclared extension: "$ext.${match[1]}"`, path });
    }
  }
}

function validateView(view: ViewAST, data: DataAST, logic: LogicAST, errors: ValidationError[], warnings: ValidationWarning[]): void {
  const viewIds = new Set<string>();
  const stateNames = new Set([...data.states.map(s => s.name), ...data.computed.map(c => c.name)]);
  const toolNames = new Set(logic.tools.map(t => t.name));
  validateViewNode(view.root, stateNames, toolNames, viewIds, [], ['view', 'root'], errors, warnings);
}

function validateViewNode(node: ViewNode, stateNames: Set<string>, toolNames: Set<string>, viewIds: Set<string>, scopeStack: string[], path: string[], errors: ValidationError[], warnings: ValidationWarning[]): void {
  if (node.id) {
    if (viewIds.has(node.id)) errors.push({ code: ERROR_CODES.DUPLICATE_VIEW_ID, message: `Duplicate view id: "${node.id}"`, path: [...path, 'id'], loc: node.loc });
    viewIds.add(node.id);
  }
  const trigger = node.props.trigger as string | undefined;
  if (trigger && !toolNames.has(trigger)) {
    errors.push({ code: ERROR_CODES.UNDEFINED_TOOL_REFERENCE, message: `Reference to undefined tool: "${trigger}"`, path: [...path, 'trigger'], loc: node.loc });
  }
  for (const [key, value] of Object.entries(node.props)) {
    if (typeof value === 'string' && isBindingExpression(value)) {
      const stateRefs = extractStateRefs(value);
      for (const ref of stateRefs) {
        if (!stateNames.has(ref)) errors.push({ code: ERROR_CODES.UNDEFINED_STATE_REFERENCE, message: `Reference to undefined state: "${ref}"`, path: [...path, key], loc: node.loc });
      }
      const scopeRefs = extractScopeRefs(value);
      if (scopeRefs.length > 0 && scopeStack.length === 0) {
        errors.push({ code: ERROR_CODES.INVALID_SCOPE_REFERENCE, message: '$scope reference used outside of <Iterate> context', path: [...path, key], loc: node.loc });
      }
    }
  }
  let newScopeStack = scopeStack;
  if (node.type === 'Iterate') {
    const as = node.props.as as string;
    if (as) newScopeStack = [...scopeStack, as];
  }
  for (let i = 0; i < node.children.length; i++) {
    validateViewNode(node.children[i], stateNames, toolNames, viewIds, newScopeStack, [...path, 'children', String(i)], errors, warnings);
  }
}

function validateCrossReferences(ast: NexusPanelAST, errors: ValidationError[], warnings: ValidationWarning[]): void {
  const referencedStates = new Set<string>();
  const triggeredTools = new Set<string>();
  collectViewReferences(ast.view.root, referencedStates, triggeredTools);
  for (const tool of ast.logic.tools) extractStateRefs(tool.handler.code).forEach(ref => referencedStates.add(ref));
  for (const lifecycle of ast.logic.lifecycles) extractStateRefs(lifecycle.handler.code).forEach(ref => referencedStates.add(ref));
  for (const state of ast.data.states) {
    if (!referencedStates.has(state.name)) warnings.push({ code: WARNING_CODES.UNUSED_STATE, message: `State "${state.name}" is defined but never referenced`, path: ['data', 'states', state.name] });
  }
  for (const tool of ast.logic.tools) {
    if (!triggeredTools.has(tool.name)) warnings.push({ code: WARNING_CODES.UNUSED_TOOL, message: `Tool "${tool.name}" is defined but not triggered from view`, path: ['logic', 'tools', tool.name] });
  }
}

function collectViewReferences(node: ViewNode, stateRefs: Set<string>, toolRefs: Set<string>): void {
  const trigger = node.props.trigger as string | undefined;
  if (trigger) toolRefs.add(trigger);
  for (const value of Object.values(node.props)) {
    if (typeof value === 'string' && isBindingExpression(value)) extractStateRefs(value).forEach(ref => stateRefs.add(ref));
  }
  for (const child of node.children) collectViewReferences(child, stateRefs, toolRefs);
}

export function validateQuick(ast: NexusPanelAST): boolean {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  validateData(ast.data, errors, warnings);
  validateLogic(ast.logic, errors, warnings);
  return errors.length === 0;
}

export function getToolNames(ast: NexusPanelAST): string[] { return ast.logic.tools.map(t => t.name); }
export function getStateNames(ast: NexusPanelAST): string[] { return [...ast.data.states.map(s => s.name), ...ast.data.computed.map(c => c.name)]; }
export function findTool(ast: NexusPanelAST, name: string) { return ast.logic.tools.find(t => t.name === name); }
export function findState(ast: NexusPanelAST, name: string) { return ast.data.states.find(s => s.name === name) ?? ast.data.computed.find(c => c.name === name); }