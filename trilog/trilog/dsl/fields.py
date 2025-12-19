"""
TriLog DSL Field Types

Defines the field types available for schema definition.
Each field type maps to both a Python type and an OpenTelemetry
attribute type for proper serialization.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Optional, Type, Union, TypeVar, Generic
from enum import Enum
import json


class FieldType(str, Enum):
    """Enumeration of supported field types"""
    INTEGER = "integer"
    FLOAT = "float"
    STRING = "string"
    BOOLEAN = "boolean"
    LIST = "list"
    DICT = "dict"
    TIMESTAMP = "timestamp"
    REFERENCE = "reference"


T = TypeVar('T')


class Field(ABC, Generic[T]):
    """
    Base class for all TriLog field types.
    
    Fields define the schema for Object attributes and are used
    for both validation and registry generation.
    
    Attributes:
        name: Field name (set by metaclass)
        default: Default value for the field
        required: Whether the field is required
        description: Human-readable description
        indexed: Whether to create a ClickHouse index
    """
    
    field_type: FieldType
    python_type: Type
    
    def __init__(
        self,
        default: Optional[T] = None,
        required: bool = False,
        description: str = "",
        indexed: bool = False,
        nullable: bool = True,
    ):
        self.name: Optional[str] = None  # Set by metaclass
        self.default = default
        self.required = required
        self.description = description
        self.indexed = indexed
        self.nullable = nullable
        self._value: Optional[T] = None
    
    def __set_name__(self, owner: Type, name: str) -> None:
        """Called when the field is assigned to a class attribute"""
        self.name = name
    
    def __get__(self, obj: Any, objtype: Optional[Type] = None) -> T:
        """Descriptor get - returns the field value"""
        if obj is None:
            return self  # type: ignore
        return getattr(obj, f"_field_{self.name}", self.default)
    
    def __set__(self, obj: Any, value: T) -> None:
        """Descriptor set - validates and sets the field value"""
        validated = self.validate(value)
        setattr(obj, f"_field_{self.name}", validated)
    
    @abstractmethod
    def validate(self, value: Any) -> T:
        """Validate and coerce a value to the correct type"""
        pass
    
    def to_otel_value(self, value: T) -> Any:
        """Convert value to OpenTelemetry-compatible format"""
        return value
    
    def from_otel_value(self, value: Any) -> T:
        """Convert from OpenTelemetry format back to Python"""
        return self.validate(value)
    
    def to_schema(self) -> dict:
        """Generate JSON schema for this field"""
        return {
            "name": self.name,
            "type": self.field_type.value,
            "default": self.default,
            "required": self.required,
            "description": self.description,
            "indexed": self.indexed,
            "nullable": self.nullable,
        }
    
    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(name={self.name!r}, default={self.default!r})"


class Integer(Field[int]):
    """Integer field type"""
    
    field_type = FieldType.INTEGER
    python_type = int
    
    def __init__(
        self,
        default: Optional[int] = None,
        min_value: Optional[int] = None,
        max_value: Optional[int] = None,
        **kwargs
    ):
        super().__init__(default=default, **kwargs)
        self.min_value = min_value
        self.max_value = max_value
    
    def validate(self, value: Any) -> int:
        if value is None:
            if self.required:
                raise ValueError(f"Field {self.name} is required")
            return self.default  # type: ignore
        
        try:
            int_val = int(value)
        except (TypeError, ValueError):
            raise ValueError(f"Field {self.name} must be an integer, got {type(value)}")
        
        if self.min_value is not None and int_val < self.min_value:
            raise ValueError(f"Field {self.name} must be >= {self.min_value}")
        if self.max_value is not None and int_val > self.max_value:
            raise ValueError(f"Field {self.name} must be <= {self.max_value}")
        
        return int_val
    
    def to_schema(self) -> dict:
        schema = super().to_schema()
        if self.min_value is not None:
            schema["min_value"] = self.min_value
        if self.max_value is not None:
            schema["max_value"] = self.max_value
        return schema


class Float(Field[float]):
    """Float field type"""
    
    field_type = FieldType.FLOAT
    python_type = float
    
    def __init__(
        self,
        default: Optional[float] = None,
        min_value: Optional[float] = None,
        max_value: Optional[float] = None,
        precision: Optional[int] = None,
        **kwargs
    ):
        super().__init__(default=default, **kwargs)
        self.min_value = min_value
        self.max_value = max_value
        self.precision = precision
    
    def validate(self, value: Any) -> float:
        if value is None:
            if self.required:
                raise ValueError(f"Field {self.name} is required")
            return self.default  # type: ignore
        
        try:
            float_val = float(value)
        except (TypeError, ValueError):
            raise ValueError(f"Field {self.name} must be a float, got {type(value)}")
        
        if self.min_value is not None and float_val < self.min_value:
            raise ValueError(f"Field {self.name} must be >= {self.min_value}")
        if self.max_value is not None and float_val > self.max_value:
            raise ValueError(f"Field {self.name} must be <= {self.max_value}")
        
        if self.precision is not None:
            float_val = round(float_val, self.precision)
        
        return float_val
    
    def to_schema(self) -> dict:
        schema = super().to_schema()
        if self.min_value is not None:
            schema["min_value"] = self.min_value
        if self.max_value is not None:
            schema["max_value"] = self.max_value
        if self.precision is not None:
            schema["precision"] = self.precision
        return schema


class String(Field[str]):
    """String field type"""
    
    field_type = FieldType.STRING
    python_type = str
    
    def __init__(
        self,
        default: Optional[str] = None,
        max_length: Optional[int] = None,
        min_length: Optional[int] = None,
        pattern: Optional[str] = None,
        choices: Optional[list[str]] = None,
        **kwargs
    ):
        super().__init__(default=default, **kwargs)
        self.max_length = max_length
        self.min_length = min_length
        self.pattern = pattern
        self.choices = choices
    
    def validate(self, value: Any) -> str:
        if value is None:
            if self.required:
                raise ValueError(f"Field {self.name} is required")
            return self.default  # type: ignore
        
        str_val = str(value)
        
        if self.min_length is not None and len(str_val) < self.min_length:
            raise ValueError(f"Field {self.name} must be at least {self.min_length} characters")
        if self.max_length is not None and len(str_val) > self.max_length:
            raise ValueError(f"Field {self.name} must be at most {self.max_length} characters")
        
        if self.choices is not None and str_val not in self.choices:
            raise ValueError(f"Field {self.name} must be one of {self.choices}")
        
        if self.pattern is not None:
            import re
            if not re.match(self.pattern, str_val):
                raise ValueError(f"Field {self.name} must match pattern {self.pattern}")
        
        return str_val
    
    def to_schema(self) -> dict:
        schema = super().to_schema()
        if self.max_length is not None:
            schema["max_length"] = self.max_length
        if self.min_length is not None:
            schema["min_length"] = self.min_length
        if self.pattern is not None:
            schema["pattern"] = self.pattern
        if self.choices is not None:
            schema["choices"] = self.choices
        return schema


class Boolean(Field[bool]):
    """Boolean field type"""
    
    field_type = FieldType.BOOLEAN
    python_type = bool
    
    def __init__(self, default: Optional[bool] = None, **kwargs):
        super().__init__(default=default, **kwargs)
    
    def validate(self, value: Any) -> bool:
        if value is None:
            if self.required:
                raise ValueError(f"Field {self.name} is required")
            return self.default  # type: ignore
        
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            if value.lower() in ('true', '1', 'yes', 'on'):
                return True
            if value.lower() in ('false', '0', 'no', 'off'):
                return False
        if isinstance(value, (int, float)):
            return bool(value)
        
        raise ValueError(f"Field {self.name} must be a boolean, got {type(value)}")


class List(Field[list]):
    """List/Array field type"""
    
    field_type = FieldType.LIST
    python_type = list
    
    def __init__(
        self,
        item_type: Optional[Field] = None,
        default: Optional[list] = None,
        max_items: Optional[int] = None,
        min_items: Optional[int] = None,
        **kwargs
    ):
        super().__init__(default=default or [], **kwargs)
        self.item_type = item_type
        self.max_items = max_items
        self.min_items = min_items
    
    def validate(self, value: Any) -> list:
        if value is None:
            if self.required:
                raise ValueError(f"Field {self.name} is required")
            return self.default.copy() if self.default else []
        
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                raise ValueError(f"Field {self.name} must be a list, got string")
        
        if not isinstance(value, (list, tuple)):
            raise ValueError(f"Field {self.name} must be a list, got {type(value)}")
        
        result = list(value)
        
        if self.min_items is not None and len(result) < self.min_items:
            raise ValueError(f"Field {self.name} must have at least {self.min_items} items")
        if self.max_items is not None and len(result) > self.max_items:
            raise ValueError(f"Field {self.name} must have at most {self.max_items} items")
        
        if self.item_type is not None:
            result = [self.item_type.validate(item) for item in result]
        
        return result
    
    def to_otel_value(self, value: list) -> str:
        """Lists are serialized as JSON strings in OTel"""
        return json.dumps(value)
    
    def from_otel_value(self, value: Any) -> list:
        if isinstance(value, str):
            return json.loads(value)
        return self.validate(value)
    
    def to_schema(self) -> dict:
        schema = super().to_schema()
        if self.item_type is not None:
            schema["item_type"] = self.item_type.field_type.value
        if self.max_items is not None:
            schema["max_items"] = self.max_items
        if self.min_items is not None:
            schema["min_items"] = self.min_items
        return schema


class Dict(Field[dict]):
    """Dictionary/Map field type"""
    
    field_type = FieldType.DICT
    python_type = dict
    
    def __init__(
        self,
        default: Optional[dict] = None,
        schema: Optional[dict[str, Field]] = None,
        **kwargs
    ):
        super().__init__(default=default or {}, **kwargs)
        self.schema = schema
    
    def validate(self, value: Any) -> dict:
        if value is None:
            if self.required:
                raise ValueError(f"Field {self.name} is required")
            return self.default.copy() if self.default else {}
        
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                raise ValueError(f"Field {self.name} must be a dict, got string")
        
        if not isinstance(value, dict):
            raise ValueError(f"Field {self.name} must be a dict, got {type(value)}")
        
        result = dict(value)
        
        if self.schema is not None:
            for key, field in self.schema.items():
                if key in result:
                    result[key] = field.validate(result[key])
                elif field.required:
                    raise ValueError(f"Field {self.name}.{key} is required")
        
        return result
    
    def to_otel_value(self, value: dict) -> str:
        """Dicts are serialized as JSON strings in OTel"""
        return json.dumps(value)
    
    def from_otel_value(self, value: Any) -> dict:
        if isinstance(value, str):
            return json.loads(value)
        return self.validate(value)


class Timestamp(Field[datetime]):
    """Timestamp/DateTime field type"""
    
    field_type = FieldType.TIMESTAMP
    python_type = datetime
    
    def __init__(
        self,
        default: Optional[datetime] = None,
        auto_now: bool = False,
        auto_now_add: bool = False,
        **kwargs
    ):
        super().__init__(default=default, **kwargs)
        self.auto_now = auto_now
        self.auto_now_add = auto_now_add
    
    def validate(self, value: Any) -> datetime:
        if value is None:
            if self.auto_now or self.auto_now_add:
                return datetime.utcnow()
            if self.required:
                raise ValueError(f"Field {self.name} is required")
            return self.default  # type: ignore
        
        if isinstance(value, datetime):
            return value
        
        if isinstance(value, str):
            from dateutil.parser import parse
            try:
                return parse(value)
            except Exception:
                raise ValueError(f"Field {self.name} must be a valid datetime string")
        
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value)
        
        raise ValueError(f"Field {self.name} must be a datetime, got {type(value)}")
    
    def to_otel_value(self, value: datetime) -> str:
        """Timestamps are serialized as ISO format strings"""
        return value.isoformat()
    
    def from_otel_value(self, value: Any) -> datetime:
        if isinstance(value, str):
            from dateutil.parser import parse
            return parse(value)
        return self.validate(value)


class Reference(Field[str]):
    """
    Reference to another TriLog Object.
    
    Stores the object ID as a string, enabling foreign-key-like
    relationships between objects.
    """
    
    field_type = FieldType.REFERENCE
    python_type = str
    
    def __init__(
        self,
        ref_type: Union[str, Type] = None,
        default: Optional[str] = None,
        **kwargs
    ):
        super().__init__(default=default, **kwargs)
        self.ref_type = ref_type
    
    def validate(self, value: Any) -> str:
        if value is None:
            if self.required:
                raise ValueError(f"Field {self.name} is required")
            return self.default  # type: ignore
        
        # If it's an Object instance, get its ID
        if hasattr(value, '__trilog_id__'):
            return value.__trilog_id__
        
        return str(value)
    
    def to_schema(self) -> dict:
        schema = super().to_schema()
        if self.ref_type is not None:
            if isinstance(self.ref_type, str):
                schema["ref_type"] = self.ref_type
            else:
                schema["ref_type"] = self.ref_type.__name__
        return schema
