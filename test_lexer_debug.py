#!/usr/bin/env python3
"""Debug lexer to find infinite loop"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "runtime" / "nexus-core"))
sys.path.insert(0, str(Path(__file__).parent / "packages" / "nexus-protocol"))

from nexus_core.parser.lexer import Lexer

# Simple test case with Handler
nxml = """<NexusPanel id="test" title="Test">
  <Data>
    <State name="count" type="number" default="0" />
  </Data>
  <Logic>
    <Tool name="increment" description="Increment counter">
      <Handler>
        $state.count = $state.count + 1;
        return { success: true };
      </Handler>
    </Tool>
  </Logic>
  <View>
    <Container />
  </View>
</NexusPanel>"""

print("Testing lexer with simple NXML...")
print(f"Source length: {len(nxml)} chars")
print("-" * 80)

lexer = Lexer(nxml)
token_count = 0
max_tokens = 200  # Safety limit

try:
    while not lexer.is_at_end() and token_count < max_tokens:
        start_pos = lexer.pos
        lexer._scan_token()
        token_count += 1

        # Debug output every token
        if lexer.tokens:
            last_token = lexer.tokens[-1]
            print(f"Token #{token_count}: {last_token.type.value:20s} | {repr(last_token.value[:40])} | pos={lexer.pos} in_handler={lexer.in_handler}")

        # Detect infinite loop (position didn't advance)
        if lexer.pos == start_pos:
            print(f"\n❌ ERROR: Position didn't advance at pos={start_pos}")
            print(f"   Current char: {repr(lexer.peek())}")
            print(f"   in_handler: {lexer.in_handler}")
            print(f"   in_tag: {lexer.in_tag}")
            print(f"   Context: {repr(lexer.source[max(0, start_pos-20):start_pos+20])}")
            break

    if token_count >= max_tokens:
        print(f"\n❌ ERROR: Exceeded max token limit ({max_tokens})")
    else:
        print(f"\n✅ SUCCESS: Tokenized {token_count} tokens")

except Exception as e:
    print(f"\n❌ ERROR: {e}")
    import traceback
    traceback.print_exc()
