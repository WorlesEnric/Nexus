"""
Design Agent - Assists with UI/UX design for panels.

Provides design guidance, component suggestions, and layout recommendations.
"""

from typing import Dict, Any, Optional, List
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from crewai import Agent, Task, Crew


class DesignAgent:
    """
    AI agent for panel design assistance.

    Provides UI/UX guidance, suggests component layouts,
    and helps create visually appealing panel designs.
    """

    def __init__(
        self,
        model_provider: str = "openai",
        model_name: str = "gpt-4",
        api_key: Optional[str] = None,
        temperature: float = 0.7,
    ):
        """
        Initialize design agent.

        Args:
            model_provider: LLM provider ("openai" or "anthropic")
            model_name: Model name
            api_key: API key for LLM provider
            temperature: LLM temperature
        """
        # Initialize LLM
        if model_provider == "openai":
            self.llm = ChatOpenAI(
                model_name=model_name,
                temperature=temperature,
                api_key=api_key,
            )
        elif model_provider == "anthropic":
            self.llm = ChatAnthropic(
                model=model_name,
                temperature=temperature,
                api_key=api_key,
            )
        else:
            raise ValueError(f"Unsupported model provider: {model_provider}")

        # Create CrewAI agent
        self.agent = Agent(
            role="UI/UX Design Expert",
            goal="Provide excellent design guidance for Nexus panels",
            backstory=(
                "You are a UI/UX design expert specializing in data visualization "
                "and interactive interfaces. You understand design principles, "
                "accessibility, and user experience best practices."
            ),
            verbose=True,
            allow_delegation=False,
            llm=self.llm,
        )

    async def suggest_layout(
        self,
        panel_purpose: str,
        data_types: List[str],
        user_actions: List[str],
    ) -> Dict[str, Any]:
        """
        Suggest layout for panel.

        Args:
            panel_purpose: Purpose of the panel
            data_types: Types of data to display
            user_actions: Actions users can perform

        Returns:
            Layout suggestion with components and structure
        """
        prompt = f"""Suggest an optimal layout for a Nexus panel with the following requirements:

Purpose: {panel_purpose}

Data Types to Display:
{chr(10).join(['- ' + dt for dt in data_types])}

User Actions:
{chr(10).join(['- ' + action for action in user_actions])}

Provide:
1. Overall layout structure (header, main content, footer, sidebar, etc.)
2. Recommended component types for each section
3. Suggested spacing and arrangement
4. Accessibility considerations
5. Responsive design tips

Format the response as a structured JSON with sections and components."""

        task = Task(
            description=prompt,
            agent=self.agent,
            expected_output="Structured layout recommendation with component suggestions",
        )

        crew = Crew(
            agents=[self.agent],
            tasks=[task],
            verbose=True,
        )

        result = crew.kickoff()

        return {"suggestion": str(result)}

    async def improve_design(
        self,
        current_nxml: str,
        improvement_goals: List[str],
    ) -> str:
        """
        Suggest design improvements for existing panel.

        Args:
            current_nxml: Current NXML panel code
            improvement_goals: What to improve (e.g., "accessibility", "visual hierarchy")

        Returns:
            Improved NXML with design enhancements
        """
        goals_str = "\n".join([f"- {goal}" for goal in improvement_goals])

        prompt = f"""Analyze and improve the design of this NXML panel:

Current NXML:
```nxml
{current_nxml}
```

Improvement Goals:
{goals_str}

Provide an improved version with:
1. Better visual hierarchy
2. Improved spacing and alignment
3. Enhanced accessibility
4. Clearer component organization
5. Better color contrast (if applicable)

Return the complete improved NXML panel."""

        task = Task(
            description=prompt,
            agent=self.agent,
            expected_output="Improved NXML panel with design enhancements",
        )

        crew = Crew(
            agents=[self.agent],
            tasks=[task],
            verbose=True,
        )

        result = crew.kickoff()

        return str(result)

    async def suggest_components(
        self,
        data_structure: Dict[str, Any],
        interaction_type: str,
    ) -> List[str]:
        """
        Suggest appropriate components for data visualization.

        Args:
            data_structure: Structure of data to display
            interaction_type: Type of interaction ("view", "edit", "create", "analyze")

        Returns:
            List of recommended component types
        """
        prompt = f"""Recommend Nexus components for displaying this data:

Data Structure:
{data_structure}

Interaction Type: {interaction_type}

Available Components:
- Layout (flexible container)
- Text (text display)
- Button (clickable button)
- Input (text input)
- Card (container with border)
- List/ListItem (list display)
- Row/Column (flex layouts)
- Container (simple container)

Suggest the most appropriate components and explain why."""

        task = Task(
            description=prompt,
            agent=self.agent,
            expected_output="List of recommended components with explanations",
        )

        crew = Crew(
            agents=[self.agent],
            tasks=[task],
            verbose=True,
        )

        result = crew.kickoff()

        return [str(result)]

    async def review_accessibility(
        self,
        nxml_source: str,
    ) -> Dict[str, Any]:
        """
        Review panel for accessibility issues.

        Args:
            nxml_source: NXML panel source

        Returns:
            Accessibility review with issues and recommendations
        """
        prompt = f"""Review this NXML panel for accessibility:

```nxml
{nxml_source}
```

Check for:
1. Keyboard navigation support
2. Screen reader compatibility
3. Color contrast
4. Focus indicators
5. ARIA attributes (if needed)
6. Semantic structure

Provide:
- List of accessibility issues found
- Severity (high, medium, low)
- Specific recommendations for each issue"""

        task = Task(
            description=prompt,
            agent=self.agent,
            expected_output="Accessibility review with issues and recommendations",
        )

        crew = Crew(
            agents=[self.agent],
            tasks=[task],
            verbose=True,
        )

        result = crew.kickoff()

        return {"review": str(result)}
