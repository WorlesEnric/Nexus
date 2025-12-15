/**
 * @nexus/reactor - NXML Lexer
 * 
 * Tokenizes NXML source into a stream of tokens for the parser.
 */

import type { SourceLocation } from '../core/types';
import { ParseError } from '../core/errors';

// ============================================================================
// Token Types
// ============================================================================

export type TokenType =
  | 'TAG_OPEN'        // <
  | 'TAG_CLOSE'       // >
  | 'TAG_SELF_CLOSE'  // />
  | 'TAG_END_OPEN'    // </
  | 'TAG_NAME'        // NexusPanel, Data, etc.
  | 'ATTR_NAME'       // name, type, etc.
  | 'ATTR_VALUE'      // "value" (includes quotes)
  | 'EQUALS'          // =
  | 'TEXT'            // Text content between tags
  | 'CDATA'           // CDATA content
  | 'COMMENT'         // <!-- comment -->
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  loc: SourceLocation;
}

// ============================================================================
// Lexer State
// ============================================================================

interface LexerState {
  source: string;
  pos: number;
  line: number;
  column: number;
  tokens: Token[];
}

// ============================================================================
// Lexer Implementation
// ============================================================================

/**
 * Tokenize NXML source into tokens
 */
export function tokenize(source: string): Token[] {
  const state: LexerState = {
    source,
    pos: 0,
    line: 1,
    column: 1,
    tokens: [],
  };

  while (!isAtEnd(state)) {
    scanToken(state);
  }

  // Add EOF token
  state.tokens.push({
    type: 'EOF',
    value: '',
    loc: createLocation(state, state.pos),
  });

  return state.tokens;
}

/**
 * Scan the next token
 */
function scanToken(state: LexerState): void {
  skipWhitespace(state);
  
  if (isAtEnd(state)) return;

  const startPos = state.pos;
  const startLine = state.line;
  const startColumn = state.column;

  const char = current(state);

  // Check for comments
  if (char === '<' && lookAhead(state, 1, 3) === '!--') {
    scanComment(state);
    return;
  }

  // Check for CDATA
  if (char === '<' && lookAhead(state, 1, 8) === '![CDATA[') {
    scanCDATA(state);
    return;
  }

  // Check for end tag
  if (char === '<' && peek(state, 1) === '/') {
    advance(state); // <
    advance(state); // /
    addToken(state, 'TAG_END_OPEN', '</', startPos, startLine, startColumn);
    scanTagName(state);
    skipWhitespace(state);
    if (current(state) === '>') {
      const closeStart = state.pos;
      advance(state);
      addToken(state, 'TAG_CLOSE', '>', closeStart, state.line, state.column - 1);
    }
    return;
  }

  // Check for start tag
  if (char === '<') {
    const openStart = state.pos;
    advance(state);
    addToken(state, 'TAG_OPEN', '<', openStart, startLine, startColumn);
    
    skipWhitespace(state);
    scanTagName(state);
    scanAttributes(state);
    
    skipWhitespace(state);
    
    // Check for self-closing or regular close
    if (current(state) === '/' && peek(state, 1) === '>') {
      const selfCloseStart = state.pos;
      advance(state);
      advance(state);
      addToken(state, 'TAG_SELF_CLOSE', '/>', selfCloseStart, state.line, state.column - 2);
    } else if (current(state) === '>') {
      const closeStart = state.pos;
      advance(state);
      addToken(state, 'TAG_CLOSE', '>', closeStart, state.line, state.column - 1);
    } else {
      throw ParseError.unexpectedToken(
        current(state),
        '> or />',
        createLocation(state, state.pos)
      );
    }
    return;
  }

  // Text content
  scanText(state);
}

/**
 * Scan a tag name
 */
function scanTagName(state: LexerState): void {
  skipWhitespace(state);
  
  const startPos = state.pos;
  const startLine = state.line;
  const startColumn = state.column;

  while (!isAtEnd(state) && isNameChar(current(state))) {
    advance(state);
  }

  const value = state.source.slice(startPos, state.pos);
  if (value) {
    addToken(state, 'TAG_NAME', value, startPos, startLine, startColumn);
  }
}

/**
 * Scan attributes
 */
function scanAttributes(state: LexerState): void {
  while (!isAtEnd(state)) {
    skipWhitespace(state);
    
    const char = current(state);
    
    // End of attributes
    if (char === '>' || char === '/') {
      break;
    }

    // Attribute name
    const nameStartPos = state.pos;
    const nameStartLine = state.line;
    const nameStartColumn = state.column;

    while (!isAtEnd(state) && isNameChar(current(state))) {
      advance(state);
    }

    const attrName = state.source.slice(nameStartPos, state.pos);
    if (!attrName) break;

    addToken(state, 'ATTR_NAME', attrName, nameStartPos, nameStartLine, nameStartColumn);

    skipWhitespace(state);

    // Equals sign
    if (current(state) === '=') {
      const eqPos = state.pos;
      advance(state);
      addToken(state, 'EQUALS', '=', eqPos, state.line, state.column - 1);
      
      skipWhitespace(state);

      // Attribute value
      scanAttributeValue(state);
    }
  }
}

