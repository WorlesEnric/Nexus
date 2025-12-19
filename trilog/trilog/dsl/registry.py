"""
TriLog Registry

The Registry is the "Source of Truth" that defines which keys
(OTel attributes) the system expects. It is generated from the
Python DSL and used for:
- Log validation
- Query building
- Documentation generation
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Type, Union
import json
import hashlib

from trilog.dsl.base import Object, Process, TriLogMeta


class Registry:
    """
    Central registry for all TriLog schema types.
    
    The registry collects Object and Process definitions and exports
    them to a JSON format that can be used by the OTel Collector
    for validation.
    
    Example:
        registry = Registry()
        registry.register(ShoppingCart)
        registry.register(CheckoutFlow)
        registry.export("registry.json")
    """
    
    def __init__(self, name: str = "default", version: str = "1.0.0"):
        """
        Initialize a new Registry.
        
        Args:
            name: Name of this registry
            version: Semantic version of the schema
        """
        self.name = name
        self.version = version
        self._objects: Dict[str, Type[Object]] = {}
        self._processes: Dict[str, Type[Process]] = {}
        self._created_at = datetime.utcnow()
    
    def register(self, cls: Type[Union[Object, Process]]) -> None:
        """
        Register a schema type with the registry.
        
        Args:
            cls: Object or Process class to register
        """
        if issubclass(cls, Object) and cls is not Object:
            self._objects[cls.__trilog_type__] = cls
        elif issubclass(cls, Process) and cls is not Process:
            self._processes[cls.__trilog_type__] = cls
        else:
            raise TypeError(f"Cannot register {cls}: must be Object or Process subclass")
    
    def register_all(self) -> None:
        """
        Register all Object and Process subclasses that have been defined.
        
        This uses the metaclass registry to find all defined types.
        """
        for name, cls in TriLogMeta.get_registered().items():
            if issubclass(cls, Object):
                self._objects[name] = cls
            elif issubclass(cls, Process):
                self._processes[name] = cls
    
    def get_object(self, name: str) -> Optional[Type[Object]]:
        """Get an Object type by name"""
        return self._objects.get(name)
    
    def get_process(self, name: str) -> Optional[Type[Process]]:
        """Get a Process type by name"""
        return self._processes.get(name)
    
    def get_all_objects(self) -> Dict[str, Type[Object]]:
        """Get all registered Object types"""
        return dict(self._objects)
    
    def get_all_processes(self) -> Dict[str, Type[Process]]:
        """Get all registered Process types"""
        return dict(self._processes)
    
    def get_expected_keys(self) -> Set[str]:
        """
        Get all expected OTel attribute keys.
        
        Returns a set of all valid attribute keys that logs
        should use, based on the registered schemas.
        """
        keys = {
            # Core TriLog keys
            "trilog.obj.id",
            "trilog.obj.type",
            "trilog.obj.version",
            "trilog.process.type",
            "trilog.process.status",
            "trilog.process.started_at",
        }
        
        # Add object-specific keys
        for obj_cls in self._objects.values():
            prefix = obj_cls.get_otel_prefix()
            for field_name in obj_cls.__trilog_fields__:
                keys.add(f"{prefix}.{field_name}")
        
        return keys
    
    def validate_attributes(self, attributes: Dict[str, Any]) -> List[str]:
        """
        Validate a set of attributes against the registry.
        
        Args:
            attributes: Dict of OTel attributes to validate
            
        Returns:
            List of validation error messages (empty if valid)
        """
        errors = []
        expected_keys = self.get_expected_keys()
        
        for key in attributes:
            # Skip non-trilog attributes
            if not any(key.startswith(p) for p in ["trilog.", *[
                f"{cls.get_otel_prefix()}." for cls in self._objects.values()
            ]]):
                continue
            
            if key not in expected_keys:
                errors.append(f"Unknown attribute key: {key}")
        
        return errors
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert the registry to a dictionary.
        
        This is the JSON-serializable format used for export.
        """
        return {
            "registry": {
                "name": self.name,
                "version": self.version,
                "created_at": self._created_at.isoformat(),
                "checksum": self._compute_checksum(),
            },
            "objects": {
                name: cls.schema()
                for name, cls in self._objects.items()
            },
            "processes": {
                name: cls.schema()
                for name, cls in self._processes.items()
            },
            "expected_keys": sorted(self.get_expected_keys()),
        }
    
    def _compute_checksum(self) -> str:
        """Compute a checksum of the registry for versioning"""
        content = json.dumps({
            "objects": sorted(self._objects.keys()),
            "processes": sorted(self._processes.keys()),
        }, sort_keys=True)
        return hashlib.sha256(content.encode()).hexdigest()[:16]
    
    def export(self, path: Union[str, Path]) -> None:
        """
        Export the registry to a JSON file.

        Args:
            path: Path to write the registry file
        """
        path = Path(path)
        with open(path, 'w') as f:
            json.dump(self.to_dict(), f, indent=2)

    def to_configmap_yaml(self, configmap_name: str = "trilog-registry") -> str:
        """
        Export the registry as a Kubernetes ConfigMap YAML.

        Args:
            configmap_name: Name for the ConfigMap

        Returns:
            YAML string for the ConfigMap
        """
        import yaml

        # Convert registry to JSON string
        registry_json = json.dumps(self.to_dict(), indent=2)

        # Create ConfigMap structure
        configmap = {
            "apiVersion": "v1",
            "kind": "ConfigMap",
            "metadata": {
                "name": configmap_name,
                "namespace": "trilog-system",
                "labels": {
                    "app.kubernetes.io/name": "trilog",
                    "app.kubernetes.io/component": "registry",
                    "trilog.io/registry-name": self.name,
                    "trilog.io/registry-version": self.version,
                },
                "annotations": {
                    "trilog.io/checksum": self._compute_checksum(),
                    "trilog.io/created-at": self._created_at.isoformat(),
                }
            },
            "data": {
                "registry.json": registry_json
            }
        }

        return yaml.dump(configmap, default_flow_style=False, sort_keys=False)

    @classmethod
    def load(cls, path: Union[str, Path]) -> Registry:
        """
        Load a registry from a JSON file.
        
        Note: This creates a registry with schema metadata only,
        not the actual Python classes.
        
        Args:
            path: Path to the registry file
        """
        path = Path(path)
        with open(path, 'r') as f:
            data = json.load(f)
        
        registry = cls(
            name=data["registry"]["name"],
            version=data["registry"]["version"],
        )
        registry._loaded_schema = data
        return registry
    
    def __repr__(self) -> str:
        return (
            f"Registry(name={self.name!r}, version={self.version!r}, "
            f"objects={len(self._objects)}, processes={len(self._processes)})"
        )


