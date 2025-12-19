"""
TriLog DSL Base Classes

Provides the fundamental building blocks for schema definition:
- Object: Represents entities with state
- Process: Represents workflows/distributed processes
"""

from __future__ import annotations

from abc import ABCMeta
from datetime import datetime
from typing import Any, Dict, Iterator, List, Optional, Type, TypeVar, ClassVar
from uuid import uuid4
import json

from trilog.dsl.fields import Field, Timestamp


T = TypeVar('T', bound='Object')


class TriLogMeta(ABCMeta):
    """
    Metaclass for TriLog schema classes.
    
    Automatically discovers Field instances defined on classes and
    maintains a registry of all defined schemas.
    """
    
    _registry: Dict[str, Type] = {}
    
    def __new__(
        mcs,
        name: str,
        bases: tuple,
        namespace: dict,
        **kwargs
    ) -> TriLogMeta:
        # Collect fields from the class namespace
        fields: Dict[str, Field] = {}
        
        # Inherit fields from parent classes
        for base in bases:
            if hasattr(base, '__trilog_fields__'):
                fields.update(base.__trilog_fields__)
        
        # Discover new fields in this class
        for key, value in namespace.items():
            if isinstance(value, Field):
                value.name = key
                fields[key] = value
        
        # Store fields on the class
        namespace['__trilog_fields__'] = fields
        namespace['__trilog_type__'] = name
        
        # Create the class
        cls = super().__new__(mcs, name, bases, namespace, **kwargs)
        
        # Register in global registry (skip base classes)
        if name not in ('Object', 'Process'):
            mcs._registry[name] = cls
        
        return cls
    
    @classmethod
    def get_registered(mcs) -> Dict[str, Type]:
        """Get all registered schema types"""
        return dict(mcs._registry)


