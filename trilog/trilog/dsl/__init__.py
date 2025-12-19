"""
TriLog DSL - Domain Specific Language for Schema Definition

This module provides the Python DSL for defining your system's
Objects (entities) and Processes (workflows).

Example:
    from trilog.dsl import Object, Process, Integer, Float, String

    class User(Object):
        name = String()
        email = String()
        login_count = Integer(default=0)

    class LoginFlow(Process):
        '''User authentication workflow'''
        pass
"""

from trilog.dsl.fields import (
    Field,
    Integer,
    Float,
    String,
    Boolean,
    List,
    Dict,
    Timestamp,
    Reference,
)

from trilog.dsl.base import (
    Object,
    Process,
    TriLogMeta,
)

from trilog.dsl.registry import (
    Registry,
    RegistryExporter,
)

__all__ = [
    # Fields
    "Field",
    "Integer",
    "Float",
    "String",
    "Boolean",
    "List",
    "Dict",
    "Timestamp",
    "Reference",
    # Base Classes
    "Object",
    "Process",
    "TriLogMeta",
    # Registry
    "Registry",
    "RegistryExporter",
]
