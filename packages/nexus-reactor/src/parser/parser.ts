/**
 * @nexus/reactor - NXML Parser
 * 
 * Parses NXML tokens into a NexusPanelAST structure.
 */

import type { Token, TokenType } from './lexer';
import { tokenize, getTokenTypeName } from './lexer';
import { ParseError } from '../core/errors';
import type {
  NexusPanelAST,
  PanelMeta,
  DataAST,
  LogicAST,
  ViewAST,
  StateNode,
  ComputedNode,
  ToolNode,
  ArgNode,
  HandlerNode,
  LifecycleNode,
  ExtensionNode,
  ViewNode,
  SourceLocation,
  NXMLPrimitiveType,
  LifecycleEvent,
} from '../core/types';
import { parseDefaultValue } from '../utils/coercion';

interface ParserState {
  tokens: Token[];
  current: number;
}

export function parse(source: string): NexusPanelAST {
  const tokens = tokenize(source);
  const state: ParserState = { tokens, current: 0 };
  return parseNexusPanel(state);
}

function parseNexusPanel(state: ParserState): NexusPanelAST {
  expect(state, 'TAG_OPEN');
  const tagName = expect(state, 'TAG_NAME');
  
  if (tagName.value !== 'NexusPanel') {
    throw new ParseError(`Root element must be <NexusPanel>, got <${tagName.value}>`, { loc: tagName.loc });
  }

  const meta = parsePanelMeta(state);
  const closeToken = peek(state);
  if (closeToken.type === 'TAG_SELF_CLOSE') {
    throw new ParseError('NexusPanel cannot be self-closing', { loc: closeToken.loc });
  }
  expect(state, 'TAG_CLOSE');

  let data: DataAST | undefined;
  let logic: LogicAST | undefined;
  let view: ViewAST | undefined;

  while (!isAtEnd(state) && !check(state, 'TAG_END_OPEN')) {
    if (check(state, 'TAG_OPEN')) {
      advance(state);
      const childTag = expect(state, 'TAG_NAME');
      
      switch (childTag.value) {
        case 'Data':
          if (data) throw new ParseError('Duplicate <Data> section', { loc: childTag.loc });
          data = parseDataSection(state, childTag.loc);
          break;
        case 'Logic':
          if (logic) throw new ParseError('Duplicate <Logic> section', { loc: childTag.loc });
          logic = parseLogicSection(state, childTag.loc);
          break;
        case 'View':
          if (view) throw new ParseError('Duplicate <View> section', { loc: childTag.loc });
          view = parseViewSection(state, childTag.loc);
          break;
        default:
          throw new ParseError(`Unknown section <${childTag.value}> in NexusPanel`, { loc: childTag.loc });
      }
    } else {
      advance(state);
    }
  }

  expect(state, 'TAG_END_OPEN');
  const endTagName = expect(state, 'TAG_NAME');
  if (endTagName.value !== 'NexusPanel') {
    throw new ParseError(`Expected </NexusPanel>, got </${endTagName.value}>`, { loc: endTagName.loc });
  }
  expect(state, 'TAG_CLOSE');

  return {
    kind: 'NexusPanel',
    meta,
    data: data ?? { kind: 'Data', states: [], computed: [] },
    logic: logic ?? { kind: 'Logic', extensions: [], tools: [], lifecycles: [] },
    view: view ?? { kind: 'View', root: { type: 'Layout', props: {}, children: [] } },
  };
}

function parsePanelMeta(state: ParserState): PanelMeta {
  const attrs = parseAttributes(state);
  return {
    title: attrs.title as string ?? 'Untitled Panel',
    description: attrs.description as string,
    id: attrs.id as string,
    version: attrs.version as string,
    author: attrs.author as string,
    tags: attrs.tags ? String(attrs.tags).split(',').map(t => t.trim()) : undefined,
  };
}