class RegistryExporter:
    """
    Utility class for exporting registries in various formats.
    """
    
    def __init__(self, registry: Registry):
        self.registry = registry
    
    def to_json(self, pretty: bool = True) -> str:
        """Export registry as JSON string"""
        indent = 2 if pretty else None
        return json.dumps(self.registry.to_dict(), indent=indent)
    
    def to_otel_config(self) -> Dict[str, Any]:
        """
        Generate OTel Collector configuration snippet.
        
        This creates the attribute validation rules for the
        OTel Collector processor.
        """
        return {
            "processors": {
                "attributes/trilog_validate": {
                    "actions": [
                        {
                            "key": "trilog.registry.name",
                            "value": self.registry.name,
                            "action": "upsert",
                        },
                        {
                            "key": "trilog.registry.version",
                            "value": self.registry.version,
                            "action": "upsert",
                        },
                    ]
                }
            }
        }
    
    def to_clickhouse_schema(self) -> str:
        """
        Generate ClickHouse table schema for the registry.
        
        Creates optimized column definitions based on the
        registered Object fields.
        """
        lines = [
            "CREATE TABLE IF NOT EXISTS trilog_events (",
            "    timestamp DateTime64(6) CODEC(Delta, ZSTD(1)),",
            "    trace_id String CODEC(ZSTD(1)),",
            "    span_id String CODEC(ZSTD(1)),",
            "    obj_id String CODEC(ZSTD(1)),",
            "    obj_type LowCardinality(String),",
            "    body String CODEC(ZSTD(1)),",
            "    severity_text LowCardinality(String),",
        ]
        
        # Add columns for indexed fields
        for obj_cls in self.registry._objects.values():
            prefix = obj_cls.get_otel_prefix()
            for name, field in obj_cls.__trilog_fields__.items():
                if field.indexed:
                    col_name = f"attr_{prefix}_{name}".replace(".", "_")
                    col_type = self._field_to_clickhouse_type(field)
                    lines.append(f"    {col_name} {col_type},")
        
        lines.extend([
            "    attributes Map(String, String) CODEC(ZSTD(1))",
            ") ENGINE = MergeTree()",
            "PARTITION BY toYYYYMM(timestamp)",
            "ORDER BY (obj_type, obj_id, timestamp)",
            "TTL timestamp + INTERVAL 90 DAY;",
        ])
        
        return "\n".join(lines)
    
    def _field_to_clickhouse_type(self, field) -> str:
        """Map TriLog field types to ClickHouse types"""
        from trilog.dsl.fields import FieldType
        
        type_map = {
            FieldType.INTEGER: "Int64",
            FieldType.FLOAT: "Float64",
            FieldType.STRING: "String",
            FieldType.BOOLEAN: "UInt8",
            FieldType.TIMESTAMP: "DateTime64(6)",
            FieldType.LIST: "String",  # JSON encoded
            FieldType.DICT: "String",  # JSON encoded
            FieldType.REFERENCE: "String",
        }
        
        ch_type = type_map.get(field.field_type, "String")
        if field.nullable:
            return f"Nullable({ch_type})"
        return ch_type
    
    def to_typescript(self) -> str:
        """
        Generate TypeScript type definitions for the registry.
        
        Useful for frontend applications that need type-safe
        access to TriLog data.
        """
        lines = [
            "// Auto-generated TriLog TypeScript definitions",
            f"// Registry: {self.registry.name} v{self.registry.version}",
            "",
            "export namespace TriLog {",
        ]
        
        # Generate Object interfaces
        for name, obj_cls in self.registry._objects.items():
            lines.append(f"  export interface {name} {{")
            lines.append(f"    __id__: string;")
            lines.append(f"    __type__: '{name}';")
            lines.append(f"    __version__: number;")
            
            for field_name, field in obj_cls.__trilog_fields__.items():
                ts_type = self._field_to_typescript_type(field)
                optional = "?" if not field.required else ""
                lines.append(f"    {field_name}{optional}: {ts_type};")
            
            lines.append("  }")
            lines.append("")
        
        # Generate type union
        if self.registry._objects:
            union = " | ".join(self.registry._objects.keys())
            lines.append(f"  export type AnyObject = {union};")
        
        lines.append("}")
        lines.append("")
        
        return "\n".join(lines)
    
    def _field_to_typescript_type(self, field) -> str:
        """Map TriLog field types to TypeScript types"""
        from trilog.dsl.fields import FieldType
        
        type_map = {
            FieldType.INTEGER: "number",
            FieldType.FLOAT: "number",
            FieldType.STRING: "string",
            FieldType.BOOLEAN: "boolean",
            FieldType.TIMESTAMP: "string",  # ISO date string
            FieldType.LIST: "any[]",
            FieldType.DICT: "Record<string, any>",
            FieldType.REFERENCE: "string",
        }
        
        ts_type = type_map.get(field.field_type, "any")
        if field.nullable:
            return f"{ts_type} | null"
        return ts_type
