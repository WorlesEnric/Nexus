"""
Utility functions for nexus-protocol.
"""

from pydantic import ConfigDict


def to_camel(snake_str: str) -> str:
    """
    Convert snake_case to camelCase.

    Examples:
        >>> to_camel("entity_type")
        'entityType'
        >>> to_camel("source_panel_id")
        'sourcePanelId'
        >>> to_camel("id")
        'id'
    """
    components = snake_str.split('_')
    # Keep the first component as-is, capitalize the rest
    return components[0] + ''.join(x.title() for x in components[1:])


# Shared Pydantic config for camelCase serialization
# This ensures all API responses use camelCase field names
CAMEL_CASE_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,  # Allow both snake_case and camelCase when parsing
    use_enum_values=True,   # Serialize enums to their string values
)
