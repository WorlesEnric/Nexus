"""
Sync Agent - Synchronizes changes across NOG graph.

Ensures consistency when AI-generated changes are applied to the workspace.
"""

import sys
import time
from pathlib import Path
from typing import Dict, Any, Optional, List
from openai import AsyncOpenAI

from ..patch_generator import NOGPatch

# TriLog imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent))
from trilog_setup import get_logger
from trilog_schemas import AISyncFlow, AISyncPatch
from trilog.context import anchor

trilog_logger = get_logger("nexus_ai.sync_agent")


class SyncAgent:
    """
    AI agent for NOG synchronization.

    Ensures that AI-generated patches maintain consistency across
    the workspace and don't break existing dependencies.
    """

    def __init__(
        self,
        model_provider: str = "openai",
        model_name: str = "gpt-4",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        temperature: float = 0.2,  # Lower temperature for consistency
    ):
        """
        Initialize sync agent.

        Args:
            model_provider: LLM provider
            model_name: Model name
            api_key: API key for LLM provider
            base_url: Optional base URL for OpenAI-compatible API
            temperature: LLM temperature
        """
        self.model_name = model_name
        self.temperature = temperature
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def validate_patch(
        self,
        patch: NOGPatch,
        current_graph_context: str,
    ) -> Dict[str, Any]:
        """
        Validate NOG patch for consistency.

        Args:
            patch: NOG patch to validate
            current_graph_context: Current state of NOG graph

        Returns:
            Validation result with issues and warnings
        """
        prompt = f"""Validate this NOG patch for consistency and correctness:

Current Graph Context:
{current_graph_context}

Proposed Patch:
{patch.model_dump_json(indent=2)}

Check for:
1. Missing dependencies (references to non-existent entities)
2. Circular dependencies
3. Breaking changes to existing relationships
4. Type mismatches
5. Duplicate entity IDs
6. Invalid relationship types

Provide:
- List of errors (blocking issues)
- List of warnings (potential issues)
- Suggested fixes for each issue"""

        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert in graph databases and dependency management. "
                        "You understand the Nexus Object Graph (NOG) and can identify "
                        "potential conflicts, missing dependencies, and breaking changes."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=self.temperature,
        )

        return {"validation": response.choices[0].message.content}

    async def analyze_impact(
        self,
        patch: NOGPatch,
        current_graph_context: str,
    ) -> Dict[str, Any]:
        """
        Analyze impact of applying patch.

        Args:
            patch: NOG patch to analyze
            current_graph_context: Current state of NOG graph

        Returns:
            Impact analysis with affected entities and potential side effects
        """
        prompt = f"""Analyze the impact of applying this NOG patch:

Current Graph Context:
{current_graph_context}

Proposed Patch:
{patch.model_dump_json(indent=2)}

Analyze:
1. Which entities will be affected
2. Which relationships will change
3. Downstream dependencies that may break
4. Panels that need to be regenerated
5. Handlers that may need updates
6. State variables that may be affected

Provide:
- List of directly affected entities
- List of indirectly affected entities
- Risk assessment (low, medium, high)
- Recommended actions before applying patch"""

        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert at analyzing system changes and their impacts.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=self.temperature,
        )

        return {"impact": response.choices[0].message.content}

    async def suggest_dependency_updates(
        self,
        changed_entity_id: str,
        change_description: str,
        dependent_entities: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Suggest updates for dependent entities.

        Args:
            changed_entity_id: ID of changed entity
            change_description: Description of change
            dependent_entities: List of entities that depend on the changed entity

        Returns:
            List of suggested updates for dependent entities
        """
        dependents_str = "\n".join([
            f"- {e['id']}: {e['name']} ({e['type']})"
            for e in dependent_entities
        ])

        prompt = f"""An entity has changed. Suggest necessary updates for dependent entities:

Changed Entity: {changed_entity_id}
Change: {change_description}

Dependent Entities:
{dependents_str}

For each dependent entity, suggest:
1. What needs to be updated
2. How to update it (code changes, property updates, etc.)
3. Priority (critical, important, optional)
4. Potential alternatives if update is complex

Format as JSON array with: entity_id, update_type, description, priority."""

        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert in dependency management and software architecture.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=self.temperature,
        )

        return [{"suggestion": response.choices[0].message.content}]

    async def resolve_conflicts(
        self,
        patch1: NOGPatch,
        patch2: NOGPatch,
        current_graph_context: str,
    ) -> NOGPatch:
        """
        Resolve conflicts between two patches.

        Args:
            patch1: First patch
            patch2: Second patch
            current_graph_context: Current state of NOG graph

        Returns:
            Merged patch that resolves conflicts
        """
        prompt = f"""Resolve conflicts between two NOG patches:

Current Graph Context:
{current_graph_context}

Patch 1:
{patch1.model_dump_json(indent=2)}

Patch 2:
{patch2.model_dump_json(indent=2)}

Resolve conflicts by:
1. Identifying conflicting operations
2. Prioritizing non-breaking changes
3. Merging compatible operations
4. Suggesting manual resolution for incompatible changes

Provide a merged patch in JSON format that resolves all conflicts."""

        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert at resolving merge conflicts and maintaining consistency.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=self.temperature,
        )

        # Parse result into NOGPatch
        # For now, return original patch1 (TODO: implement proper parsing)
        return patch1

    async def suggest_refactoring(
        self,
        graph_context: str,
        complexity_threshold: float = 0.7,
    ) -> Dict[str, Any]:
        """
        Suggest refactoring opportunities in NOG graph.

        Args:
            graph_context: Current state of NOG graph
            complexity_threshold: Threshold for complexity warnings

        Returns:
            Refactoring suggestions
        """
        prompt = f"""Analyze this NOG graph for refactoring opportunities:

Graph Context:
{graph_context}

Look for:
1. Overly complex dependency chains
2. Circular dependencies
3. Duplicate functionality
4. Poor separation of concerns
5. Tightly coupled entities
6. Opportunities for abstraction

Provide:
- List of issues found
- Severity (high, medium, low)
- Specific refactoring suggestions
- Expected benefits of each refactoring"""

        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {
                    "role": "system",
                    "content": "You are a software architecture expert specializing in code refactoring.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=self.temperature,
        )

        return {"suggestions": response.choices[0].message.content}
