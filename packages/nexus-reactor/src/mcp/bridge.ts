/**
 * @nexus/reactor - MCP Bridge
 * 
 * Exposes panel tools and state to AI agents via MCP
 */

import type { NexusPanelAST, ToolNode, MCPTool, MCPResource, JSONSchema } from '../core/types';
import type { StateStore } from '../state/store';
import { getSnapshot } from '../state/store';
import { createDebugger } from '../utils/debug';

const debug = createDebugger('mcp');

export interface MCPBridge {
  getTools(): MCPTool[];
  getResources(): MCPResource[];
  readResource(uri: string): { content: unknown; mimeType: string } | null;
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
}

export function createMCPBridge(
  ast: NexusPanelAST,
  stateStore: StateStore,
  executeTool: (name: string, args?: Record<string, unknown>) => Promise<unknown>
): MCPBridge {
  return {
    getTools() {
      return ast.logic.tools.map(tool => convertToolToMCP(tool));
    },

    getResources() {
      const panelId = ast.meta.id ?? 'panel';
      return [
        {
          uri: `nexus://${panelId}/state`,
          name: 'Panel State',
          mimeType: 'application/json',
        },
        {
          uri: `nexus://${panelId}/computed`,
          name: 'Computed Values',
          mimeType: 'application/json',
        },
      ];
    },

    readResource(uri: string) {
      debug.log(`Reading resource: ${uri}`);
      
      const panelId = ast.meta.id ?? 'panel';
      
      if (uri === `nexus://${panelId}/state`) {
        return {
          content: getSnapshot(stateStore),
          mimeType: 'application/json',
        };
      }
      
      if (uri === `nexus://${panelId}/computed`) {
        const computed: Record<string, unknown> = {};
        for (const comp of ast.data.computed) {
          computed[comp.name] = stateStore.proxy[comp.name];
        }
        return {
          content: computed,
          mimeType: 'application/json',
        };
      }
      
      return null;
    },

    async callTool(name: string, args?: Record<string, unknown>) {
      debug.log(`Calling tool: ${name}`, args);
      return executeTool(name, args);
    },
  };
}

function convertToolToMCP(tool: ToolNode): MCPTool {
  const properties: Record<string, JSONSchema> = {};
  const required: string[] = [];

  for (const arg of tool.args) {
    properties[arg.name] = {
      type: nxmlTypeToJsonType(arg.type),
      description: arg.description,
      default: arg.default,
    };
    
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

function nxmlTypeToJsonType(type: string): string {
  switch (type) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'list': return 'array';
    case 'object': return 'object';
    default: return 'string';
  }
}

/**
 * Generate a JSON Schema for the panel's state
 */
export function generateStateSchema(ast: NexusPanelAST): JSONSchema {
  const properties: Record<string, JSONSchema> = {};

  for (const state of ast.data.states) {
    properties[state.name] = {
      type: nxmlTypeToJsonType(state.type),
      default: state.default,
    };
  }

  for (const computed of ast.data.computed) {
    properties[computed.name] = {
      type: 'string', // Unknown type for computed
      description: `Computed: ${computed.value}`,
    };
  }

  return {
    type: 'object',
    properties,
  };
}

/**
 * Get all tools as a formatted list for AI context
 */
export function getToolsDescription(ast: NexusPanelAST): string {
  const lines: string[] = ['Available tools:'];

  for (const tool of ast.logic.tools) {
    lines.push(`\n- ${tool.name}${tool.description ? `: ${tool.description}` : ''}`);
    
    if (tool.args.length > 0) {
      lines.push('  Arguments:');
      for (const arg of tool.args) {
        const required = arg.required !== false ? ' (required)' : '';
        const defaultVal = arg.default !== undefined ? ` [default: ${arg.default}]` : '';
        lines.push(`    - ${arg.name}: ${arg.type}${required}${defaultVal}`);
        if (arg.description) {
          lines.push(`      ${arg.description}`);
        }
      }
    }
  }

  return lines.join('\n');
}