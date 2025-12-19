#!/usr/bin/env python3
"""
Test NXML parsing with notes.nxml and chat.nxml files
"""

import sys
from pathlib import Path

# Add runtime/nexus-core to path
sys.path.insert(0, str(Path(__file__).parent / "runtime" / "nexus-core"))
sys.path.insert(0, str(Path(__file__).parent / "packages" / "nexus-protocol"))

from nexus_core.parser.parser import Parser
import json

def test_parse_file(file_path: str):
    """Test parsing an NXML file"""
    print(f"\n{'='*80}")
    print(f"Testing: {file_path}")
    print('='*80)

    try:
        # Read file
        with open(file_path, 'r') as f:
            nxml_source = f.read()

        print(f"\n📄 NXML Source ({len(nxml_source)} chars):")
        print(nxml_source[:500] + "..." if len(nxml_source) > 500 else nxml_source)

        # Parse
        print(f"\n🔍 Parsing...")
        parser = Parser(nxml_source)
        ast = parser.parse()

        print(f"\n✅ Parsing successful!")

        # Show AST structure
        ast_dict = ast.model_dump()
        print(f"\n📊 AST Structure:")
        print(f"  - Panel ID: {ast.meta.id}")
        print(f"  - Panel Title: {ast.meta.title}")
        print(f"  - States: {len(ast.data.states)}")
        for state in ast.data.states:
            print(f"    - {state.name}: {state.type} = {state.default}")
        print(f"  - Tools: {len(ast.logic.tools)}")
        for tool in ast.logic.tools:
            print(f"    - {tool.name}({len(tool.args)} args)")
        print(f"  - View Root Type: {ast.view.root.type}")

        # Save AST to JSON for inspection
        output_file = file_path.replace('.nxml', '_ast.json')
        with open(output_file, 'w') as f:
            json.dump(ast_dict, f, indent=2, default=str)
        print(f"\n💾 AST saved to: {output_file}")

        return True, ast

    except Exception as e:
        print(f"\n❌ Parsing FAILED:")
        print(f"  Error: {type(e).__name__}")
        print(f"  Message: {str(e)}")
        import traceback
        traceback.print_exc()
        return False, None

def main():
    """Main test function"""
    print("🚀 NXML Parser Testing")
    print("="*80)

    # Test files
    test_files = [
        "apps/GraphStudio/src/panels/nxml/notes.nxml",
        "apps/GraphStudio/src/panels/nxml/chat.nxml",
    ]

    results = {}
    for test_file in test_files:
        file_path = Path(__file__).parent / test_file
        if not file_path.exists():
            print(f"\n⚠️  File not found: {file_path}")
            results[test_file] = False
            continue

        success, ast = test_parse_file(str(file_path))
        results[test_file] = success

    # Summary
    print(f"\n{'='*80}")
    print("📋 SUMMARY")
    print('='*80)
    for file, success in results.items():
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"  {status} - {file}")

    all_passed = all(results.values())
    if all_passed:
        print(f"\n🎉 All tests PASSED!")
        return 0
    else:
        print(f"\n⚠️  Some tests FAILED!")
        return 1

if __name__ == "__main__":
    sys.exit(main())
