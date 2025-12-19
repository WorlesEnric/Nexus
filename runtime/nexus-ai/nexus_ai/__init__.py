"""
Nexus AI - AI integration for Nexus.

Provides AI-powered features:
- Context building from NOG graphs
- Patch generation from LLM responses
- CrewAI agents for code generation, design, and synchronization
"""

from .context_builder import AIContextBuilder
from .patch_generator import AIPatchGenerator

__all__ = [
    "AIContextBuilder",
    "AIPatchGenerator",
]
