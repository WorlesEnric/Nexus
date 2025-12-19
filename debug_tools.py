#!/usr/bin/env python3
"""Debug tool names in notes.nxml"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "runtime" / "nexus-core"))
sys.path.insert(0, str(Path(__file__).parent / "packages" / "nexus-protocol"))

from nexus_core.parser.parser import Parser

# Read notes.nxml
nxml_path = "apps/GraphStudio/src/panels/nxml/notes.nxml"
with open(nxml_path, 'r') as f:
    nxml = f.read()

print(f"Parsing {nxml_path}...")
parser = Parser(nxml)
ast = parser.parse()

print(f"\nTools found ({len(ast.logic.tools)}):")
for i, tool in enumerate(ast.logic.tools):
    print(f"  {i+1}. name='{tool.name}' description='{tool.description}'")

# Check for duplicates
tool_names = [tool.name for tool in ast.logic.tools]
print(f"\nTool names list: {tool_names}")

# Find duplicates
seen = set()
duplicates = []
for name in tool_names:
    if name in seen:
        duplicates.append(name)
    else:
        seen.add(name)

if duplicates:
    print(f"\n❌ DUPLICATES FOUND: {duplicates}")
else:
    print(f"\n✅ No duplicates - all tool names are unique!")
