"""
NXML Lexer - Tokenizes NXML source code.
"""

from dataclasses import dataclass
from enum import Enum
from typing import List, Optional
import re


class TokenType(Enum):
    """Token types for NXML."""

    # XML structure
    TAG_OPEN = "TAG_OPEN"  # <
    TAG_CLOSE = "TAG_CLOSE"  # >
    TAG_END_OPEN = "TAG_END_OPEN"  # </
    TAG_SELF_CLOSE = "TAG_SELF_CLOSE"  # />
    TAG_NAME = "TAG_NAME"  # Element name
    ATTR_NAME = "ATTR_NAME"  # Attribute name
    ATTR_VALUE = "ATTR_VALUE"  # Attribute value
    EQUALS = "EQUALS"  # =

    # Content
    TEXT = "TEXT"  # Text content
    EXPRESSION = "EXPRESSION"  # {$state.x}
    CODE_BLOCK = "CODE_BLOCK"  # Handler code

    # Special
    EOF = "EOF"
    NEWLINE = "NEWLINE"


@dataclass
class SourceLocation:
    """Source code location for error reporting."""

    start_line: int
    start_column: int
    end_line: int
    end_column: int


@dataclass
class Token:
    """A single token from the lexer."""

    type: TokenType
    value: str
    loc: SourceLocation


class LexerError(Exception):
    """Lexer error with location."""

    def __init__(self, message: str, loc: SourceLocation):
        self.message = message
        self.loc = loc
        super().__init__(f"{message} at line {loc.start_line}, column {loc.start_column}")


