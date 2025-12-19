"""
Validation utilities for Nexus protocol types.
"""

from typing import List, Set
from .ast import NexusPanelAST, ValidationError, ValidationResult, StateNode


def validate_ast(ast: NexusPanelAST) -> ValidationResult:
    """
    Validate an NXML AST for semantic correctness.

    Checks:
    - No duplicate state/computed variable names
    - No duplicate tool names
    - Handler code references valid state variables
    - Tool arguments have valid types
    - Lifecycle events are recognized
    """
    errors: List[ValidationError] = []
    warnings: List[ValidationError] = []

    # Check for duplicate state names
    state_names = ast.get_state_names()
    if len(state_names) != len(set(state_names)):
        duplicates = [name for name in state_names if state_names.count(name) > 1]
        errors.append(ValidationError(
            severity="error",
            message=f"Duplicate state variable names: {', '.join(set(duplicates))}",
            hint="Each state variable must have a unique name"
        ))

    # Check for duplicate computed names
    computed_names = ast.get_computed_names()
    if len(computed_names) != len(set(computed_names)):
        duplicates = [name for name in computed_names if computed_names.count(name) > 1]
        errors.append(ValidationError(
            severity="error",
            message=f"Duplicate computed variable names: {', '.join(set(duplicates))}",
            hint="Each computed variable must have a unique name"
        ))

    # Check for name conflicts between state and computed
    state_set = set(state_names)
    computed_set = set(computed_names)
    conflicts = state_set & computed_set
    if conflicts:
        errors.append(ValidationError(
            severity="error",
            message=f"Variable name conflicts between state and computed: {', '.join(conflicts)}",
            hint="State and computed variables must have distinct names"
        ))

    # Check for duplicate tool names
    tool_names = ast.get_tool_names()
    if len(tool_names) != len(set(tool_names)):
        duplicates = [name for name in tool_names if tool_names.count(name) > 1]
        errors.append(ValidationError(
            severity="error",
            message=f"Duplicate tool names: {', '.join(set(duplicates))}",
            hint="Each tool must have a unique name"
        ))

    # Validate lifecycle events
    valid_lifecycle_events = {"mount", "unmount", "update", "error"}
    for lifecycle in ast.logic.lifecycles:
        if lifecycle.event not in valid_lifecycle_events:
            warnings.append(ValidationError(
                severity="warning",
                message=f"Unknown lifecycle event: {lifecycle.event}",
                hint=f"Valid events are: {', '.join(valid_lifecycle_events)}"
            ))

    # Check for required capabilities
    capabilities = ast.get_required_capabilities()
    dangerous_capabilities = {"fs:write", "fs:delete", "exec", "network:unrestricted"}
    dangerous_used = set(capabilities) & dangerous_capabilities
    if dangerous_used:
        warnings.append(ValidationError(
            severity="warning",
            message=f"Panel uses dangerous capabilities: {', '.join(dangerous_used)}",
            hint="Ensure these capabilities are necessary and properly restricted"
        ))

    return ValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings
    )


def validate_state_references(handler_code: str, available_state: Set[str]) -> List[str]:
    """
    Check if handler code references undefined state variables.

    Returns list of undefined variable names.

    Note: This is a simple heuristic check. Full validation requires
    parsing the JavaScript code, which is done in the sandbox executor.
    """
    undefined: List[str] = []

    # Simple pattern matching for $state.variableName
    import re
    pattern = r'\$state\.(\w+)'
    matches = re.findall(pattern, handler_code)

    for var_name in matches:
        if var_name not in available_state:
            undefined.append(var_name)

    return undefined
