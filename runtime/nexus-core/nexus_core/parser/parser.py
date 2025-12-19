"""
NXML Parser - Builds AST from tokens.
"""

from typing import List, Dict, Any, Optional
from nexus_protocol.ast import (
    NexusPanelAST,
    PanelMeta,
    DataAST,
    LogicAST,
    ViewAST,
    StateNode,
    ComputedNode,
    ToolNode,
    HandlerNode,
    LifecycleNode,
    ExtensionNode,
    ArgNode,
    ViewNode,
    SourceLocation,
    NXMLPrimitiveType,
)
from .lexer import Lexer, Token, TokenType
from datetime import datetime


class ParseError(Exception):
    """Parse error with location."""

    def __init__(self, message: str, token: Optional[Token] = None):
        self.message = message
        self.token = token
        if token:
            super().__init__(
                f"{message} at line {token.loc.start_line}, column {token.loc.start_column}"
            )
        else:
            super().__init__(message)


class Parser:
    """NXML parser that builds Pydantic AST from tokens."""

    def __init__(self, source: str):
        self.source = source
        self.lexer = Lexer(source)
        self.tokens = self.lexer.tokenize()
        self.current = 0

    def parse(self) -> NexusPanelAST:
        """Parse NXML into AST."""
        return self._parse_nexus_panel()

    def _parse_nexus_panel(self) -> NexusPanelAST:
        """Parse root <NexusPanel> element."""
        # Expect <NexusPanel>
        self._expect(TokenType.TAG_OPEN)
        tag_name_token = self._expect(TokenType.TAG_NAME)

        if tag_name_token.value != "NexusPanel":
            raise ParseError(
                f"Root element must be <NexusPanel>, got <{tag_name_token.value}>",
                tag_name_token,
            )

        # Parse attributes (panel metadata)
        meta = self._parse_panel_meta()

        # Expect >
        self._expect(TokenType.TAG_CLOSE)

        # Parse sections
        data: Optional[DataAST] = None
        logic: Optional[LogicAST] = None
        view: Optional[ViewAST] = None

        while not self._check(TokenType.TAG_END_OPEN):
            section_name = self._peek_section_name()

            if section_name == "Data":
                data = self._parse_data_section()
            elif section_name == "Logic":
                logic = self._parse_logic_section()
            elif section_name == "View":
                view = self._parse_view_section()
            else:
                raise ParseError(f"Unknown section: {section_name}")

        # Expect </NexusPanel>
        self._expect(TokenType.TAG_END_OPEN)
        closing_tag = self._expect(TokenType.TAG_NAME)
        if closing_tag.value != "NexusPanel":
            raise ParseError(f"Expected </NexusPanel>, got </{closing_tag.value}>")
        self._expect(TokenType.TAG_CLOSE)

        # Build AST with defaults for missing sections
        return NexusPanelAST(
            kind="NexusPanel",
            meta=meta,
            data=data or DataAST(kind="Data", states=[], computed=[]),
            logic=logic
            or LogicAST(kind="Logic", extensions=[], tools=[], lifecycles=[]),
            view=view
            or ViewAST(
                kind="View",
                root=ViewNode(type="Layout", props={}, children=[]),
            ),
        )

    def _parse_panel_meta(self) -> PanelMeta:
        """Parse panel metadata from attributes."""
        attrs = self._parse_attributes()

        return PanelMeta(
            id=attrs.get("id", ""),
            title=attrs.get("title"),
            type=attrs.get("type", "custom"),
            version=attrs.get("version", "1.0.0"),
            description=attrs.get("description"),
            author=attrs.get("author"),
            tags=attrs.get("tags", "").split(",") if attrs.get("tags") else [],
            icon=attrs.get("icon"),
        )

    def _parse_data_section(self) -> DataAST:
        """Parse <Data> section."""
        self._consume_tag_open("Data")

        states: List[StateNode] = []
        computed: List[ComputedNode] = []

        while not self._check_closing_tag("Data"):
            tag_name = self._peek_section_name()

            if tag_name == "State":
                states.append(self._parse_state_node())
            elif tag_name == "Computed":
                computed.append(self._parse_computed_node())
            else:
                # Skip unknown tags
                self._skip_tag()

        self._consume_tag_close("Data")

        return DataAST(kind="Data", states=states, computed=computed)

    def _parse_state_node(self) -> StateNode:
        """Parse <State> node."""
        self._expect(TokenType.TAG_OPEN)
        self._expect_tag_name("State")

        attrs = self._parse_attributes()

        # Self-closing or has content
        if self._check(TokenType.TAG_SELF_CLOSE):
            self._advance()
        else:
            self._expect(TokenType.TAG_CLOSE)
            # Skip any content
            while not self._check_closing_tag("State"):
                self._advance()
            self._consume_tag_close("State")

        return StateNode(
            kind="State",
            name=attrs.get("name", ""),
            type=NXMLPrimitiveType(attrs.get("type", "any")),
            default=self._parse_default_value(attrs.get("default")),
            description=attrs.get("description"),
        )

    def _parse_computed_node(self) -> ComputedNode:
        """Parse <Computed> node."""
        self._expect(TokenType.TAG_OPEN)
        self._expect_tag_name("Computed")

        attrs = self._parse_attributes()

        if self._check(TokenType.TAG_SELF_CLOSE):
            self._advance()
        else:
            self._expect(TokenType.TAG_CLOSE)
            while not self._check_closing_tag("Computed"):
                self._advance()
            self._consume_tag_close("Computed")

        return ComputedNode(
            kind="Computed",
            name=attrs.get("name", ""),
            value=attrs.get("value", ""),
            type=NXMLPrimitiveType(attrs.get("type", "any"))
            if attrs.get("type")
            else None,
            description=attrs.get("description"),
        )

    def _parse_logic_section(self) -> LogicAST:
        """Parse <Logic> section."""
        self._consume_tag_open("Logic")

        extensions: List[ExtensionNode] = []
        tools: List[ToolNode] = []
        lifecycles: List[LifecycleNode] = []

        while not self._check_closing_tag("Logic"):
            tag_name = self._peek_section_name()

            if tag_name == "Extension":
                extensions.append(self._parse_extension_node())
            elif tag_name == "Tool":
                tools.append(self._parse_tool_node())
            elif tag_name == "Lifecycle":
                lifecycles.append(self._parse_lifecycle_node())
            else:
                self._skip_tag()

        self._consume_tag_close("Logic")

        return LogicAST(
            kind="Logic", extensions=extensions, tools=tools, lifecycles=lifecycles
        )

    def _parse_extension_node(self) -> ExtensionNode:
        """Parse <Extension> node."""
        self._expect(TokenType.TAG_OPEN)
        self._expect_tag_name("Extension")

        attrs = self._parse_attributes()

        if self._check(TokenType.TAG_SELF_CLOSE):
            self._advance()
        else:
            self._expect(TokenType.TAG_CLOSE)
            while not self._check_closing_tag("Extension"):
                self._advance()
            self._consume_tag_close("Extension")

        return ExtensionNode(kind="Extension", name=attrs.get("name", ""), config={})

    def _parse_tool_node(self) -> ToolNode:
        """Parse <Tool> node."""
        self._consume_tag_open("Tool")
        attrs = self._parse_attributes()

        # Parse child elements
        args: List[ArgNode] = []
        handler: Optional[HandlerNode] = None

        while not self._check_closing_tag("Tool"):
            tag_name = self._peek_section_name()

            if tag_name == "Arg":
                args.append(self._parse_arg_node())
            elif tag_name == "Handler":
                handler = self._parse_handler_node()
            else:
                self._skip_tag()

        self._consume_tag_close("Tool")

        if not handler:
            raise ParseError("Tool must have a <Handler>")

        return ToolNode(
            kind="Tool",
            name=attrs.get("name", ""),
            args=args,
            handler=handler,
            description=attrs.get("description"),
            icon=attrs.get("icon"),
        )

    def _parse_arg_node(self) -> ArgNode:
        """Parse <Arg> node."""
        self._expect(TokenType.TAG_OPEN)
        self._expect_tag_name("Arg")

        attrs = self._parse_attributes()

        if self._check(TokenType.TAG_SELF_CLOSE):
            self._advance()
        else:
            self._expect(TokenType.TAG_CLOSE)
            while not self._check_closing_tag("Arg"):
                self._advance()
            self._consume_tag_close("Arg")

        return ArgNode(
            name=attrs.get("name", ""),
            type=NXMLPrimitiveType(attrs.get("type", "any")),
            default=self._parse_default_value(attrs.get("default")),
            required=attrs.get("required", "true").lower() == "true",
            description=attrs.get("description"),
        )

    def _parse_handler_node(self) -> HandlerNode:
        """Parse <Handler> node."""
        self._consume_tag_open("Handler")
        attrs = self._parse_attributes()

        # Get handler code (CODE_BLOCK token)
        code = ""
        if self._check(TokenType.CODE_BLOCK):
            code_token = self._advance()
            code = code_token.value

        self._consume_tag_close("Handler")

        capabilities = (
            attrs.get("capabilities", "").split(",")
            if attrs.get("capabilities")
            else []
        )

        return HandlerNode(
            kind="Handler",
            code=code,
            capabilities=[c.strip() for c in capabilities if c.strip()],
            timeout_ms=int(attrs.get("timeout_ms", "5000")),
        )

    def _parse_lifecycle_node(self) -> LifecycleNode:
        """Parse <Lifecycle> node."""
        self._consume_tag_open("Lifecycle")
        attrs = self._parse_attributes()

        handler: Optional[HandlerNode] = None

        while not self._check_closing_tag("Lifecycle"):
            tag_name = self._peek_section_name()

            if tag_name == "Handler":
                handler = self._parse_handler_node()
            else:
                self._skip_tag()

        self._consume_tag_close("Lifecycle")

        if not handler:
            raise ParseError("Lifecycle must have a <Handler>")

        return LifecycleNode(
            kind="Lifecycle", event=attrs.get("on", ""), handler=handler
        )

    def _parse_view_section(self) -> ViewAST:
        """Parse <View> section."""
        self._consume_tag_open("View")

        # Parse root view node
        root = self._parse_view_node()

        self._consume_tag_close("View")

        return ViewAST(kind="View", root=root)

    def _parse_view_node(self) -> ViewNode:
        """Parse a view component node recursively."""
        self._expect(TokenType.TAG_OPEN)
        tag_name_token = self._expect(TokenType.TAG_NAME)
        component_type = tag_name_token.value

        attrs = self._parse_attributes()

        # Check for self-closing
        if self._check(TokenType.TAG_SELF_CLOSE):
            self._advance()
            return ViewNode(type=component_type, props=attrs, children=[])

        self._expect(TokenType.TAG_CLOSE)

        # Parse children
        children: List[ViewNode] = []
        while not self._check_closing_tag(component_type):
            # Check if next is a tag
            if self._check(TokenType.TAG_OPEN):
                children.append(self._parse_view_node())
            elif self._check(TokenType.TEXT):
                # Text node - add as Text component
                text_token = self._advance()
                children.append(
                    ViewNode(
                        type="Text", props={"value": text_token.value}, children=[]
                    )
                )
            else:
                self._advance()

        self._consume_tag_close(component_type)

        return ViewNode(type=component_type, props=attrs, children=children)

    # Helper methods

    def _parse_attributes(self) -> Dict[str, str]:
        """Parse attributes and return as dict."""
        attrs: Dict[str, str] = {}

        while self._check(TokenType.ATTR_NAME):
            name_token = self._advance()
            name = name_token.value

            if self._check(TokenType.EQUALS):
                self._advance()
                if self._check(TokenType.ATTR_VALUE):
                    value_token = self._advance()
                    attrs[name] = value_token.value
                else:
                    attrs[name] = "true"
            else:
                attrs[name] = "true"

        return attrs

    def _parse_default_value(self, value_str: Optional[str]) -> Any:
        """Parse default value string to appropriate type."""
        if value_str is None:
            return None

        # Try to parse as number
        try:
            if "." in value_str:
                return float(value_str)
            return int(value_str)
        except ValueError:
            pass

        # Check boolean
        if value_str.lower() in ("true", "false"):
            return value_str.lower() == "true"

        # Return as string
        return value_str

    def _consume_tag_open(self, expected_name: str):
        """Consume opening tag."""
        self._expect(TokenType.TAG_OPEN)
        self._expect_tag_name(expected_name)
        self._parse_attributes()  # Parse and discard attributes
        self._expect(TokenType.TAG_CLOSE)

    def _consume_tag_close(self, expected_name: str):
        """Consume closing tag."""
        self._expect(TokenType.TAG_END_OPEN)
        self._expect_tag_name(expected_name)
        self._expect(TokenType.TAG_CLOSE)

    def _skip_tag(self):
        """Skip an entire tag and its contents."""
        if self._check(TokenType.TAG_OPEN):
            self._advance()
            tag_name_token = self._expect(TokenType.TAG_NAME)
            tag_name = tag_name_token.value

            # Skip attributes
            while self._check(TokenType.ATTR_NAME):
                self._advance()
                if self._check(TokenType.EQUALS):
                    self._advance()
                if self._check(TokenType.ATTR_VALUE):
                    self._advance()

            # Self-closing?
            if self._check(TokenType.TAG_SELF_CLOSE):
                self._advance()
                return

            self._expect(TokenType.TAG_CLOSE)

            # Skip content until closing tag
            depth = 1
            while depth > 0 and not self._is_at_end():
                if self._check(TokenType.TAG_OPEN):
                    self._advance()
                    self._advance()  # Tag name
                    depth += 1
                elif self._check(TokenType.TAG_END_OPEN):
                    self._advance()
                    closing_name = self._advance()
                    if closing_name.value == tag_name:
                        depth -= 1
                    self._expect(TokenType.TAG_CLOSE)
                else:
                    self._advance()

    def _peek_section_name(self) -> str:
        """Peek at the next section name."""
        if self._check(TokenType.TAG_OPEN):
            # Look ahead
            next_pos = self.current + 1
            if next_pos < len(self.tokens):
                next_token = self.tokens[next_pos]
                if next_token.type == TokenType.TAG_NAME:
                    return next_token.value
        return ""

    def _check_closing_tag(self, tag_name: str) -> bool:
        """Check if next tokens are a closing tag."""
        if not self._check(TokenType.TAG_END_OPEN):
            return False

        # Look ahead for tag name
        next_pos = self.current + 1
        if next_pos < len(self.tokens):
            next_token = self.tokens[next_pos]
            if next_token.type == TokenType.TAG_NAME and next_token.value == tag_name:
                return True

        return False

    def _expect_tag_name(self, expected: str) -> Token:
        """Expect specific tag name."""
        token = self._expect(TokenType.TAG_NAME)
        if token.value != expected:
            raise ParseError(f"Expected tag name '{expected}', got '{token.value}'", token)
        return token

    def _check(self, token_type: TokenType) -> bool:
        """Check if current token is of given type."""
        if self._is_at_end():
            return False
        return self._peek().type == token_type

    def _expect(self, token_type: TokenType) -> Token:
        """Expect token of specific type."""
        if not self._check(token_type):
            current = self._peek()
            raise ParseError(
                f"Expected {token_type.value}, got {current.type.value}", current
            )
        return self._advance()

    def _advance(self) -> Token:
        """Advance to next token."""
        if not self._is_at_end():
            self.current += 1
        return self._previous()

    def _is_at_end(self) -> bool:
        """Check if at end of tokens."""
        return self._peek().type == TokenType.EOF

    def _peek(self) -> Token:
        """Peek at current token."""
        return self.tokens[self.current]

    def _previous(self) -> Token:
        """Get previous token."""
        return self.tokens[self.current - 1]
