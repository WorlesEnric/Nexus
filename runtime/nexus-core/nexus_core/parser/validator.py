"""
NXML AST Validator - Semantic validation of parsed AST.
"""

from typing import List, Set
from nexus_protocol.ast import (
    NexusPanelAST,
    ValidationError,
    ValidationResult,
)


class ASTValidator:
    """Validates NXML AST for semantic correctness."""

    def validate(self, ast: NexusPanelAST) -> ValidationResult:
        """
        Validate an NXML AST.

        Checks:
        - No duplicate state/computed/tool names
        - Lifecycle events are valid
        - Dangerous capabilities are flagged
        - State/computed names don't conflict
        """
        errors: List[ValidationError] = []
        warnings: List[ValidationError] = []

        # Check for duplicate state names
        state_names = [state.name for state in ast.data.states]
        duplicates = self._find_duplicates(state_names)
        if duplicates:
            errors.append(
                ValidationError(
                    severity="error",
                    message=f"Duplicate state variable names: {', '.join(duplicates)}",
                    hint="Each state variable must have a unique name",
                )
            )

        # Check for duplicate computed names
        computed_names = [computed.name for computed in ast.data.computed]
        duplicates = self._find_duplicates(computed_names)
        if duplicates:
            errors.append(
                ValidationError(
                    severity="error",
                    message=f"Duplicate computed variable names: {', '.join(duplicates)}",
                    hint="Each computed variable must have a unique name",
                )
            )

        # Check for name conflicts between state and computed
        state_set = set(state_names)
        computed_set = set(computed_names)
        conflicts = state_set & computed_set
        if conflicts:
            errors.append(
                ValidationError(
                    severity="error",
                    message=f"Variable name conflicts between state and computed: {', '.join(conflicts)}",
                    hint="State and computed variables must have distinct names",
                )
            )

        # Check for duplicate tool names
        tool_names = [tool.name for tool in ast.logic.tools]
        duplicates = self._find_duplicates(tool_names)
        if duplicates:
            errors.append(
                ValidationError(
                    severity="error",
                    message=f"Duplicate tool names: {', '.join(duplicates)}",
                    hint="Each tool must have a unique name",
                )
            )

        # Validate lifecycle events
        valid_lifecycle_events = {"mount", "unmount", "update", "error", "focus", "blur"}
        for lifecycle in ast.logic.lifecycles:
            if lifecycle.event not in valid_lifecycle_events:
                warnings.append(
                    ValidationError(
                        severity="warning",
                        message=f"Unknown lifecycle event: {lifecycle.event}",
                        hint=f"Valid events are: {', '.join(sorted(valid_lifecycle_events))}",
                    )
                )

        # Check for required capabilities
        all_capabilities = set()
        for tool in ast.logic.tools:
            all_capabilities.update(tool.handler.capabilities)
        for lifecycle in ast.logic.lifecycles:
            all_capabilities.update(lifecycle.handler.capabilities)

        dangerous_capabilities = {
            "fs:write",
            "fs:delete",
            "exec",
            "network:unrestricted",
            "system",
        }
        dangerous_used = all_capabilities & dangerous_capabilities
        if dangerous_used:
            warnings.append(
                ValidationError(
                    severity="warning",
                    message=f"Panel uses dangerous capabilities: {', '.join(sorted(dangerous_used))}",
                    hint="Ensure these capabilities are necessary and properly restricted",
                )
            )

        # Validate tool argument types
        for tool in ast.logic.tools:
            for arg in tool.args:
                if not arg.name:
                    errors.append(
                        ValidationError(
                            severity="error",
                            message=f"Tool '{tool.name}' has an argument without a name",
                            hint="All tool arguments must have a name",
                        )
                    )

        # Check for empty handler code
        for tool in ast.logic.tools:
            if not tool.handler.code.strip():
                warnings.append(
                    ValidationError(
                        severity="warning",
                        message=f"Tool '{tool.name}' has an empty handler",
                        hint="Handler code should not be empty",
                    )
                )

        for lifecycle in ast.logic.lifecycles:
            if not lifecycle.handler.code.strip():
                warnings.append(
                    ValidationError(
                        severity="warning",
                        message=f"Lifecycle '{lifecycle.event}' has an empty handler",
                        hint="Handler code should not be empty",
                    )
                )

        return ValidationResult(
            valid=len(errors) == 0, errors=errors, warnings=warnings
        )

    def _find_duplicates(self, items: List[str]) -> Set[str]:
        """Find duplicate items in a list."""
        seen = set()
        duplicates = set()

        for item in items:
            if item in seen:
                duplicates.add(item)
            else:
                seen.add(item)

        return duplicates
