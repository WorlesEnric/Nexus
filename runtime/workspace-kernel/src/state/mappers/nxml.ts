/**
 * NXML Mapper - Converts between NXML AST and NOG Entities
 *
 * This mapper provides bidirectional conversion:
 * - Read Path: NXML File → AST → NOG Entities
 * - Write Path: NOG Entities → AST → NXML File
 *
 * The mapper is critical for synchronizing the file system (Git) with
 * the in-memory semantic graph (NOG).
 */

import {
  NOGEntity,
  NOGRelationship,
  EntityCategory,
  EntityStatus,
  generateEntityId,
  generateRelationshipId,
  type NexusPanelAST,
  type StateNode,
  type ComputedNode,
  type ToolNode,
  type LifecycleNode,
  type ExtensionNode,
  type ViewNode,
} from '@nexus/protocol';
import { parse as parseNXML } from '@nexus/reactor';
import { logger } from '../../logger';

// =============================================================================
// Types
// =============================================================================

export interface ParsedPanel {
  panelId: string;
  entities: NOGEntity[];
  relationships: NOGRelationship[];
}

export interface NXMLGenerationOptions {
  indent?: number;
  pretty?: boolean;
}

// =============================================================================
// Read Path: NXML → NOG Entities
// =============================================================================

/**
 * Parse an NXML file and convert it to NOG entities
 * @param filename - The NXML filename (used as sourcePanel)
 * @param content - The NXML content
 * @returns Parsed panel with entities and relationships
 */
