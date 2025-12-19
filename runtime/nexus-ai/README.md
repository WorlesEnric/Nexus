# Nexus AI

AI integration for Nexus - LangChain/CrewAI agents for code generation, design assistance, and synchronization.

## Overview

Nexus AI provides AI-powered features for the Nexus workspace:

- **Context Building**: Convert NOG graphs to LLM-friendly context
- **Patch Generation**: Parse LLM responses into NOG graph patches
- **Code Generation**: Generate NXML panels and handlers from descriptions
- **Design Assistance**: UI/UX guidance and improvements
- **Synchronization**: Ensure consistency of AI-generated changes

## Architecture

```
AIService (main entry point)
├── AIContextBuilder (NOG → LLM context)
├── AIPatchGenerator (LLM response → NOG patches)
└── Agents
    ├── CodeGeneratorAgent (generate NXML code)
    ├── DesignAgent (UI/UX guidance)
    └── SyncAgent (ensure consistency)
```

## Installation

```bash
cd runtime/nexus-ai
pip install -e .
```

## Configuration

Set your API key as an environment variable:

```bash
# For OpenAI
export OPENAI_API_KEY="your-key-here"

# For Anthropic
export ANTHROPIC_API_KEY="your-key-here"
```

## Usage

### Basic Example

```python
from nexus_ai import AIService
from nexus_core.nog import NOGGraph

# Initialize AI service
ai_service = AIService(
    model_provider="openai",
    model_name="gpt-4",
)

# Generate panel from description
workspace_graph = NOGGraph(workspace_id="ws_123", workspace_name="My Workspace")

nxml_code = await ai_service.generate_panel_from_description(
    description="Create a counter panel with increment and decrement buttons",
    workspace_graph=workspace_graph,
)

print(nxml_code)
```

### Generate NOG Patch

```python
# Generate patch for workspace modifications
patch = await ai_service.generate_patch_from_request(
    request="Add a new state variable 'theme' with default value 'dark'",
    workspace_graph=workspace_graph,
    focus_entity_id="panel_abc",
)

# Validate and apply patch
result = await ai_service.validate_and_apply_patch(
    patch=patch,
    workspace_graph=workspace_graph,
)

if result["success"]:
    print("Patch applied successfully!")
else:
    print(f"Failed: {result['error']}")
```

### Design Assistance

```python
# Get design improvements
improved_nxml = await ai_service.suggest_design_improvements(
    nxml_source=existing_nxml,
    goals=["accessibility", "visual hierarchy", "responsiveness"],
)

# Review accessibility
review = await ai_service.review_accessibility(nxml_source)
print(review)
```

### Enhance Existing Panel

```python
# Add features to existing panel
enhanced_nxml = await ai_service.enhance_panel(
    existing_nxml=current_nxml,
    enhancement_request="Add a search input and filter the list based on search term",
)
```

## Components

### AIContextBuilder

Converts NOG graphs to natural language context for LLMs:

```python
from nexus_ai import AIContextBuilder

builder = AIContextBuilder(max_context_tokens=8000)

# Build context documents
documents = builder.build_context(
    graph=workspace_graph,
    focus_entity_id="panel_123",
    depth=2,
)

# Build complete prompt
prompt = builder.build_prompt(
    graph=workspace_graph,
    user_request="Generate a data visualization panel",
    focus_entity_id="panel_123",
)
```

### AIPatchGenerator

Parses LLM responses into NOG patches:

```python
from nexus_ai import AIPatchGenerator

generator = AIPatchGenerator()

# Parse LLM response
patch = generator.parse_llm_response(
    response=llm_output,
    format_type="json",  # or "markdown", "xml"
)

# Apply patch to graph
generator.apply_patch(patch, workspace_graph)
```

### Agents

#### CodeGeneratorAgent

```python
from nexus_ai.agents import CodeGeneratorAgent

agent = CodeGeneratorAgent(model_provider="openai", model_name="gpt-4")

# Generate panel
nxml = await agent.generate_panel(
    requirement="Create a todo list with add/remove functionality",
)

# Generate handler
handler_code = await agent.generate_handler(
    handler_name="addTodo",
    handler_description="Add a new todo item to the list",
    state_variables=["todos", "inputValue"],
)
```

#### DesignAgent

```python
from nexus_ai.agents import DesignAgent

agent = DesignAgent(model_provider="openai", model_name="gpt-4")

# Suggest layout
layout = await agent.suggest_layout(
    panel_purpose="Display user dashboard with metrics",
    data_types=["number", "chart", "list"],
    user_actions=["refresh", "filter", "export"],
)

# Suggest components
components = await agent.suggest_components(
    data_structure={"users": [{"name": str, "email": str}]},
    interaction_type="edit",
)
```

#### SyncAgent

```python
from nexus_ai.agents import SyncAgent

agent = SyncAgent(model_provider="openai", model_name="gpt-4")

# Validate patch
validation = await agent.validate_patch(
    patch=nog_patch,
    current_graph_context=graph_context,
)

# Analyze impact
impact = await agent.analyze_impact(
    patch=nog_patch,
    current_graph_context=graph_context,
)

# Suggest refactoring
suggestions = await agent.suggest_refactoring(
    graph_context=graph_context,
)
```

## LLM Providers

### OpenAI

```python
ai_service = AIService(
    model_provider="openai",
    model_name="gpt-4",  # or "gpt-3.5-turbo"
    api_key="your-openai-key",
)
```

### Anthropic

```python
ai_service = AIService(
    model_provider="anthropic",
    model_name="claude-3-opus-20240229",  # or "claude-3-sonnet-20240229"
    api_key="your-anthropic-key",
)
```

## Integration with Workspace Kernel

The workspace kernel uses `AIService` to provide AI features via REST API:

```python
# In workspace_kernel/services/ai_service.py
from nexus_ai import AIService

ai_service = AIService(
    model_provider=settings.ai_model_provider,
    model_name=settings.ai_model_name,
)

# In API endpoint
@router.post("/api/ai/generate-panel")
async def generate_panel(request: GeneratePanelRequest):
    nxml_code = await ai_service.generate_panel_from_description(
        description=request.description,
        workspace_graph=nog_service.get_graph(request.workspace_id),
    )

    return {"nxml_code": nxml_code}
```

## Development

### Running Tests

```bash
pytest tests/
```

### Type Checking

```bash
mypy nexus_ai/
```

### Formatting

```bash
black nexus_ai/
ruff check nexus_ai/
```

## Performance Considerations

- Context building extracts subgraphs to minimize token usage
- Use appropriate model for task (GPT-4 for complex generation, GPT-3.5 for simple tasks)
- Cache parsed NXML to avoid re-parsing
- Batch multiple requests when possible

## Limitations

- LLM output quality depends on prompt engineering and context
- May require multiple iterations for complex requirements
- Validation is heuristic-based, manual review recommended
- Token limits may restrict context size for large workspaces

## Future Enhancements

- [ ] Fine-tuned models for NXML generation
- [ ] Vector database for semantic search across panels
- [ ] Reinforcement learning from user feedback
- [ ] Multi-modal support (images, diagrams)
- [ ] Collaborative AI with multiple agents
- [ ] Cost optimization and caching strategies

## License

MIT