function parseDataSection(state: ParserState, startLoc: SourceLocation): DataAST {
  const states: StateNode[] = [];
  const computed: ComputedNode[] = [];

  skipAttributes(state);
  if (check(state, 'TAG_SELF_CLOSE')) {
    advance(state);
    return { kind: 'Data', states, computed, loc: startLoc };
  }
  expect(state, 'TAG_CLOSE');

  while (!isAtEnd(state) && !check(state, 'TAG_END_OPEN')) {
    if (check(state, 'TAG_OPEN')) {
      advance(state);
      const childTag = expect(state, 'TAG_NAME');
      switch (childTag.value) {
        case 'State':
          states.push(parseStateNode(state, childTag.loc));
          break;
        case 'Computed':
          computed.push(parseComputedNode(state, childTag.loc));
          break;
        default:
          throw new ParseError(`Unknown element <${childTag.value}> in Data section`, { loc: childTag.loc });
      }
    } else {
      advance(state);
    }
  }
  expectClosingTag(state, 'Data');
  return { kind: 'Data', states, computed, loc: startLoc };
}

function parseStateNode(state: ParserState, loc: SourceLocation): StateNode {
  const attrs = parseAttributes(state);
  expectSelfCloseOrEmpty(state, 'State');
  const name = attrs.name as string;
  const type = attrs.type as NXMLPrimitiveType ?? 'string';
  const defaultValue = parseDefaultValue(attrs.default as string, type);
  if (!name) throw new ParseError('State must have a name attribute', { loc });
  return { kind: 'State', name, type, default: defaultValue, loc };
}

function parseComputedNode(state: ParserState, loc: SourceLocation): ComputedNode {
  const attrs = parseAttributes(state);
  expectSelfCloseOrEmpty(state, 'Computed');
  const name = attrs.name as string;
  const value = attrs.value as string;
  if (!name) throw new ParseError('Computed must have a name attribute', { loc });
  if (!value) throw new ParseError('Computed must have a value attribute', { loc });
  return { kind: 'Computed', name, value, loc };
}

function parseLogicSection(state: ParserState, startLoc: SourceLocation): LogicAST {
  const extensions: ExtensionNode[] = [];
  const tools: ToolNode[] = [];
  const lifecycles: LifecycleNode[] = [];

  skipAttributes(state);
  if (check(state, 'TAG_SELF_CLOSE')) {
    advance(state);
    return { kind: 'Logic', extensions, tools, lifecycles, loc: startLoc };
  }
  expect(state, 'TAG_CLOSE');

  while (!isAtEnd(state) && !check(state, 'TAG_END_OPEN')) {
    if (check(state, 'TAG_OPEN')) {
      advance(state);
      const childTag = expect(state, 'TAG_NAME');
      switch (childTag.value) {
        case 'Extension':
          extensions.push(parseExtensionNode(state, childTag.loc));
          break;
        case 'Tool':
          tools.push(parseToolNode(state, childTag.loc));
          break;
        case 'Lifecycle':
          lifecycles.push(parseLifecycleNode(state, childTag.loc));
          break;
        default:
          throw new ParseError(`Unknown element <${childTag.value}> in Logic section`, { loc: childTag.loc });
      }
    } else {
      advance(state);
    }
  }
  expectClosingTag(state, 'Logic');
  return { kind: 'Logic', extensions, tools, lifecycles, loc: startLoc };
}

function parseExtensionNode(state: ParserState, loc: SourceLocation): ExtensionNode {
  const attrs = parseAttributes(state);
  expectSelfCloseOrEmpty(state, 'Extension');
  const name = attrs.name as string;
  const alias = (attrs.alias as string) ?? name.split('.').pop() ?? name;
  const source = attrs.source as string;
  if (!name) throw new ParseError('Extension must have a name attribute', { loc });
  return { kind: 'Extension', name, alias, source, loc };
}

