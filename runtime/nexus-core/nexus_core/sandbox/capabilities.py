"""
Capability Checker - Verify handler code doesn't exceed granted capabilities.
"""

from typing import Set, List
import re


class CapabilityChecker:
    """
    Check if handler code respects granted capabilities.

    This is a simple heuristic checker. Full checking happens in the
    WASM runtime through host function guards.
    """

    # Patterns that require specific capabilities
    CAPABILITY_PATTERNS = {
        "state:read": [
            r"\$state\.",
            r"state\[",
            r"state\.get",
        ],
        "state:write": [
            r"\$state\.\w+\s*=",
            r"state\[.+\]\s*=",
            r"state\.set",
        ],
        "http:request": [
            r"fetch\(",
            r"http\.",
            r"axios\.",
        ],
        "fs:read": [
            r"fs\.read",
            r"readFile",
        ],
        "fs:write": [
            r"fs\.write",
            r"writeFile",
        ],
        "fs:delete": [
            r"fs\.delete",
            r"fs\.unlink",
            r"deleteFile",
        ],
        "exec": [
            r"exec\(",
            r"spawn\(",
            r"system\(",
        ],
        "network:unrestricted": [
            r"socket\(",
            r"connect\(",
        ],
    }

    def check_code(self, code: str, granted_capabilities: Set[str]) -> List[str]:
        """
        Check if code respects granted capabilities.

        Args:
            code: Handler code to check
            granted_capabilities: Set of granted capability strings

        Returns:
            List of capability violations (empty if all OK)
        """
        violations = []

        for capability, patterns in self.CAPABILITY_PATTERNS.items():
            # Check if capability is required by code
            required = any(re.search(pattern, code) for pattern in patterns)

            if required and capability not in granted_capabilities:
                violations.append(capability)

        return violations

    @staticmethod
    def is_dangerous(capabilities: Set[str]) -> bool:
        """Check if any capability is dangerous."""
        dangerous = {"fs:write", "fs:delete", "exec", "network:unrestricted", "system"}
        return bool(capabilities & dangerous)
