#!/bin/bash
#
# Type Generation Validation Script
#
# This script ensures TypeScript types are up-to-date with Python Pydantic models.
# Run this in CI to catch type drift before deployment.
#

set -e

echo "🔍 Checking if TypeScript types are up-to-date..."
echo

# Save current directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Generate types
echo "📝 Regenerating TypeScript types from Python models..."
cd packages/nexus-protocol
python generate_types.py

# Check if types changed
cd "$REPO_ROOT"
if git diff --quiet apps/GraphStudio/src/types/protocol.generated.ts; then
    echo "✅ TypeScript types are up-to-date!"
    exit 0
else
    echo "❌ TypeScript types are OUT OF SYNC with Python models!"
    echo
    echo "The generated types have changed. Please run:"
    echo "  cd packages/nexus-protocol"
    echo "  python generate_types.py"
    echo
    echo "Then commit the updated types:"
    echo "  git add apps/GraphStudio/src/types/protocol.generated.ts"
    echo "  git commit -m 'Update generated TypeScript types'"
    echo
    echo "Diff:"
    git --no-pager diff apps/GraphStudio/src/types/protocol.generated.ts | head -50
    exit 1
fi
