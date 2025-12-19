# nexus-protocol

Type definitions for NXML AST and NOG graph, shared between Python backend and TypeScript frontend.

## Overview

This package provides Pydantic models for:
- **NXML Abstract Syntax Tree (AST)** - Structure of parsed NXML panels
- **NOG (Nexus Object Graph)** - Semantic graph entities and relationships
- **WebSocket Protocol Messages** - Client-server communication
- **Validation Schemas** - Runtime type validation

## Installation

### Python

```bash
# From nexus-python root
pip install -e packages/nexus-protocol

# With dev dependencies
pip install -e "packages/nexus-protocol[dev]"
```

### TypeScript (GraphStudio)

TypeScript types are automatically generated from the Python models. See "Generating TypeScript Types" below.

## Usage

### Python

```python
from nexus_protocol.ast import NexusPanelAST, StateNode
from nexus_protocol.nog import NOGEntity, EntityType, NOGRelationship
from nexus_protocol.messages import ClientMessage, ServerMessage

# Create a NOG entity
entity = NOGEntity(
    id="entity_1",
    entity_type=EntityType.PANEL,
    name="My Panel",
    properties={"foo": "bar"}
)

# Serialize to JSON
json_data = entity.model_dump(mode="json")
```

### TypeScript

```typescript
import { NOGEntity, EntityType, NexusPanelAST } from '@/types';

// Types are automatically generated from Python models
const entity: NOGEntity = {
  id: "entity_1",
  entityType: EntityType.PANEL,
  name: "My Panel",
  properties: { foo: "bar" },
  // ... other fields
};
```

## Generating TypeScript Types

TypeScript types are automatically generated from Pydantic models to ensure type safety between backend and frontend.

### Automatic Generation

Run the generation script:

```bash
cd packages/nexus-protocol
python generate_types.py
```

This will:
1. Read all Pydantic models from `nexus_protocol/`
2. Generate TypeScript interfaces
3. Output to `apps/GraphStudio/src/types/protocol.generated.ts`

### What Gets Generated

- **Interfaces** - One TypeScript interface per Pydantic model
- **Enums** - TypeScript enums for Python Enum classes (manually defined in `protocol-enums.ts`)
- **Field Mappings** - snake_case → camelCase conversion
- **Optional Fields** - Proper `?` annotations
- **Array Types** - Typed arrays like `Array<StateNode>`

### Adding New Models

1. Define your Pydantic model in `nexus_protocol/` (e.g., `ast.py`, `nog.py`)
2. Export it from `nexus_protocol/__init__.py`
3. Add it to the `models` list in `generate_types.py`
4. Run `python generate_types.py`
5. Import in TypeScript: `import { YourModel } from '@/types';`

### Type Synchronization

**Important:** Always regenerate types after modifying Pydantic models:

```bash
# After changing Python models
cd packages/nexus-protocol
python generate_types.py

# Verify GraphStudio still builds
cd ../../apps/GraphStudio
npm run build
```

## Field Name Conventions

### Python (Pydantic)
- **snake_case** - All field names use snake_case
- Example: `entity_type`, `source_panel_id`, `created_at`

### TypeScript (Generated)
- **camelCase** - Automatically converted to camelCase
- Example: `entityType`, `sourcePanelId`, `createdAt`

### Backend JSON Responses

The Python backend should use Pydantic's `alias_generator` to serialize to camelCase:

```python
class MyModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=lambda field_name: "".join(
            word.capitalize() if i > 0 else word
            for i, word in enumerate(field_name.split("_"))
        ),
        populate_by_name=True,
    )
```

## Development

### Running Tests

```bash
pytest tests/
```

### Type Checking

```bash
mypy nexus_protocol/
```

### Formatting

```bash
black nexus_protocol/
ruff check nexus_protocol/
```

## Architecture

```
nexus-protocol/
├── nexus_protocol/
│   ├── __init__.py          # Public API exports
│   ├── ast.py               # NXML AST models
│   ├── nog.py               # NOG entity/relationship models
│   ├── messages.py          # WebSocket protocol
│   └── validation.py        # Validation utilities
├── tests/                   # Unit tests
├── generate_types.py        # TypeScript generation script
├── pyproject.toml          # Package configuration
└── README.md               # This file
```

## Type Generation Flow

```
┌─────────────────────────────────────────────────────────┐
│ Python Pydantic Models                                   │
│ (nexus_protocol/*.py)                                    │
└────────────────────┬─────────────────────────────────────┘
                     │
                     │ generate_types.py
                     │ • model.model_json_schema()
                     │ • snake_case → camelCase
                     │ • Generate TypeScript interfaces
                     ▼
┌─────────────────────────────────────────────────────────┐
│ TypeScript Types                                         │
│ apps/GraphStudio/src/types/                              │
│   ├── protocol.generated.ts  (auto-generated)           │
│   ├── protocol-enums.ts      (manual enums)             │
│   └── index.ts               (exports)                   │
└────────────────────┬─────────────────────────────────────┘
                     │
                     │ import { ... } from '@/types';
                     ▼
┌─────────────────────────────────────────────────────────┐
│ GraphStudio Components                                   │
│ (React/TypeScript frontend)                              │
└─────────────────────────────────────────────────────────┘
```

## Troubleshooting

### TypeScript Build Errors After Python Changes

**Problem:** TypeScript complains about missing or incorrect types after modifying Python models.

**Solution:**
```bash
cd packages/nexus-protocol
python generate_types.py
cd ../../apps/GraphStudio
npm run build
```

### Field Name Mismatches

**Problem:** Backend sends `entity_type` but TypeScript expects `entityType`.

**Solution:**
- Use Pydantic's `alias_generator` in backend models (see "Field Name Conventions")
- Or manually map in TypeScript: `entityType: data.entity_type`

### Import Errors in TypeScript

**Problem:** `Cannot find module '@/types'`

**Solution:**
- Check `tsconfig.json` has proper path aliases
- Ensure `src/types/index.ts` exists
- Restart TypeScript server in IDE

## License

MIT
