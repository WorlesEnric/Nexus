/**
 * Context Builder - Converts NOG graph to structured LLM prompts
 *
 * Purpose: Compile the NOG graph into natural language context
 * that the LLM can understand and work with.
 */

import type { NOGGraph, NOGEntity, NOGRelationship } from '@nexus/protocol';
import type { LLMContext } from './types';

/**
 * Build context from NOG graph for LLM
 */
export function buildContext(
  nogGraph: NOGGraph,
  userRequest: string,
  panelId?: string
): LLMContext {
  // Filter entities if panel ID is specified
  const relevantEntities = panelId
    ? nogGraph.entities.filter((e) => e.sourcePanel === panelId)
    : nogGraph.entities;

  // Build system prompt
  const systemPrompt = buildSystemPrompt();

  // Convert NOG to readable context
  const userContext = graphToMarkdown(relevantEntities, nogGraph.relationships);

  // Get NXML constraints
  const constraints = getNXMLConstraints();

  return {
    systemPrompt,
    userContext,
    userRequest,
    constraints,
    availableTools: extractTools(relevantEntities),
  };
}

/**
 * Build system prompt defining AI role
 */
function buildSystemPrompt(): string {
  return `You are NexusOS, an AI assistant for the Nexus platform.

Your role is to help users create and modify interactive panels using NXML (Nexus Extensible Markup Language).

## Capabilities

1. **Create Panels**: Generate complete NXML definitions for new panels
2. **Modify Panels**: Update existing panels by providing patches
3. **Explain Code**: Help users understand panel structure and behavior

## NXML Structure

NXML has three main sections:
- <Data>: State variables and computed properties
- <Logic>: Tools (functions) that can be called by users or AI
- <View>: UI layout and components

## Response Format

When creating or modifying panels, always respond with:
1. Brief explanation of what you're doing
2. Complete NXML code in a code block
3. List of changes made

## Guidelines

- Keep panels simple and focused
- Use semantic naming for states and tools
- Follow React-like patterns for UI
- Tools should have clear descriptions for future AI use`;
}

/**
 * Convert NOG entities and relationships to markdown
 */
function graphToMarkdown(entities: NOGEntity[], relationships: NOGRelationship[]): string {
  const lines: string[] = [];

  lines.push('# Current Workspace State\n');

  // Group entities by category
  const byCategory = groupBy(entities, (e) => e.category);

  for (const [category, items] of Object.entries(byCategory)) {
    lines.push(`## ${capitalize(category)} Entities\n`);

    for (const entity of items) {
      lines.push(`### ${entity.name}`);
      lines.push(`- ID: \`${entity.id}\``);
      lines.push(`- Status: ${entity.status}`);
      if (entity.description) {
        lines.push(`- Description: ${entity.description}`);
      }
      if (entity.sourcePanel) {
        lines.push(`- Source Panel: ${entity.sourcePanel}`);
      }

      // Add properties
      if (Object.keys(entity.properties).length > 0) {
        lines.push('- Properties:');
        for (const [key, value] of Object.entries(entity.properties)) {
          lines.push(`  - ${key}: ${formatValue(value)}`);
        }
      }

      lines.push('');
    }
  }

  // Add relationships
  if (relationships.length > 0) {
    lines.push('## Relationships\n');
    for (const rel of relationships) {
      const from = entities.find((e) => e.id === rel.from);
      const to = entities.find((e) => e.id === rel.to);
      if (from && to) {
        lines.push(`- ${from.name} --[${rel.type}]--> ${to.name}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get NXML schema constraints
 */
function getNXMLConstraints(): string[] {
  return [
    'State names must be valid JavaScript identifiers',
    'State types: string, number, boolean, list, object',
    'Tool names must be unique within a panel',
    'Tool handlers have access to $state, $args, $emit, $view',
    'View components: Layout, Container, Text, Button, Input, Switch, Metric, etc',
    'Bindings use {$state.variableName} syntax',
    'Tool triggers use trigger="toolName" on buttons/actions',
  ];
}

/**
 * Extract available tools from entities
 */
function extractTools(entities: NOGEntity[]): string[] {
  return entities
    .filter((e) => e.properties.kind === 'Tool')
    .map((e) => {
      const toolName = e.properties.toolName as string;
      const description = e.description || '';
      return `${toolName}: ${description}`;
    });
}

/**
 * Estimate token count (rough approximation)
 * Real implementation should use tiktoken
 */
export function estimateTokens(context: LLMContext): number {
  const text =
    context.systemPrompt +
    context.userContext +
    context.userRequest +
    context.constraints.join(' ');

  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

// =============================================================================
// Helper Functions
// =============================================================================

function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
  return arr.reduce(
    (acc, item) => {
      const key = fn(item);
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > 100 ? value.slice(0, 100) + '...' : value;
  }
  return String(value);
}