export function parseNXMLToEntities(filename: string, content: string): ParsedPanel {
  try {
    logger.debug({ filename }, 'Parsing NXML to entities');

    // Step 1: Parse NXML to AST using nexus-reactor
    const ast = parseNXML(content);

    // Step 2: Extract panel ID
    const panelId = ast.meta.id || filename.replace(/\.nxml$/, '');

    // Step 3: Convert AST to entities
    const entities: NOGEntity[] = [];
    const relationships: NOGRelationship[] = [];

    // Create panel entity
    const panelEntity = createPanelEntity(panelId, ast, filename);
    entities.push(panelEntity);

    // Convert Data namespace
    const dataEntities = convertDataToEntities(panelId, ast.data, filename);
    entities.push(...dataEntities);

    // Create relationships from panel to data
    for (const entity of dataEntities) {
      relationships.push(
        createRelationship(panelEntity.id, entity.id, 'contains', filename)
      );
    }

    // Convert Logic namespace
    const logicEntities = convertLogicToEntities(panelId, ast.logic, filename);
    entities.push(...logicEntities);

    // Create relationships from panel to logic
    for (const entity of logicEntities) {
      relationships.push(
        createRelationship(panelEntity.id, entity.id, 'contains', filename)
      );
    }

    // Convert View namespace
    const viewEntity = convertViewToEntity(panelId, ast.view, filename);
    entities.push(viewEntity);

    // Create relationship from panel to view
    relationships.push(
      createRelationship(panelEntity.id, viewEntity.id, 'renders', filename)
    );

    logger.info(
      {
        filename,
        panelId,
        entityCount: entities.length,
        relationshipCount: relationships.length,
      },
      'Successfully parsed NXML to entities'
    );

    return {
      panelId,
      entities,
      relationships,
    };
  } catch (error) {
    logger.error({ error, filename }, 'Failed to parse NXML to entities');
    throw new Error(
      `Failed to parse NXML ${filename}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Create a panel entity from AST metadata
 */
function createPanelEntity(
  panelId: string,
  ast: NexusPanelAST,
  sourcePanel: string
): NOGEntity {
  return {
    id: `panel:${panelId}`,
    name: ast.meta.title,
    category: 'component' as EntityCategory,
    status: 'active' as EntityStatus,
    description: ast.meta.description || `Nexus panel: ${panelId}`,
    sourcePanel,
    tags: ast.meta.tags || [],
    properties: {
      kind: 'NexusPanel',
      ...(ast.meta.version !== undefined && { version: ast.meta.version }),
      ...(ast.meta.author !== undefined && { author: ast.meta.author }),
      metadata: JSON.stringify(ast.meta),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
  };
}

/**
 * Convert Data AST to entities
 */
function convertDataToEntities(
  panelId: string,
  data: NexusPanelAST['data'],
  sourcePanel: string
): NOGEntity[] {
  const entities: NOGEntity[] = [];

  // Convert State nodes
  for (const state of data.states) {
    entities.push(createStateEntity(panelId, state, sourcePanel));
  }

  // Convert Computed nodes
  for (const computed of data.computed) {
    entities.push(createComputedEntity(panelId, computed, sourcePanel));
  }

  return entities;
}

/**
 * Create a state entity from StateNode
 */
function createStateEntity(
  panelId: string,
  state: StateNode,
  sourcePanel: string
): NOGEntity {
  return {
    id: `state:${panelId}:${state.name}`,
    name: state.name,
    category: 'data' as EntityCategory,
    status: 'active' as EntityStatus,
    description: `State variable: ${state.name}`,
    sourcePanel,
    tags: ['state', state.type],
    properties: {
      kind: 'State',
      type: state.type,
      ...(state.default !== undefined && { default: JSON.stringify(state.default) }),
      stateName: state.name,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
  };
}

/**
 * Create a computed entity from ComputedNode
 */
function createComputedEntity(
  panelId: string,
  computed: ComputedNode,
  sourcePanel: string
): NOGEntity {
  return {
    id: `computed:${panelId}:${computed.name}`,
    name: computed.name,
    category: 'data' as EntityCategory,
    status: 'active' as EntityStatus,
    description: `Computed property: ${computed.name}`,
    sourcePanel,
    tags: ['computed', 'derived'],
    properties: {
      kind: 'Computed',
      expression: computed.value,
      computedName: computed.name,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
  };
}

/**
 * Convert Logic AST to entities
 */
function convertLogicToEntities(
  panelId: string,
  logic: NexusPanelAST['logic'],
  sourcePanel: string
): NOGEntity[] {
  const entities: NOGEntity[] = [];

  // Convert Tool nodes
  for (const tool of logic.tools) {
    entities.push(createToolEntity(panelId, tool, sourcePanel));
  }

  // Convert Lifecycle nodes
  for (const lifecycle of logic.lifecycles) {
    entities.push(createLifecycleEntity(panelId, lifecycle, sourcePanel));
  }

  // Convert Extension nodes
  for (const extension of logic.extensions) {
    entities.push(createExtensionEntity(panelId, extension, sourcePanel));
  }

  return entities;
}

/**
 * Create a tool entity from ToolNode
 */
function createToolEntity(
  panelId: string,
  tool: ToolNode,
  sourcePanel: string
): NOGEntity {
  return {
    id: `tool:${panelId}:${tool.name}`,
    name: tool.name,
    category: 'action' as EntityCategory,
    status: 'active' as EntityStatus,
    description: tool.description || `Tool: ${tool.name}`,
    sourcePanel,
    tags: ['tool', 'action'],
    properties: {
      kind: 'Tool',
      toolName: tool.name,
      args: JSON.stringify(tool.args.map((arg: any) => ({
        name: arg.name,
        type: arg.type,
        required: arg.required !== false,
        default: arg.default,
        description: arg.description,
      }))),
      handler: tool.handler.code,
      isAsync: String(tool.handler.isAsync || false),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
  };
}

/**
 * Create a lifecycle entity from LifecycleNode
 */
function createLifecycleEntity(
  panelId: string,
  lifecycle: LifecycleNode,
  sourcePanel: string
): NOGEntity {
  return {
    id: `lifecycle:${panelId}:${lifecycle.on}`,
    name: `Lifecycle: ${lifecycle.on}`,
    category: 'action' as EntityCategory,
    status: 'active' as EntityStatus,
    description: `Lifecycle hook: ${lifecycle.on}`,
    sourcePanel,
    tags: ['lifecycle', lifecycle.on],
    properties: {
      kind: 'Lifecycle',
      event: lifecycle.on,
      handler: lifecycle.handler.code,
      isAsync: lifecycle.handler.isAsync || false,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
  };
}

/**
 * Create an extension entity from ExtensionNode
 */
function createExtensionEntity(
  panelId: string,
  extension: ExtensionNode,
  sourcePanel: string
): NOGEntity {
  return {
    id: `extension:${panelId}:${extension.name}`,
    name: extension.name,
    category: 'resource' as EntityCategory,
    status: 'active' as EntityStatus,
    description: `Extension: ${extension.name}`,
    sourcePanel,
    tags: ['extension', 'external'],
    properties: {
      kind: 'Extension',
      extensionName: extension.name,
      details: JSON.stringify(extension),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
  };
}

/**
 * Convert View AST to a single entity
 * Note: We store the entire view tree as a property for now
 * In a more sophisticated implementation, we might create entities for each component
 */
function convertViewToEntity(
  panelId: string,
  view: NexusPanelAST['view'],
  sourcePanel: string
): NOGEntity {
  return {
    id: `view:${panelId}`,
    name: `View: ${panelId}`,
    category: 'component' as EntityCategory,
    status: 'active' as EntityStatus,
    description: `View definition for ${panelId}`,
    sourcePanel,
    tags: ['view', 'ui'],
    properties: {
      kind: 'View',
      // Store the entire view tree for reconstruction
      viewTree: JSON.stringify(view.root),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
  };
}

/**
 * Create a relationship between entities
 */
function createRelationship(
  from: string,
  to: string,
  type: string,
  sourcePanel: string
): NOGRelationship {
  const now = Date.now();
  return {
    id: generateRelationshipId(),
    from,
    to,
    type: type as any,
    meta: {},
    properties: {
      sourcePanel,
    },
    createdAt: now,
    updatedAt: now,
  };
}

// =============================================================================
// Write Path: NOG Entities → NXML
// =============================================================================

/**
 * Generate NXML content from NOG entities
 *
 * Note: This is a basic implementation that reconstructs NXML from entities.
 * A more sophisticated approach would preserve original formatting and comments.
 *
 * @param panelId - The panel ID
 * @param entities - All entities for this panel
 * @param options - Generation options
 * @returns NXML content as string
 */
export function generateNXMLFromEntities(
  panelId: string,
  entities: NOGEntity[],
  options: NXMLGenerationOptions = {}
): string {
  const { indent = 2, pretty = true } = options;

  try {
    logger.debug({ panelId, entityCount: entities.length }, 'Generating NXML from entities');

    // Find panel entity
    const panelEntity = entities.find((e) => e.id === `panel:${panelId}`);
    if (!panelEntity) {
      throw new Error(`Panel entity not found for: ${panelId}`);
    }

    // Extract components
    const stateEntities = entities.filter((e) => e.properties.kind === 'State');
    const computedEntities = entities.filter((e) => e.properties.kind === 'Computed');
    const toolEntities = entities.filter((e) => e.properties.kind === 'Tool');
    const lifecycleEntities = entities.filter((e) => e.properties.kind === 'Lifecycle');
    const extensionEntities = entities.filter((e) => e.properties.kind === 'Extension');
    const viewEntity = entities.find((e) => e.properties.kind === 'View');

    // Build NXML
    const lines: string[] = [];
    const ind = ' '.repeat(indent);

    // Panel opening tag
    const meta = panelEntity.properties.metadata as any;
    lines.push(
      `<NexusPanel` +
        (meta?.id ? ` id="${meta.id}"` : '') +
        ` title="${panelEntity.name}"` +
        (panelEntity.description ? ` description="${escapeXML(panelEntity.description)}"` : '') +
        (meta?.version ? ` version="${meta.version}"` : '') +
        (meta?.author ? ` author="${meta.author}"` : '') +
        `>`
    );

    // Data section
    lines.push(ind + '<Data>');

    for (const state of stateEntities) {
      const props = state.properties;
      lines.push(
        ind +
          ind +
          `<State name="${props.stateName}" type="${props.type}"` +
          (props.default !== undefined ? ` default="${escapeXML(String(props.default))}"` : '') +
          ` />`
      );
    }

    for (const computed of computedEntities) {
      const props = computed.properties;
      lines.push(
        ind +
          ind +
          `<Computed name="${props.computedName}" value="${escapeXML(String(props.expression))}" />`
      );
    }

    lines.push(ind + '</Data>');

    // Logic section
    lines.push('');
    lines.push(ind + '<Logic>');

    for (const extension of extensionEntities) {
      const props = extension.properties;
      lines.push(ind + ind + `<Extension name="${props.extensionName}" />`);
    }

    for (const tool of toolEntities) {
      const props = tool.properties;
      lines.push(
        ind +
          ind +
          `<Tool name="${props.toolName}"` +
          (tool.description ? ` description="${escapeXML(tool.description)}"` : '') +
          `>`
      );

      // Add args
      const args = props.args as any[];
      if (args && args.length > 0) {
        for (const arg of args) {
          lines.push(
            ind +
              ind +
              ind +
              `<Arg name="${arg.name}" type="${arg.type}"` +
              (!arg.required ? ` required="false"` : '') +
              (arg.default !== undefined ? ` default="${escapeXML(String(arg.default))}"` : '') +
              ` />`
          );
        }
      }

      // Add handler
      lines.push(ind + ind + ind + `<Handler>`);
      const handlerCode = String(props.handler || '');
      const handlerLines = handlerCode.split('\n');
      for (const line of handlerLines) {
        lines.push(ind + ind + ind + ind + line);
      }
      lines.push(ind + ind + ind + `</Handler>`);

      lines.push(ind + ind + `</Tool>`);
    }

    for (const lifecycle of lifecycleEntities) {
      const props = lifecycle.properties;
      lines.push(ind + ind + `<Lifecycle on="${props.event}">`);
      lines.push(ind + ind + ind + `<Handler>`);
      const handlerCode = String(props.handler || '');
      const handlerLines = handlerCode.split('\n');
      for (const line of handlerLines) {
        lines.push(ind + ind + ind + ind + line);
      }
      lines.push(ind + ind + ind + `</Handler>`);
      lines.push(ind + ind + `</Lifecycle>`);
    }

    lines.push(ind + '</Logic>');

    // View section
    lines.push('');
    lines.push(ind + '<View>');

    if (viewEntity && viewEntity.properties.viewTree) {
      try {
        const viewRoot = JSON.parse(viewEntity.properties.viewTree as string);
        const viewLines = generateViewXML(viewRoot as ViewNode, indent * 2);
        lines.push(...viewLines.map((l) => ind + l));
      } catch (error) {
        logger.warn({ error }, 'Failed to parse view tree, using placeholder');
        lines.push(ind + ind + '<Layout strategy="auto" />');
      }
    } else {
      lines.push(ind + ind + '<Layout strategy="auto" />');
    }

    lines.push(ind + '</View>');

    // Panel closing tag
    lines.push('</NexusPanel>');

    const nxml = lines.join('\n');

    logger.info({ panelId, lines: lines.length }, 'Successfully generated NXML from entities');

    return nxml;
  } catch (error) {
    logger.error({ error, panelId }, 'Failed to generate NXML from entities');
    throw new Error(
      `Failed to generate NXML for ${panelId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generate XML for a view node (recursive)
 */
function generateViewXML(node: ViewNode, indentLevel: number): string[] {
  const lines: string[] = [];
  const ind = ' '.repeat(indentLevel);

  const tag = node.type;
  const attrs = Object.entries(node.props || {})
    .map(([key, value]) => `${key}="${escapeXML(String(value))}"`)
    .join(' ');

  if (node.children && node.children.length > 0) {
    lines.push(`${ind}<${tag}${attrs ? ' ' + attrs : ''}>`);
    for (const child of node.children) {
      lines.push(...generateViewXML(child, indentLevel + 2));
    }
    lines.push(`${ind}</${tag}>`);
  } else {
    lines.push(`${ind}<${tag}${attrs ? ' ' + attrs : ''} />`);
  }

  return lines;
}

/**
 * Escape XML special characters
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
