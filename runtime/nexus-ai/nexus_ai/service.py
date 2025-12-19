"""
AI Service - Main service for AI features.

Provides high-level interface for AI-powered features in Nexus.
"""

import sys
import time
from pathlib import Path
from typing import Dict, Any, Optional
import os

from nexus_core.nog import NOGGraph

from .context_builder import AIContextBuilder
from .patch_generator import AIPatchGenerator, NOGPatch
from .agents import CodeGeneratorAgent, DesignAgent, SyncAgent

# TriLog imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))
from trilog_setup import get_logger
from trilog_schemas import AIContextBuild, AIPatchGeneration, AISyncFlow
from trilog.context import anchor

trilog_logger = get_logger("nexus_ai.service")


class AIService:
    """
    Main AI service for Nexus.

    Coordinates AI agents, context building, and patch generation
    for AI-powered workspace features.
    """

    def __init__(
        self,
        model_provider: str = "openai",
        model_name: str = "gpt-4",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        """
        Initialize AI service.

        Args:
            model_provider: LLM provider ("openai" for now)
            model_name: Model name
            api_key: API key (defaults to OPENAI_API_KEY env variable)
            base_url: Optional base URL for OpenAI-compatible API (e.g. SiliconFlow)
        """
        # Get API key from environment if not provided
        if api_key is None:
            api_key = os.getenv("OPENAI_API_KEY")

        # Initialize components
        self.context_builder = AIContextBuilder()
        self.patch_generator = AIPatchGenerator()

        # Initialize agents
        self.code_agent = CodeGeneratorAgent(
            model_provider=model_provider,
            model_name=model_name,
            api_key=api_key,
            base_url=base_url,
        )

        self.design_agent = DesignAgent(
            model_provider=model_provider,
            model_name=model_name,
            api_key=api_key,
            base_url=base_url,
        )

        self.sync_agent = SyncAgent(
            model_provider=model_provider,
            model_name=model_name,
            api_key=api_key,
            base_url=base_url,
        )

    async def generate_panel_from_description(
        self,
        description: str,
        workspace_graph: NOGGraph,
        focus_entity_id: Optional[str] = None,
    ) -> str:
        """
        Generate NXML panel from natural language description.

        Args:
            description: User's description of desired panel
            workspace_graph: Current workspace NOG graph
            focus_entity_id: Optional entity to focus on

        Returns:
            NXML source code
        """
        # TriLog: Track context building
        context_id = f"ai_context_{int(time.time() * 1000000)}"
        with anchor(context_id, AIContextBuild):
            start_time = time.time()

            trilog_logger.event("ai_context_building_started",
                user_request=description[:100],  # Truncate for logging
                workspace_id=workspace_graph.workspace_id if hasattr(workspace_graph, 'workspace_id') else "unknown"
            )

            # Build context from NOG graph
            context = self.context_builder.build_prompt(
                graph=workspace_graph,
                user_request=description,
                focus_entity_id=focus_entity_id,
            )

            duration_ms = int((time.time() - start_time) * 1000)
            entities_count = len(workspace_graph.entities) if hasattr(workspace_graph, 'entities') else 0

            trilog_logger.state_change(
                workspace_id=workspace_graph.workspace_id if hasattr(workspace_graph, 'workspace_id') else "unknown",
                user_request=description[:200],
                entities_included=entities_count,
                build_duration_ms=duration_ms
            )

        # TriLog: Track panel generation
        generation_id = f"ai_generation_{int(time.time() * 1000000)}"
        with anchor(generation_id, AIPatchGeneration):
            start_time = time.time()

            trilog_logger.event("ai_panel_generation_started",
                user_request=description[:100],
                model_name="gpt-4"
            )

            # Generate panel using code agent
            nxml_code = await self.code_agent.generate_panel(
                requirement=description,
                workspace_context=context,
            )

            duration_ms = int((time.time() - start_time) * 1000)

            trilog_logger.event("ai_panel_generation_completed",
                output_length=len(nxml_code)
            )
            trilog_logger.state_change(
                workspace_id=workspace_graph.workspace_id if hasattr(workspace_graph, 'workspace_id') else "unknown",
                user_request=description[:200],
                model_name="gpt-4",
                total_duration_ms=duration_ms,
                success=True
            )

        return nxml_code

    async def generate_patch_from_request(
        self,
        request: str,
        workspace_graph: NOGGraph,
        focus_entity_id: Optional[str] = None,
    ) -> NOGPatch:
        """
        Generate NOG patch from natural language request.

        Args:
            request: User's modification request
            workspace_graph: Current workspace NOG graph
            focus_entity_id: Optional entity to focus on

        Returns:
            NOG patch
        """
        # Build context
        prompt_data = self.context_builder.build_prompt(
            graph=workspace_graph,
            user_request=request,
            focus_entity_id=focus_entity_id,
        )

        # Generate patch prompt
        patch_prompt = self.patch_generator.generate_patch_prompt(
            user_request=request,
            context=prompt_data["context"],
        )

        # Call LLM using code agent's client
        response = await self.code_agent.client.chat.completions.create(
            model=self.code_agent.model_name,
            messages=[{"role": "user", "content": patch_prompt}],
            temperature=self.code_agent.temperature,
        )
        llm_response = response.choices[0].message.content

        # Parse response into patch
        patch = self.patch_generator.parse_llm_response(llm_response)

        return patch

    async def enhance_panel(
        self,
        existing_nxml: str,
        enhancement_request: str,
    ) -> str:
        """
        Enhance existing panel with new features.

        Args:
            existing_nxml: Current NXML source
            enhancement_request: What to add/change

        Returns:
            Enhanced NXML source
        """
        return await self.code_agent.enhance_panel(
            existing_nxml=existing_nxml,
            enhancement_request=enhancement_request,
        )

    async def suggest_design_improvements(
        self,
        nxml_source: str,
        goals: list[str],
    ) -> str:
        """
        Suggest design improvements for panel.

        Args:
            nxml_source: Current NXML source
            goals: Improvement goals (e.g., ["accessibility", "visual hierarchy"])

        Returns:
            Improved NXML source
        """
        return await self.design_agent.improve_design(
            current_nxml=nxml_source,
            improvement_goals=goals,
        )

    async def validate_and_apply_patch(
        self,
        patch: NOGPatch,
        workspace_graph: NOGGraph,
    ) -> Dict[str, Any]:
        """
        Validate and apply NOG patch.

        Args:
            patch: NOG patch to apply
            workspace_graph: Target NOG graph

        Returns:
            Result with validation and application status
        """
        # Get graph context
        graph_context = self.context_builder._graph_to_text(workspace_graph)

        # Validate patch
        validation = await self.sync_agent.validate_patch(
            patch=patch,
            current_graph_context=graph_context,
        )

        # Check for blocking errors
        # TODO: Parse validation result properly
        # For now, assume validation passes

        # Analyze impact
        impact = await self.sync_agent.analyze_impact(
            patch=patch,
            current_graph_context=graph_context,
        )

        # Apply patch
        try:
            self.patch_generator.apply_patch(patch, workspace_graph)

            return {
                "success": True,
                "validation": validation,
                "impact": impact,
                "message": "Patch applied successfully",
            }

        except Exception as e:
            return {
                "success": False,
                "validation": validation,
                "impact": impact,
                "error": str(e),
                "message": "Failed to apply patch",
            }

    async def review_accessibility(
        self,
        nxml_source: str,
    ) -> Dict[str, Any]:
        """
        Review panel for accessibility issues.

        Args:
            nxml_source: NXML panel source

        Returns:
            Accessibility review
        """
        return await self.design_agent.review_accessibility(nxml_source)

    async def suggest_refactoring(
        self,
        workspace_graph: NOGGraph,
    ) -> Dict[str, Any]:
        """
        Suggest refactoring opportunities for workspace.

        Args:
            workspace_graph: Current workspace NOG graph

        Returns:
            Refactoring suggestions
        """
        graph_context = self.context_builder._graph_to_text(workspace_graph)

        return await self.sync_agent.suggest_refactoring(graph_context)