class Object(metaclass=TriLogMeta):
    """
    Base class for TriLog entities (the "Blueprint").
    
    Objects represent stateful entities in your system that you want
    to track over time. Each Object instance has a unique ID and
    can be reconstructed from its event history.
    
    Example:
        class ShoppingCart(Object):
            item_count = Integer(default=0)
            total_value = Float(default=0.0)
            
        cart = ShoppingCart(obj_id="cart_123")
        cart.item_count = 5
    """
    
    # Class-level attributes set by metaclass
    __trilog_fields__: ClassVar[Dict[str, Field]]
    __trilog_type__: ClassVar[str]
    
    def __init__(self, obj_id: Optional[str] = None, **kwargs):
        """
        Initialize a new Object instance.
        
        Args:
            obj_id: Unique identifier for this object. Auto-generated if not provided.
            **kwargs: Initial field values
        """
        self.__trilog_id__ = obj_id or str(uuid4())
        self.__trilog_version__ = 0
        self.__trilog_created_at__ = datetime.utcnow()
        self.__trilog_updated_at__ = datetime.utcnow()
        
        # Initialize fields with defaults or provided values
        for name, field in self.__trilog_fields__.items():
            if name in kwargs:
                setattr(self, name, kwargs[name])
            elif field.default is not None:
                setattr(self, name, field.default)
    
    @property
    def id(self) -> str:
        """Get the object's unique ID"""
        return self.__trilog_id__
    
    @property
    def version(self) -> int:
        """Get the current version number"""
        return self.__trilog_version__
    
    @classmethod
    def get_fields(cls) -> Dict[str, Field]:
        """Get all fields defined on this class"""
        return cls.__trilog_fields__
    
    @classmethod
    def get_type_name(cls) -> str:
        """Get the type name for this class"""
        return cls.__trilog_type__
    
    @classmethod
    def get_otel_prefix(cls) -> str:
        """
        Get the OpenTelemetry attribute prefix for this type.
        
        Uses lowercase snake_case of the class name.
        """
        name = cls.__trilog_type__
        # Convert CamelCase to snake_case
        import re
        s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
        return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()
    
    def apply_change(self, attributes: Dict[str, Any]) -> None:
        """
        Apply a change event to this object.
        
        This is the core method for "replaying" events onto an object
        to reconstruct its state.
        
        Args:
            attributes: Dict of attribute changes from an event
        """
        prefix = self.get_otel_prefix() + "."
        
        for key, value in attributes.items():
            # Handle both prefixed and unprefixed keys
            if key.startswith(prefix):
                field_name = key[len(prefix):]
            elif key.startswith("trilog."):
                continue  # Skip trilog metadata
            else:
                field_name = key
            
            # Only apply if it's a known field
            if field_name in self.__trilog_fields__:
                field = self.__trilog_fields__[field_name]
                setattr(self, field_name, field.from_otel_value(value))
        
        self.__trilog_version__ += 1
        self.__trilog_updated_at__ = datetime.utcnow()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert object state to a dictionary"""
        result = {
            "__id__": self.__trilog_id__,
            "__type__": self.__trilog_type__,
            "__version__": self.__trilog_version__,
            "__created_at__": self.__trilog_created_at__.isoformat(),
            "__updated_at__": self.__trilog_updated_at__.isoformat(),
        }
        
        for name, field in self.__trilog_fields__.items():
            value = getattr(self, name, field.default)
            result[name] = value
        
        return result
    
    def to_otel_attributes(self) -> Dict[str, Any]:
        """
        Convert object state to OpenTelemetry-compatible attributes.
        
        Keys are prefixed with the object type (e.g., "shopping_cart.item_count")
        """
        prefix = self.get_otel_prefix()
        result = {
            "trilog.obj.id": self.__trilog_id__,
            "trilog.obj.type": self.__trilog_type__,
            "trilog.obj.version": self.__trilog_version__,
        }
        
        for name, field in self.__trilog_fields__.items():
            value = getattr(self, name, field.default)
            if value is not None:
                result[f"{prefix}.{name}"] = field.to_otel_value(value)
        
        return result
    
    def diff(self, other: Object) -> Dict[str, tuple]:
        """
        Calculate the difference between this object and another.
        
        Returns:
            Dict mapping field names to (old_value, new_value) tuples
        """
        if not isinstance(other, self.__class__):
            raise TypeError(f"Cannot diff {self.__class__} with {type(other)}")
        
        changes = {}
        for name in self.__trilog_fields__:
            old_val = getattr(self, name, None)
            new_val = getattr(other, name, None)
            if old_val != new_val:
                changes[name] = (old_val, new_val)
        
        return changes
    
    @classmethod
    def from_dict(cls: Type[T], data: Dict[str, Any]) -> T:
        """Create an object instance from a dictionary"""
        obj_id = data.pop("__id__", None)
        data.pop("__type__", None)
        version = data.pop("__version__", 0)
        created_at = data.pop("__created_at__", None)
        updated_at = data.pop("__updated_at__", None)
        
        # Filter to only known fields
        fields = {k: v for k, v in data.items() if k in cls.__trilog_fields__}
        
        instance = cls(obj_id=obj_id, **fields)
        instance.__trilog_version__ = version
        
        if created_at:
            from dateutil.parser import parse
            instance.__trilog_created_at__ = parse(created_at)
        if updated_at:
            from dateutil.parser import parse
            instance.__trilog_updated_at__ = parse(updated_at)
        
        return instance
    
    @classmethod
    def schema(cls) -> Dict[str, Any]:
        """Generate the JSON schema for this object type"""
        return {
            "type": "object",
            "name": cls.__trilog_type__,
            "prefix": cls.get_otel_prefix(),
            "description": cls.__doc__ or "",
            "fields": {
                name: field.to_schema()
                for name, field in cls.__trilog_fields__.items()
            }
        }
    
    def __repr__(self) -> str:
        fields_str = ", ".join(
            f"{name}={getattr(self, name, None)!r}"
            for name in list(self.__trilog_fields__.keys())[:3]
        )
        if len(self.__trilog_fields__) > 3:
            fields_str += ", ..."
        return f"{self.__class__.__name__}(id={self.__trilog_id__!r}, {fields_str})"
    
    def __eq__(self, other: Any) -> bool:
        if not isinstance(other, self.__class__):
            return False
        return self.__trilog_id__ == other.__trilog_id__
    
    def __hash__(self) -> int:
        return hash(self.__trilog_id__)


class Process(metaclass=TriLogMeta):
    """
    Base class for TriLog workflows/processes.
    
    Processes represent distributed workflows or multi-step operations
    that span multiple objects and services. They are tied to OTel
    Trace IDs rather than Object IDs.
    
    Example:
        class CheckoutFlow(Process):
            '''E-commerce checkout workflow'''
            pass
            
        class PaymentProcess(Process):
            '''Payment processing sub-workflow'''
            pass
    """
    
    # Class-level attributes set by metaclass
    __trilog_fields__: ClassVar[Dict[str, Field]]
    __trilog_type__: ClassVar[str]
    
    # Process-specific attributes
    steps: ClassVar[List[str]] = []
    timeout_seconds: ClassVar[int] = 3600
    
    def __init__(self, trace_id: Optional[str] = None, **kwargs):
        """
        Initialize a new Process instance.
        
        Args:
            trace_id: OTel Trace ID for this process
            **kwargs: Initial field values
        """
        self.__trilog_trace_id__ = trace_id or str(uuid4())
        self.__trilog_started_at__ = datetime.utcnow()
        self.__trilog_status__ = "started"
        self.__trilog_step_history__: List[Dict] = []
        
        # Initialize any fields
        for name, field in self.__trilog_fields__.items():
            if name in kwargs:
                setattr(self, name, kwargs[name])
            elif field.default is not None:
                setattr(self, name, field.default)
    
    @property
    def trace_id(self) -> str:
        """Get the process trace ID"""
        return self.__trilog_trace_id__
    
    @property
    def status(self) -> str:
        """Get the current process status"""
        return self.__trilog_status__
    
    def record_step(self, step_name: str, data: Optional[Dict] = None) -> None:
        """Record a step in the process history"""
        self.__trilog_step_history__.append({
            "step": step_name,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data or {}
        })
    
    def complete(self, result: Optional[Dict] = None) -> None:
        """Mark the process as completed"""
        self.__trilog_status__ = "completed"
        self.__trilog_completed_at__ = datetime.utcnow()
        self.__trilog_result__ = result
    
    def fail(self, error: str) -> None:
        """Mark the process as failed"""
        self.__trilog_status__ = "failed"
        self.__trilog_completed_at__ = datetime.utcnow()
        self.__trilog_error__ = error
    
    @classmethod
    def get_type_name(cls) -> str:
        """Get the type name for this process"""
        return cls.__trilog_type__
    
    @classmethod
    def schema(cls) -> Dict[str, Any]:
        """Generate the JSON schema for this process type"""
        return {
            "type": "process",
            "name": cls.__trilog_type__,
            "description": cls.__doc__ or "",
            "steps": cls.steps,
            "timeout_seconds": cls.timeout_seconds,
            "fields": {
                name: field.to_schema()
                for name, field in cls.__trilog_fields__.items()
            }
        }
    
    def to_otel_attributes(self) -> Dict[str, Any]:
        """Convert process state to OpenTelemetry attributes"""
        return {
            "trilog.process.type": self.__trilog_type__,
            "trilog.process.status": self.__trilog_status__,
            "trilog.process.started_at": self.__trilog_started_at__.isoformat(),
        }
    
    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(trace_id={self.__trilog_trace_id__!r}, status={self.__trilog_status__!r})"
