/**
 * @nexus/reactor - MCP Tools
 *
 * Utilities for working with MCP tools
 */

import type { MCPTool, ToolNode, ArgNode, JSONSchema, NXMLPrimitiveType } from '../core/types';

/**
 * Convert an NXML tool to MCP tool format
 */
export function convertToolToMCP(tool: ToolNode): MCPTool {
  const properties: Record<string, JSONSchema> = {};
  const required: string[] = [];

  for (const arg of tool.args) {
    properties[arg.name] = convertArgToSchema(arg);

    if (arg.required !== false) {
      required.push(arg.name);
    }
  }

  return {
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    },
  };
}

/**
 * Convert an NXML arg to JSON schema
 */
export function convertArgToSchema(arg: ArgNode): JSONSchema {
  return {
    type: nxmlTypeToJsonType(arg.type),
    description: arg.description,
    default: arg.default,
  };
}

/**
 * Convert NXML primitive type to JSON schema type
 */
export function nxmlTypeToJsonType(type: NXMLPrimitiveType): string {
  switch (type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'list':
      return 'array';
    case 'object':
      return 'object';
    default:
      return 'string';
  }
}

/**
 * Get all tool names from an array of tools
 */
export function getToolNames(tools: ToolNode[]): string[] {
  return tools.map(t => t.name);
}

/**
 * Find a tool by name
 */
export function findToolByName(tools: ToolNode[], name: string): ToolNode | undefined {
  return tools.find(t => t.name === name);
}

/**
 * Get tool signature as a string (for debugging)
 */
export function getToolSignature(tool: ToolNode): string {
  const args = tool.args.map(arg => {
    const optional = arg.required === false ? '?' : '';
    const defaultValue = arg.default !== undefined ? ` = ${JSON.stringify(arg.default)}` : '';
    return `${arg.name}${optional}: ${arg.type}${defaultValue}`;
  }).join(', ');

  return `${tool.name}(${args})`;
}

/**
 * Check if a tool has required arguments
 */
export function hasRequiredArgs(tool: ToolNode): boolean {
  return tool.args.some(arg => arg.required !== false);
}

/**
 * Get required argument names
 */
export function getRequiredArgNames(tool: ToolNode): string[] {
  return tool.args
    .filter(arg => arg.required !== false)
    .map(arg => arg.name);
}

/**
 * Get optional argument names
 */
export function getOptionalArgNames(tool: ToolNode): string[] {
  return tool.args
    .filter(arg => arg.required === false)
    .map(arg => arg.name);
}

/**
 * Validate arguments against tool definition
 */
export function validateToolArgs(
  tool: ToolNode,
  args: Record<string, unknown>
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const argDef of tool.args) {
    if (argDef.required !== false && !(argDef.name in args)) {
      missing.push(argDef.name);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get tools description for AI (formatted string)
 */
export function getToolsDescription(tools: ToolNode[]): string {
  return tools.map(tool => {
    const sig = getToolSignature(tool);
    const desc = tool.description ? `\n  ${tool.description}` : '';
    return `- ${sig}${desc}`;
  }).join('\n');
}

/**
 * Check if a tool is async (contains await keyword)
 */
export function isAsyncTool(tool: ToolNode): boolean {
  return tool.handler.isAsync ?? /\bawait\b/.test(tool.handler.code);
}

/**
 * Get all async tools
 */
export function getAsyncTools(tools: ToolNode[]): ToolNode[] {
  return tools.filter(isAsyncTool);
}

/**
 * Get all sync tools
 */
export function getSyncTools(tools: ToolNode[]): ToolNode[] {
  return tools.filter(tool => !isAsyncTool(tool));
}
