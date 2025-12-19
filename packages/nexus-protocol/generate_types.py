#!/usr/bin/env python3
"""
Generate TypeScript type definitions from Pydantic models.

This script generates TypeScript interfaces from the nexus-protocol Pydantic models
and outputs them to the GraphStudio frontend for type-safe communication.
"""

import sys
import json
from pathlib import Path
from typing import Any, Dict
from datetime import datetime

# Import all Pydantic models
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
    ViewNode,
    NXMLPrimitiveType,
    SourceLocation,
)

from nexus_protocol.nog import (
    NOGEntity,
    NOGRelationship,
    EntityType,
    RelationType,
    NOGPatch,
    PatchOperation,
    NOGGraphSnapshot,
    NOGQuery,
    NOGQueryResult,
    PatchBatch,
)

from nexus_protocol.messages import (
    ClientMessage,
    ServerMessage,
    ExecuteHandlerMessage,
    StateUpdateMessage,
    NOGUpdateMessage,
)

# Output path for generated types
OUTPUT_DIR = Path(__file__).parent.parent.parent / "apps" / "GraphStudio" / "src" / "types"
OUTPUT_FILE = OUTPUT_DIR / "protocol.generated.ts"


def python_type_to_ts(py_type: str, field_info: Dict[str, Any]) -> str:
    """Convert Python/Pydantic type to TypeScript type."""
    # Handle optional types
    is_optional = field_info.get("anyOf") is not None or field_info.get("default") is not None

    # Extract type info
    type_str = py_type
    if "anyOf" in field_info:
        # Handle Union types
        types = []
        for type_def in field_info["anyOf"]:
            if "$ref" in type_def:
                types.append(type_def["$ref"].split("/")[-1])
            elif "type" in type_def:
                types.append(type_def["type"])
        type_str = " | ".join(types)
    elif "$ref" in field_info:
        type_str = field_info["$ref"].split("/")[-1]
    elif "type" in field_info:
        type_map = {
            "string": "string",
            "integer": "number",
            "number": "number",
            "boolean": "boolean",
            "array": "Array<any>",
            "object": "Record<string, any>",
            "null": "null",
        }
        type_str = type_map.get(field_info["type"], "any")

        # Handle array items
        if field_info["type"] == "array" and "items" in field_info:
            items = field_info["items"]
            if "$ref" in items:
                item_type = items["$ref"].split("/")[-1]
                type_str = f"Array<{item_type}>"
            elif "type" in items:
                item_type = type_map.get(items["type"], "any")
                type_str = f"Array<{item_type}>"

    # Add optional
    if is_optional and type_str != "null":
        type_str = f"{type_str} | null"

    return type_str


def generate_ts_interface(name: str, schema: Dict[str, Any], enums: Dict[str, Any]) -> str:
    """Generate TypeScript interface from JSON schema."""
    lines = []

    # Add description if available
    if "description" in schema:
        lines.append(f"/**\n * {schema['description']}\n */")

    # Check if it's an enum
    if "enum" in schema:
        enum_values = schema["enum"]
        lines.append(f"export enum {name} {{")
        for value in enum_values:
            # Convert snake_case to PascalCase for enum keys
            key = "".join(word.capitalize() for word in value.split("_"))
            lines.append(f"  {key} = \"{value}\",")
        lines.append("}")
        return "\n".join(lines)

    lines.append(f"export interface {name} {{")

    # Add properties
    if "properties" in schema:
        for prop_name, prop_info in schema["properties"].items():
            # Add field description
            if "description" in prop_info:
                lines.append(f"  /** {prop_info['description']} */")

            # Determine if required
            required = schema.get("required", [])
            is_required = prop_name in required
            optional_mark = "" if is_required else "?"

            # Get TypeScript type
            ts_type = python_type_to_ts(prop_name, prop_info)

            # Convert snake_case to camelCase
            camel_prop = "".join(
                word.capitalize() if i > 0 else word
                for i, word in enumerate(prop_name.split("_"))
            )

            lines.append(f"  {camel_prop}{optional_mark}: {ts_type};")

    lines.append("}")

    return "\n".join(lines)


def main():
    """Generate TypeScript definitions."""
    print("🔧 Generating TypeScript types from Pydantic models...")

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Collect all models
    models = [
        # AST models
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
        ViewNode,
        SourceLocation,
        # NOG models
        NOGEntity,
        NOGRelationship,
        NOGGraphSnapshot,
        NOGPatch,
        PatchBatch,
        NOGQuery,
        NOGQueryResult,
        # Message models
        ClientMessage,
        ServerMessage,
        ExecuteHandlerMessage,
        StateUpdateMessage,
        NOGUpdateMessage,
        # Enums
        NXMLPrimitiveType,
        EntityType,
        RelationType,
        PatchOperation,
    ]

    try:
        ts_output = []
        ts_output.append("/**")
        ts_output.append(" * Auto-generated TypeScript types from nexus-protocol Pydantic models")
        ts_output.append(f" * Generated on: {datetime.now().isoformat()}")
        ts_output.append(" *")
        ts_output.append(" * DO NOT EDIT THIS FILE MANUALLY")
        ts_output.append(" * Run `python packages/nexus-protocol/generate_types.py` to regenerate")
        ts_output.append(" */")
        ts_output.append("")

        # Generate types
        enums = {}
        interfaces = {}

        for model in models:
            try:
                # Get JSON schema
                schema = model.model_json_schema()
                name = model.__name__

                # Store schema
                if "enum" in schema:
                    enums[name] = schema
                else:
                    interfaces[name] = schema

            except Exception as e:
                print(f"  ⚠️  Warning: Skipping {model.__name__}: {e}")
                continue

        # Write enums first
        ts_output.append("// ============================================================================")
        ts_output.append("// Enums")
        ts_output.append("// ============================================================================")
        ts_output.append("")

        for name, schema in enums.items():
            ts_output.append(generate_ts_interface(name, schema, enums))
            ts_output.append("")

        # Write interfaces
        ts_output.append("// ============================================================================")
        ts_output.append("// Interfaces")
        ts_output.append("// ============================================================================")
        ts_output.append("")

        for name, schema in interfaces.items():
            ts_output.append(generate_ts_interface(name, schema, enums))
            ts_output.append("")

        # Write to file
        OUTPUT_FILE.write_text("\n".join(ts_output))

        print(f"✅ TypeScript types generated successfully!")
        print(f"📄 Output: {OUTPUT_FILE}")
        print(f"📊 Generated {len(enums)} enums and {len(interfaces)} interfaces")
        print()
        print("Generated types include:")
        print(f"  - {len([m for m in models if 'AST' in m.__name__ or 'Node' in m.__name__])} NXML AST types")
        print(f"  - {len([m for m in models if 'NOG' in m.__name__])} NOG types")
        print(f"  - {len([m for m in models if 'Message' in m.__name__])} Message types")
        print()
        print("✨ You can now import these types in GraphStudio:")
        print("   import { NOGEntity, NOGRelationship, NexusPanelAST } from '@/types/protocol.generated';")

        return 0

    except Exception as e:
        print(f"❌ Error generating TypeScript types: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
