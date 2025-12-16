/**
 * Patch Generator - Converts LLM responses to NOG patches
 *
 * Purpose: Parse LLM output and convert it into structured NOG patches
 * that can be applied to the workspace.
 */

import { parse as parseNXML } from '@nexus/reactor';
import { parseNXMLToEntities } from '@nexus/protocol';
import type { NOGEntity, NOGPatch } from '@nexus/protocol';
import type { PatchContext } from './types';

export interface GenerateResult {
  patches: NOGPatch[];
  confidence: number;
  warnings: string[];
}

/**
 * Generate patches from LLM response
 */
export function generatePatches(
  llmResponse: string,
  context: PatchContext
): GenerateResult {
  const warnings: string[] = [];

  // Try to extract NXML from response
  const nxmlContent = extractNXML(llmResponse);

  if (nxmlContent) {
    // Parse NXML and convert to patches
    try {
      const patches = nxmlToPatches(nxmlContent, context);
      return {
        patches,
        confidence: 0.9, // High confidence when valid NXML is provided
        warnings,
      };
    } catch (error) {
      warnings.push(`Failed to parse NXML: ${error instanceof Error ? error.message : String(error)}`);
      return {
        patches: [],
        confidence: 0,
        warnings,
      };
    }
  }

  // If no NXML found, try to extract intentions from natural language
  warnings.push('No NXML code block found in response, attempting natural language parsing');

  const intentions = extractIntentions(llmResponse);
  if (intentions.length > 0) {
    const patches = intentionsToPatches(intentions, context);
    return {
      patches,
      confidence: 0.5, // Lower confidence for NL parsing
      warnings,
    };
  }

  warnings.push('Could not extract any actionable patches from response');
  return {
    patches: [],
    confidence: 0,
    warnings,
  };
}

/**
 * Extract NXML code from markdown response
 */
function extractNXML(response: string): string | null {
  // Look for NXML in code blocks
  const nxmlMatch = response.match(/```(?:nxml|xml)?\s*\n([\s\S]*?)\n```/);
  if (nxmlMatch && nxmlMatch[1]) {
    return nxmlMatch[1].trim();
  }

  // Look for <NexusPanel> tags
  const directMatch = response.match(/<NexusPanel[\s\S]*?<\/NexusPanel>/);
  if (directMatch) {
    return directMatch[0];
  }

  return null;
}

/**
 * Convert NXML content to NOG patches
 */
function nxmlToPatches(nxmlContent: string, context: PatchContext): NOGPatch[] {
  const patches: NOGPatch[] = [];

  // Parse NXML using nexus-reactor
  const ast = parseNXML(nxmlContent);

  // Convert AST to NOG entities using protocol mapper
  const { entities, relationships } = parseNXMLToEntities(
    `${context.panelId}.nxml`,
    nxmlContent
  );

  // Compare with current entities to generate patches
  const currentIds = new Set(context.currentEntities.map((e) => e.id));

  // Add new entities
  for (const entity of entities) {
    if (!currentIds.has(entity.id)) {
      patches.push({
        type: 'add_entity',
        entity: entity,
      });
    } else {
      // Update existing entity
      patches.push({
        type: 'update_entity',
        entityId: entity.id,
        changes: {
          name: entity.name,
          description: entity.description,
          properties: entity.properties,
          tags: entity.tags,
        },
      });
    }
  }

  // Add relationships
  for (const relationship of relationships) {
    patches.push({
      type: 'add_relationship',
      relationship: relationship,
    });
  }

  return patches;
}

/**
 * Extract intentions from natural language
 * (Simplified - a real implementation would use more sophisticated NLP)
 */
interface Intention {
  action: 'add' | 'update' | 'delete';
  target: string;
  details: Record<string, unknown>;
}

function extractIntentions(response: string): Intention[] {
  const intentions: Intention[] = [];

  // Simple pattern matching for common phrases
  // "add a state called X"
  const addStatePattern = /add (?:a )?state (?:called |named )?["']?(\w+)["']?/gi;
  let match;
  while ((match = addStatePattern.exec(response)) !== null) {
    intentions.push({
      action: 'add',
      target: 'state',
      details: {
        name: match[1],
        type: 'string', // Default type
      },
    });
  }

  // "add a tool called X"
  const addToolPattern = /add (?:a )?tool (?:called |named )?["']?(\w+)["']?/gi;
  while ((match = addToolPattern.exec(response)) !== null) {
    intentions.push({
      action: 'add',
      target: 'tool',
      details: {
        name: match[1],
        description: `Tool: ${match[1]}`,
      },
    });
  }

  return intentions;
}

/**
 * Convert intentions to patches
 */
function intentionsToPatches(
  intentions: Intention[],
  context: PatchContext
): NOGPatch[] {
  const patches: NOGPatch[] = [];

  for (const intention of intentions) {
    if (intention.action === 'add' && intention.target === 'state') {
      patches.push({
        type: 'add_entity',
        entity: {
          id: `state:${context.panelId}:${intention.details.name}`,
          name: intention.details.name as string,
          category: 'data',
          status: 'active',
          description: `State variable: ${intention.details.name}`,
          sourcePanel: context.panelId,
          tags: ['state', intention.details.type as string],
          properties: {
            kind: 'State',
            type: intention.details.type,
            stateName: intention.details.name,
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
        },
      });
    }

    if (intention.action === 'add' && intention.target === 'tool') {
      patches.push({
        type: 'add_entity',
        entity: {
          id: `tool:${context.panelId}:${intention.details.name}`,
          name: intention.details.name as string,
          category: 'action',
          status: 'active',
          description: intention.details.description as string,
          sourcePanel: context.panelId,
          tags: ['tool', 'action'],
          properties: {
            kind: 'Tool',
            toolName: intention.details.name,
            args: '[]',
            handler: '// TODO: Implement handler',
            isAsync: 'false',
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
        },
      });
    }
  }

  return patches;
}