function parseToolNode(state: ParserState, loc: SourceLocation): ToolNode {
  const attrs = parseAttributes(state);
  const name = attrs.name as string;
  const description = attrs.description as string;
  if (!name) throw new ParseError('Tool must have a name attribute', { loc });

  if (check(state, 'TAG_SELF_CLOSE')) {
    advance(state);
    throw new ParseError('Tool must have a Handler child', { loc });
  }
  expect(state, 'TAG_CLOSE');

  const args: ArgNode[] = [];
  let handler: HandlerNode | undefined;

  while (!isAtEnd(state) && !check(state, 'TAG_END_OPEN')) {
    if (check(state, 'TAG_OPEN')) {
      advance(state);
      const childTag = expect(state, 'TAG_NAME');
      switch (childTag.value) {
        case 'Arg':
          args.push(parseArgNode(state, childTag.loc));
          break;
        case 'Handler':
          handler = parseHandlerNode(state, childTag.loc);
          break;
        default:
          throw new ParseError(`Unknown element <${childTag.value}> in Tool`, { loc: childTag.loc });
      }
    } else {
      advance(state);
    }
  }

  if (!handler) throw new ParseError('Tool must have a Handler child', { loc });
  expectClosingTag(state, 'Tool');
  return { kind: 'Tool', name, description, args, handler, loc };
}

function parseArgNode(state: ParserState, loc: SourceLocation): ArgNode {
  const attrs = parseAttributes(state);
  expectSelfCloseOrEmpty(state, 'Arg');
  const name = attrs.name as string;
  const type = attrs.type as NXMLPrimitiveType ?? 'string';
  const required = attrs.required !== 'false';
  const defaultValue = attrs.default;
  const description = attrs.description as string;
  if (!name) throw new ParseError('Arg must have a name attribute', { loc });
  return { kind: 'Arg', name, type, required, default: defaultValue, description, loc };
}

function parseHandlerNode(state: ParserState, loc: SourceLocation): HandlerNode {
  skipAttributes(state);
  if (check(state, 'TAG_SELF_CLOSE')) {
    advance(state);
    return { kind: 'Handler', code: '', loc };
  }
  expect(state, 'TAG_CLOSE');

  let code = '';
  while (!isAtEnd(state) && !check(state, 'TAG_END_OPEN')) {
    const token = peek(state);
    if (token.type === 'TEXT' || token.type === 'CDATA') {
      code += token.value;
    }
    advance(state);
  }
  expectClosingTag(state, 'Handler');
  const isAsync = /\bawait\b/.test(code);
  return { kind: 'Handler', code: code.trim(), isAsync, loc };
}

function parseLifecycleNode(state: ParserState, loc: SourceLocation): LifecycleNode {
  const attrs = parseAttributes(state);
  const on = attrs.on as LifecycleEvent;
  if (on !== 'mount' && on !== 'unmount') {
    throw new ParseError(`Lifecycle "on" attribute must be "mount" or "unmount", got "${on}"`, { loc });
  }

  if (check(state, 'TAG_SELF_CLOSE')) {
    advance(state);
    throw new ParseError('Lifecycle must have a Handler child', { loc });
  }
  expect(state, 'TAG_CLOSE');

  let handler: HandlerNode | undefined;
  while (!isAtEnd(state) && !check(state, 'TAG_END_OPEN')) {
    if (check(state, 'TAG_OPEN')) {
      advance(state);
      const childTag = expect(state, 'TAG_NAME');
      if (childTag.value === 'Handler') {
        handler = parseHandlerNode(state, childTag.loc);
      } else {
        throw new ParseError(`Lifecycle can only contain Handler, got <${childTag.value}>`, { loc: childTag.loc });
      }
    } else {
      advance(state);
    }
  }
  if (!handler) throw new ParseError('Lifecycle must have a Handler child', { loc });
  expectClosingTag(state, 'Lifecycle');
  return { kind: 'Lifecycle', on, handler, loc };
}

function parseViewSection(state: ParserState, startLoc: SourceLocation): ViewAST {
  skipAttributes(state);
  if (check(state, 'TAG_SELF_CLOSE')) {
    advance(state);
    return { kind: 'View', root: { type: 'Layout', props: {}, children: [] }, loc: startLoc };
  }
  expect(state, 'TAG_CLOSE');

  let root: ViewNode | undefined;
  while (!isAtEnd(state) && !check(state, 'TAG_END_OPEN')) {
    if (check(state, 'TAG_OPEN')) {
      if (root) throw new ParseError('View can only have one root element', { loc: peek(state).loc });
      root = parseViewNode(state);
    } else {
      advance(state);
    }
  }
  expectClosingTag(state, 'View');
  return { kind: 'View', root: root ?? { type: 'Layout', props: {}, children: [] }, loc: startLoc };
}