class Lexer:
    """NXML lexer with context-aware tokenization."""

    def __init__(self, source: str):
        self.source = source
        self.pos = 0
        self.line = 1
        self.column = 1
        self.tokens: List[Token] = []
        self.in_tag = False
        self.in_handler = False

    def tokenize(self) -> List[Token]:
        """Tokenize the entire source."""
        while not self.is_at_end():
            self._scan_token()

        # Add EOF token
        self.tokens.append(
            Token(type=TokenType.EOF, value="", loc=self._current_location())
        )

        return self.tokens

    def _scan_token(self):
        """Scan a single token."""
        char = self.peek()

        # In a tag (parsing attributes)
        if self.in_tag:
            self._skip_whitespace()
            if self.is_at_end():
                return

            char = self.peek()

            # Check for tag close
            if char == "/" and self.peek_next() == ">":
                self.in_tag = False
                self._add_token(TokenType.TAG_SELF_CLOSE, "/>")
                self.advance()
                self.advance()
                return

            if char == ">":
                self.in_tag = False
                self._add_token(TokenType.TAG_CLOSE, ">")
                self.advance()
                return

            # Attribute name
            if char.isalpha() or char == "_":
                self._scan_attribute_name()
                return

            # Equals sign
            if char == "=":
                self._add_token(TokenType.EQUALS, "=")
                self.advance()
                return

            # Attribute value (quoted)
            if char in ('"', "'"):
                self._scan_attribute_value()
                return

            self.advance()
            return

        # Check for opening tag
        if char == "<":
            if self.peek_next() == "/":
                # Closing tag
                self._scan_closing_tag()
                return
            else:
                # Opening tag
                self._scan_opening_tag()
                return

        # Check for expression
        if char == "{" and self.peek_next() == "$":
            self._scan_expression()
            return

        # Check if we're inside a Handler tag (code block)
        if self.in_handler:
            self._scan_code_block()
            return

        # Regular text content
        self._scan_text()

    def _scan_opening_tag(self):
        """Scan opening tag like <NexusPanel>."""
        start_loc = self._current_location()
        self.advance()  # Skip <
        self._add_token(TokenType.TAG_OPEN, "<")

        # Get tag name
        name_start = self.pos
        while not self.is_at_end() and (
            self.peek().isalnum() or self.peek() in ("_", "-", ":")
        ):
            self.advance()

        name = self.source[name_start : self.pos]
        self._add_token(TokenType.TAG_NAME, name)

        # Check if this is a Handler tag (special handling for code blocks)
        if name == "Handler":
            self.in_handler = True

        # Now we're inside the tag (parsing attributes)
        self.in_tag = True

    def _scan_closing_tag(self):
        """Scan closing tag like </NexusPanel>."""
        start_loc = self._current_location()
        self.advance()  # Skip <
        self.advance()  # Skip /
        self._add_token(TokenType.TAG_END_OPEN, "</")

        # Get tag name
        name_start = self.pos
        while not self.is_at_end() and (
            self.peek().isalnum() or self.peek() in ("_", "-", ":")
        ):
            self.advance()

        name = self.source[name_start : self.pos]
        self._add_token(TokenType.TAG_NAME, name)

        # Check if this closes a Handler tag
        if name == "Handler":
            self.in_handler = False

        # Skip whitespace
        self._skip_whitespace()

        # Expect >
        if self.peek() == ">":
            self._add_token(TokenType.TAG_CLOSE, ">")
            self.advance()

    def _scan_attribute_name(self):
        """Scan attribute name."""
        start = self.pos
        while not self.is_at_end() and (
            self.peek().isalnum() or self.peek() in ("_", "-", ":")
        ):
            self.advance()

        name = self.source[start : self.pos]
        self._add_token(TokenType.ATTR_NAME, name)

    def _scan_attribute_value(self):
        """Scan attribute value (quoted string)."""
        quote = self.peek()
        self.advance()  # Skip opening quote

        start = self.pos
        while not self.is_at_end() and self.peek() != quote:
            if self.peek() == "\n":
                self.line += 1
                self.column = 1
            self.advance()

        value = self.source[start : self.pos]
        self._add_token(TokenType.ATTR_VALUE, value)

        if self.peek() == quote:
            self.advance()  # Skip closing quote

    def _scan_text(self):
        """Scan regular text content."""
        start = self.pos
        while not self.is_at_end():
            char = self.peek()

            # Stop at tag or expression
            if char == "<" or (char == "{" and self.peek_next() == "$"):
                break

            if char == "\n":
                self.line += 1
                self.column = 1

            self.advance()

        text = self.source[start : self.pos].strip()
        if text:
            self._add_token(TokenType.TEXT, text)

    def _scan_expression(self):
        """Scan expression like {$state.count}."""
        start = self.pos
        self.advance()  # Skip {

        # Find closing }
        depth = 1
        while not self.is_at_end() and depth > 0:
            if self.peek() == "{":
                depth += 1
            elif self.peek() == "}":
                depth -= 1

            if self.peek() == "\n":
                self.line += 1
                self.column = 1

            self.advance()

        expr = self.source[start : self.pos]
        self._add_token(TokenType.EXPRESSION, expr)

    def _scan_code_block(self):
        """Scan handler code block until </Handler>."""
        start = self.pos

        # Find the closing </Handler> tag
        while not self.is_at_end():
            if (
                self.peek() == "<"
                and self.peek_next() == "/"
                and self.source[self.pos : self.pos + 10] == "</Handler>"
            ):
                break

            if self.peek() == "\n":
                self.line += 1
                self.column = 1

            self.advance()

        code = self.source[start : self.pos].strip()
        if code:
            self._add_token(TokenType.CODE_BLOCK, code)

    def _add_token(self, token_type: TokenType, value: str):
        """Add a token to the list."""
        loc = self._current_location()
        self.tokens.append(Token(type=token_type, value=value, loc=loc))

    def _current_location(self) -> SourceLocation:
        """Get current source location."""
        return SourceLocation(
            start_line=self.line,
            start_column=self.column,
            end_line=self.line,
            end_column=self.column + 1,
        )

    def _skip_whitespace(self):
        """Skip whitespace characters."""
        while not self.is_at_end() and self.peek() in (" ", "\t", "\n", "\r"):
            if self.peek() == "\n":
                self.line += 1
                self.column = 1
            else:
                self.column += 1
            self.pos += 1

    def peek(self) -> str:
        """Peek at current character."""
        if self.is_at_end():
            return "\0"
        return self.source[self.pos]

    def peek_next(self) -> str:
        """Peek at next character."""
        if self.pos + 1 >= len(self.source):
            return "\0"
        return self.source[self.pos + 1]

    def advance(self) -> str:
        """Advance to next character."""
        char = self.source[self.pos]
        self.pos += 1
        self.column += 1
        return char

    def is_at_end(self) -> bool:
        """Check if we've reached the end."""
        return self.pos >= len(self.source)