/**
 * Scan an attribute value (quoted string)
 */
function scanAttributeValue(state: LexerState): void {
  const startPos = state.pos;
  const startLine = state.line;
  const startColumn = state.column;

  const quote = current(state);
  if (quote !== '"' && quote !== "'") {
    throw ParseError.unexpectedToken(quote, 'quoted string', createLocation(state, state.pos));
  }

  advance(state); // Opening quote

  while (!isAtEnd(state) && current(state) !== quote) {
    if (current(state) === '\\' && peek(state, 1) === quote) {
      advance(state); // Skip escape character
    }
    advance(state);
  }

  if (isAtEnd(state)) {
    throw new ParseError('Unterminated string', { loc: createLocation(state, startPos) });
  }

  advance(state); // Closing quote

  const value = state.source.slice(startPos, state.pos);
  addToken(state, 'ATTR_VALUE', value, startPos, startLine, startColumn);
}

/**
 * Scan text content between tags
 */
function scanText(state: LexerState): void {
  const startPos = state.pos;
  const startLine = state.line;
  const startColumn = state.column;

  while (!isAtEnd(state) && current(state) !== '<') {
    advance(state);
  }

  const value = state.source.slice(startPos, state.pos).trim();
  if (value) {
    addToken(state, 'TEXT', value, startPos, startLine, startColumn);
  }
}

/**
 * Scan a comment: <!-- ... -->
 */
function scanComment(state: LexerState): void {
  const startPos = state.pos;
  const startLine = state.line;
  const startColumn = state.column;

  // Skip <!--
  for (let i = 0; i < 4; i++) advance(state);

  while (!isAtEnd(state)) {
    if (current(state) === '-' && lookAhead(state, 0, 3) === '-->') {
      break;
    }
    advance(state);
  }

  // Skip -->
  for (let i = 0; i < 3 && !isAtEnd(state); i++) advance(state);

  const value = state.source.slice(startPos, state.pos);
  addToken(state, 'COMMENT', value, startPos, startLine, startColumn);
}

/**
 * Scan CDATA: <![CDATA[ ... ]]>
 */
function scanCDATA(state: LexerState): void {
  const startPos = state.pos;
  const startLine = state.line;
  const startColumn = state.column;

  // Skip <![CDATA[
  for (let i = 0; i < 9; i++) advance(state);

  const contentStart = state.pos;

  while (!isAtEnd(state)) {
    if (current(state) === ']' && lookAhead(state, 0, 3) === ']]>') {
      break;
    }
    advance(state);
  }

  const content = state.source.slice(contentStart, state.pos);

  // Skip ]]>
  for (let i = 0; i < 3 && !isAtEnd(state); i++) advance(state);

  addToken(state, 'CDATA', content, startPos, startLine, startColumn);
}

// ============================================================================
// Helper Functions
// ============================================================================

function isAtEnd(state: LexerState): boolean {
  return state.pos >= state.source.length;
}

function current(state: LexerState): string {
  return state.source[state.pos] ?? '';
}

function peek(state: LexerState, offset: number): string {
  return state.source[state.pos + offset] ?? '';
}

function lookAhead(state: LexerState, start: number, length: number): string {
  return state.source.slice(state.pos + start, state.pos + start + length);
}

function advance(state: LexerState): string {
  const char = current(state);
  state.pos++;
  
  if (char === '\n') {
    state.line++;
    state.column = 1;
  } else {
    state.column++;
  }
  
  return char;
}

function skipWhitespace(state: LexerState): void {
  while (!isAtEnd(state) && /\s/.test(current(state))) {
    advance(state);
  }
}

function isNameChar(char: string): boolean {
  return /[a-zA-Z0-9_$-]/.test(char);
}

function createLocation(state: LexerState, startPos: number): SourceLocation {
  // Calculate start line/column from startPos
  let line = 1;
  let column = 1;
  
  for (let i = 0; i < startPos && i < state.source.length; i++) {
    if (state.source[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  
  return {
    startLine: line,
    startColumn: column,
    endLine: state.line,
    endColumn: state.column,
  };
}

function addToken(
  state: LexerState,
  type: TokenType,
  value: string,
  _startPos: number,
  startLine: number,
  startColumn: number
): void {
  state.tokens.push({
    type,
    value,
    loc: {
      startLine,
      startColumn,
      endLine: state.line,
      endColumn: state.column,
    },
  });
}

/**
 * Get token type name for error messages
 */
export function getTokenTypeName(type: TokenType): string {
  const names: Record<TokenType, string> = {
    TAG_OPEN: 'opening tag <',
    TAG_CLOSE: 'closing bracket >',
    TAG_SELF_CLOSE: 'self-closing />',
    TAG_END_OPEN: 'end tag </',
    TAG_NAME: 'tag name',
    ATTR_NAME: 'attribute name',
    ATTR_VALUE: 'attribute value',
    EQUALS: 'equals sign',
    TEXT: 'text content',
    CDATA: 'CDATA section',
    COMMENT: 'comment',
    EOF: 'end of file',
  };
  return names[type] ?? type;
}