function parseViewNode(state: ParserState): ViewNode {
  expect(state, 'TAG_OPEN');
  const tagToken = expect(state, 'TAG_NAME');
  const tagName = tagToken.value;
  const attrs = parseAttributes(state);

  // Special handling for CustomComponent with bind: and on: prefixes
  let props: Record<string, unknown>;
  let id: string | undefined;

  if (tagName === 'CustomComponent') {
    const bindings: Record<string, string> = {};
    const events: Record<string, string> = {};
    const regularProps: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('bind:')) {
        // bind:document="$state.document" -> bindings.document = "$state.document"
        const propName = key.slice(5); // Remove 'bind:' prefix
        bindings[propName] = value;
      } else if (key.startsWith('on:')) {
        // on:change="(doc) => { ... }" -> events.change = "(doc) => { ... }"
        const eventName = key.slice(3); // Remove 'on:' prefix
        events[eventName] = value;
      } else {
        regularProps[key] = value;
      }
    }

    id = regularProps.id as string | undefined;
    props = {
      ...regularProps,
      ...(Object.keys(bindings).length > 0 && { bindings }),
      ...(Object.keys(events).length > 0 && { events }),
    };
  } else {
    // Standard component handling
    props = { ...attrs };
    id = props.id as string | undefined;
  }

  if (check(state, 'TAG_SELF_CLOSE')) {
    advance(state);
    return { type: tagName, id, props, children: [], loc: tagToken.loc };
  }
  expect(state, 'TAG_CLOSE');

  const children: ViewNode[] = [];
  while (!isAtEnd(state) && !check(state, 'TAG_END_OPEN')) {
    if (check(state, 'TAG_OPEN')) {
      children.push(parseViewNode(state));
    } else {
      advance(state);
    }
  }
  expectClosingTag(state, tagName);
  return { type: tagName, id, props, children, loc: tagToken.loc };
}

// Helper functions
function parseAttributes(state: ParserState): Record<string, string> {
  const attrs: Record<string, string> = {};
  while (check(state, 'ATTR_NAME')) {
    const nameToken = advance(state);
    if (check(state, 'EQUALS')) {
      advance(state);
      if (check(state, 'ATTR_VALUE')) {
        const valueToken = advance(state);
        let value = valueToken.value;
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        attrs[nameToken.value] = value;
      }
    } else {
      attrs[nameToken.value] = 'true';
    }
  }
  return attrs;
}

function skipAttributes(state: ParserState): void {
  while (check(state, 'ATTR_NAME')) {
    advance(state);
    if (check(state, 'EQUALS')) {
      advance(state);
      if (check(state, 'ATTR_VALUE')) advance(state);
    }
  }
}

function expectClosingTag(state: ParserState, tagName: string): void {
  expect(state, 'TAG_END_OPEN');
  const endTag = expect(state, 'TAG_NAME');
  if (endTag.value !== tagName) {
    throw new ParseError(`Expected </${tagName}>, got </${endTag.value}>`, { loc: endTag.loc });
  }
  expect(state, 'TAG_CLOSE');
}

function expectSelfCloseOrEmpty(state: ParserState, tagName: string): void {
  if (check(state, 'TAG_SELF_CLOSE')) {
    advance(state);
  } else if (check(state, 'TAG_CLOSE')) {
    advance(state);
    expectClosingTag(state, tagName);
  }
}

function peek(state: ParserState): Token {
  return state.tokens[state.current] ?? { type: 'EOF', value: '', loc: { startLine: 0, startColumn: 0, endLine: 0, endColumn: 0 } };
}

function check(state: ParserState, type: TokenType): boolean {
  return peek(state).type === type;
}

function advance(state: ParserState): Token {
  if (!isAtEnd(state)) state.current++;
  return state.tokens[state.current - 1];
}

function expect(state: ParserState, type: TokenType): Token {
  const token = peek(state);
  if (token.type !== type) {
    throw ParseError.unexpectedToken(token.value || getTokenTypeName(token.type), getTokenTypeName(type), token.loc);
  }
  return advance(state);
}

function isAtEnd(state: ParserState): boolean {
  return peek(state).type === 'EOF';
}