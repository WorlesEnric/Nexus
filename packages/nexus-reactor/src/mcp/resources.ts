/**
 * @nexus/reactor - MCP Resources
 *
 * Utilities for working with MCP resources
 */

import type { MCPResource, NexusPanelAST } from '../core/types';
import type { StateStore } from '../state/store';
import { getSnapshot } from '../state/store';

/**
 * Generate standard panel resources
 */
export function generatePanelResources(panelId: string): MCPResource[] {
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
    {
      uri: `nexus://${panelId}/meta`,
      name: 'Panel Metadata',
      mimeType: 'application/json',
    },
  ];
}

/**
 * Read a resource by URI
 */
export function readResource(
  uri: string,
  ast: NexusPanelAST,
  stateStore: StateStore
): { content: unknown; mimeType: string } | null {
  const panelId = ast.meta.id ?? 'panel';

  // State resource
  if (uri === `nexus://${panelId}/state`) {
    return {
      content: getSnapshot(stateStore),
      mimeType: 'application/json',
    };
  }

  // Computed values resource
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

  // Panel metadata resource
  if (uri === `nexus://${panelId}/meta`) {
    return {
      content: {
        title: ast.meta.title,
        description: ast.meta.description,
        id: ast.meta.id,
        version: ast.meta.version,
        author: ast.meta.author,
        tags: ast.meta.tags,
      },
      mimeType: 'application/json',
    };
  }

  return null;
}

/**
 * Parse a resource URI
 */
export function parseResourceURI(uri: string): {
  protocol: string;
  panelId: string;
  resourceType: string;
} | null {
  const match = uri.match(/^([a-z]+):\/\/([^/]+)\/(.+)$/);
  if (!match) return null;

  return {
    protocol: match[1],
    panelId: match[2],
    resourceType: match[3],
  };
}

/**
 * Generate a resource URI
 */
export function generateResourceURI(panelId: string, resourceType: string): string {
  return `nexus://${panelId}/${resourceType}`;
}

/**
 * Check if a URI is a panel resource
 */
export function isPanelResource(uri: string): boolean {
  return uri.startsWith('nexus://');
}

/**
 * Get all available resource types
 */
export function getAvailableResourceTypes(): string[] {
  return ['state', 'computed', 'meta'];
}

/**
 * Get resource description
 */
export function getResourceDescription(resourceType: string): string | null {
  const descriptions: Record<string, string> = {
    state: 'Current state values of the panel',
    computed: 'Computed values derived from state',
    meta: 'Panel metadata (title, description, etc.)',
  };

  return descriptions[resourceType] ?? null;
}

/**
 * Generate resource list for a panel
 */
export function generateResourceList(ast: NexusPanelAST): MCPResource[] {
  const panelId = ast.meta.id ?? 'panel';
  return generatePanelResources(panelId);
}

/**
 * Find a resource by name
 */
export function findResourceByName(resources: MCPResource[], name: string): MCPResource | undefined {
  return resources.find(r => r.name === name);
}

/**
 * Find a resource by URI
 */
export function findResourceByURI(resources: MCPResource[], uri: string): MCPResource | undefined {
  return resources.find(r => r.uri === uri);
}

/**
 * Get resource names
 */
export function getResourceNames(resources: MCPResource[]): string[] {
  return resources.map(r => r.name);
}

/**
 * Get resource URIs
 */
export function getResourceURIs(resources: MCPResource[]): string[] {
  return resources.map(r => r.uri);
}
