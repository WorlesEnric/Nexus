"""
NXML Parser - Lexer, Parser, Validator, and Cache.
"""

from .lexer import Lexer, Token, TokenType
from .parser import Parser
from .validator import ASTValidator
from .cache import ASTCache


def parse_nxml(source: str, use_cache: bool = True):
    """
    Parse NXML source code into AST.

    Args:
        source: NXML source code
        use_cache: Whether to use AST cache

    Returns:
        NexusPanelAST: Parsed and validated AST

    Raises:
        ParseError: If parsing fails
        ValidationError: If validation fails
    """
    from nexus_protocol.ast import NexusPanelAST

    # Check cache
    if use_cache:
        cached_ast = ASTCache.get_instance().get(source)
        if cached_ast:
            return cached_ast

    # Parse
    parser = Parser(source)
    ast = parser.parse()

    # Validate
    validator = ASTValidator()
    result = validator.validate(ast)

    if not result.valid:
        # Collect error messages
        errors = "\n".join([f"  - {err.message}" for err in result.errors])
        raise ValueError(f"NXML validation failed:\n{errors}")

    # Cache
    if use_cache:
        ASTCache.get_instance().put(source, ast)

    return ast


__all__ = [
    "Lexer",
    "Token",
    "TokenType",
    "Parser",
    "ASTValidator",
    "ASTCache",
    "parse_nxml",
]
