#!/usr/bin/env python3
"""Test parsing notes.nxml with safety limits"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "runtime" / "nexus-core"))
sys.path.insert(0, str(Path(__file__).parent / "packages" / "nexus-protocol"))

from nexus_core.parser.lexer import Lexer

# Read notes.nxml
nxml_path = "apps/GraphStudio/src/panels/nxml/notes.nxml"
with open(nxml_path, 'r') as f:
    nxml = f.read()

print(f"Testing lexer with notes.nxml ({len(nxml)} chars)...")
print("-" * 80)

lexer = Lexer(nxml)
token_count = 0
max_tokens = 2000  # Safety limit
last_pos = -1
no_progress_count = 0

try:
    while not lexer.is_at_end() and token_count < max_tokens:
        start_pos = lexer.pos
        lexer._scan_token()
        token_count += 1

        # Show progress every 50 tokens
        if token_count % 50 == 0:
            print(f"  Progress: {token_count} tokens, pos={lexer.pos}/{len(nxml)}")

        # Detect infinite loop
        if lexer.pos == last_pos:
            no_progress_count += 1
            if no_progress_count > 3:
                print(f"\n❌ ERROR: No progress after {no_progress_count} iterations at pos={last_pos}")
                print(f"   Last token: {lexer.tokens[-1] if lexer.tokens else 'None'}")
                print(f"   Current char: {repr(lexer.peek())}")
                print(f"   in_handler: {lexer.in_handler}, in_tag: {lexer.in_tag}")
                print(f"   Context: {repr(nxml[max(0, last_pos-30):last_pos+30])}")
                break
        else:
            no_progress_count = 0
            last_pos = lexer.pos

    if token_count >= max_tokens:
        print(f"\n⚠️  Reached max token limit ({max_tokens})")
    elif not lexer.is_at_end():
        print(f"\n⚠️  Stopped before end of file")
    else:
        print(f"\n✅ SUCCESS: Tokenized {token_count} tokens")
        print(f"   Attempting to parse...")

        # Now try to parse
        from nexus_core.parser.parser import Parser
        parser = Parser(nxml)
        ast = parser.parse()
        print(f"   ✅ Parsed successfully!")
        print(f"   Panel: {ast.meta.id} - {ast.meta.title}")
        print(f"   States: {len(ast.data.states)}, Tools: {len(ast.logic.tools)}")

except Exception as e:
    print(f"\n❌ ERROR: {e}")
    import traceback
    traceback.print_exc()
