"""
Code Generator Agent - Generates NXML and handler code.

Uses LangChain/CrewAI to generate panel code based on user requirements.
"""

from typing import Dict, Any, Optional
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain.prompts import ChatPromptTemplate
from crewai import Agent, Task, Crew

from ..context_builder import AIContextBuilder
from ..patch_generator import AIPatchGenerator


class CodeGeneratorAgent:
    """
    AI agent for generating NXML panel code.
    
    Uses LLM to generate panel definitions, handlers, and state logic
    based on user requirements and workspace context.
    """
    
    def __init__(
        self,
        model_provider: str = "openai",
        model_name: str = "gpt-4",
        api_key: Optional[str] = None,
        temperature: float = 0.7,
    ):
        """
        Initialize code generator agent.
        
        Args:
            model_provider: LLM provider ("openai" or "anthropic")
            model_name: Model name
            api_key: API key for LLM provider
            temperature: LLM temperature
        """
        self.model_provider = model_provider
        self.model_name = model_name
        self.temperature = temperature
        
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
        
        # Initialize context builder and patch generator
        self.context_builder = AIContextBuilder()
        self.patch_generator = AIPatchGenerator()
        
        # Create CrewAI agent
        self.agent = Agent(
            role="NXML Code Generator",
            goal="Generate high-quality NXML panel code based on user requirements",
            backstory=(
                "You are an expert in NXML, the Nexus markup language. "
                "You understand Data/Logic/View architecture and can generate "
                "complete panel definitions with proper state management, "
                "handlers, and UI components."
            ),
            verbose=True,
            allow_delegation=False,
            llm=self.llm,
        )
    
    async def generate_panel(
        self,
        requirement: str,
        workspace_context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Generate NXML panel from requirement.
        
        Args:
            requirement: User's requirement description
            workspace_context: Optional workspace context
            
        Returns:
            NXML source code
        """
        # Build prompt
        prompt = self._build_panel_prompt(requirement, workspace_context)
        
        # Create task
        task = Task(
            description=prompt,
            agent=self.agent,
            expected_output="Complete NXML panel source code",
        )
        
        # Create crew and execute
        crew = Crew(
            agents=[self.agent],
            tasks=[task],
            verbose=True,
        )
        
        result = crew.kickoff()
        
        # Extract NXML from result
        nxml_code = self._extract_nxml_code(str(result))
        
        return nxml_code
    
    async def generate_handler(
        self,
        handler_name: str,
        handler_description: str,
        state_variables: list[str],
        workspace_context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Generate handler code.
        
        Args:
            handler_name: Handler name
            handler_description: What the handler should do
            state_variables: Available state variables
            workspace_context: Optional workspace context
            
        Returns:
            Handler JavaScript code
        """
        prompt = self._build_handler_prompt(
            handler_name,
            handler_description,
            state_variables,
            workspace_context,
        )
        
        # Create task
        task = Task(
            description=prompt,
            agent=self.agent,
            expected_output="Complete handler JavaScript code",
        )
        
        # Create crew and execute
        crew = Crew(
            agents=[self.agent],
            tasks=[task],
            verbose=True,
        )
        
        result = crew.kickoff()
        
        # Extract code from result
        code = self._extract_code(str(result), "javascript")
        
        return code
    
    async def enhance_panel(
        self,
        existing_nxml: str,
        enhancement_request: str,
    ) -> str:
        """
        Enhance existing NXML panel.
        
        Args:
            existing_nxml: Existing NXML source
            enhancement_request: What to add/change
            
        Returns:
            Enhanced NXML source code
        """
        prompt = f"""Enhance the following NXML panel based on the request.

Current NXML:
```nxml
{existing_nxml}
```

Enhancement Request:
{enhancement_request}

Generate the complete enhanced NXML panel with the requested changes."""
        
        task = Task(
            description=prompt,
            agent=self.agent,
            expected_output="Complete enhanced NXML panel source code",
        )
        
        crew = Crew(
            agents=[self.agent],
            tasks=[task],
            verbose=True,
        )
        
        result = crew.kickoff()
        
        nxml_code = self._extract_nxml_code(str(result))
        
        return nxml_code
    
    def _build_panel_prompt(
        self,
        requirement: str,
        workspace_context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Build prompt for panel generation."""
        context_str = ""
        if workspace_context:
            context_str = f"\n\nWorkspace Context:\n{workspace_context}"
        
        return f"""Generate a complete NXML panel based on the following requirement.

Requirement:
{requirement}
{context_str}

The NXML panel should follow this structure:
<NexusPanel>
  <Data>
    <!-- Define state variables -->
  </Data>
  
  <Logic>
    <!-- Define handlers -->
  </Logic>
  
  <View>
    <!-- Define UI layout -->
  </View>
</NexusPanel>

Guidelines:
- Use proper NXML syntax
- Define all necessary state variables in <Data>
- Implement all required handlers in <Logic>
- Create a clean, user-friendly UI in <View>
- Use appropriate component types (Layout, Button, Input, Text, etc.)
- Follow React-like component patterns
- Include proper prop bindings ({{$state.variableName}})
- Connect event handlers (onClick="handlerName")

Generate the complete NXML panel."""
    
    def _build_handler_prompt(
        self,
        handler_name: str,
        handler_description: str,
        state_variables: list[str],
        workspace_context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Build prompt for handler generation."""
        state_list = "\n".join([f"- {var}" for var in state_variables])
        
        context_str = ""
        if workspace_context:
            context_str = f"\n\nWorkspace Context:\n{workspace_context}"
        
        return f"""Generate a JavaScript handler function for a Nexus panel.

Handler Name: {handler_name}
Description: {handler_description}

Available State Variables:
{state_list}
{context_str}

Guidelines:
- Use modern JavaScript (ES6+)
- Access state via $state object
- Update state via $state.variableName = newValue
- Return void (state updates are automatic)
- Include error handling where appropriate
- Keep code clean and maintainable

Generate the complete handler function."""
    
    def _extract_nxml_code(self, text: str) -> str:
        """Extract NXML code from LLM response."""
        import re
        
        # Try to find NXML code block
        match = re.search(r"```nxml\s*\n(.*?)\n```", text, re.DOTALL)
        if match:
            return match.group(1).strip()
        
        # Try to find XML code block
        match = re.search(r"```xml\s*\n(.*?)\n```", text, re.DOTALL)
        if match:
            return match.group(1).strip()
        
        # Try to find generic code block
        match = re.search(r"```\s*\n(.*?)\n```", text, re.DOTALL)
        if match:
            content = match.group(1).strip()
            if content.startswith("<NexusPanel"):
                return content
        
        # Try to find <NexusPanel> tag directly
        match = re.search(r"<NexusPanel.*?>.*?</NexusPanel>", text, re.DOTALL)
        if match:
            return match.group(0)
        
        # Return as-is if no extraction worked
        return text
    
    def _extract_code(self, text: str, language: str = "javascript") -> str:
        """Extract code from LLM response."""
        import re
        
        # Try to find code block with language
        match = re.search(rf"```{language}\s*\n(.*?)\n```", text, re.DOTALL)
        if match:
            return match.group(1).strip()
        
        # Try to find generic code block
        match = re.search(r"```\s*\n(.*?)\n```", text, re.DOTALL)
        if match:
            return match.group(1).strip()
        
        # Return as-is
        return text
