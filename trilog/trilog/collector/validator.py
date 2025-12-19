"""
TriLog Log Validator

Validates incoming logs against the TriLog registry schema.
This can be used both server-side (in a custom processor) and
client-side (before sending logs).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Set
import json
import re

from trilog.dsl.registry import Registry


class ValidationSeverity(str, Enum):
    """Severity levels for validation issues"""
    ERROR = "error"      # Must be fixed, log may be rejected
    WARNING = "warning"  # Should be fixed, log is accepted
    INFO = "info"        # Informational, no action needed


@dataclass
class ValidationIssue:
    """A single validation issue"""
    severity: ValidationSeverity
    code: str
    message: str
    attribute: Optional[str] = None
    expected: Optional[Any] = None
    actual: Optional[Any] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        result = {
            "severity": self.severity.value,
            "code": self.code,
            "message": self.message,
        }
        if self.attribute:
            result["attribute"] = self.attribute
        if self.expected is not None:
            result["expected"] = self.expected
        if self.actual is not None:
            result["actual"] = self.actual
        return result


@dataclass
class ValidationResult:
    """Result of validating a log record"""
    valid: bool
    issues: List[ValidationIssue] = field(default_factory=list)
    validated_at: datetime = field(default_factory=datetime.utcnow)
    
    @property
    def errors(self) -> List[ValidationIssue]:
        """Get only error-level issues"""
        return [i for i in self.issues if i.severity == ValidationSeverity.ERROR]
    
    @property
    def warnings(self) -> List[ValidationIssue]:
        """Get only warning-level issues"""
        return [i for i in self.issues if i.severity == ValidationSeverity.WARNING]
    
    def add_error(self, code: str, message: str, **kwargs) -> None:
        """Add an error issue"""
        self.issues.append(ValidationIssue(
            severity=ValidationSeverity.ERROR,
            code=code,
            message=message,
            **kwargs
        ))
        self.valid = False
    
    def add_warning(self, code: str, message: str, **kwargs) -> None:
        """Add a warning issue"""
        self.issues.append(ValidationIssue(
            severity=ValidationSeverity.WARNING,
            code=code,
            message=message,
            **kwargs
        ))
    
    def add_info(self, code: str, message: str, **kwargs) -> None:
        """Add an info issue"""
        self.issues.append(ValidationIssue(
            severity=ValidationSeverity.INFO,
            code=code,
            message=message,
            **kwargs
        ))
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "valid": self.valid,
            "validated_at": self.validated_at.isoformat(),
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
            "issues": [i.to_dict() for i in self.issues],
        }


class LogValidator:
    """
    Validates log records against a TriLog registry.
    
    The validator checks:
    - Required attributes are present
    - Attribute keys match the registry schema
    - Attribute values match expected types
    - Object references are valid
    
    Example:
        validator = LogValidator(registry)
        
        result = validator.validate({
            "trilog.obj.id": "cart_123",
            "trilog.obj.type": "ShoppingCart",
            "shopping_cart.item_count": 5,
        })
        
        if not result.valid:
            for error in result.errors:
                print(f"Error: {error.message}")
    """
    
    def __init__(
        self,
        registry: Registry,
        strict: bool = False,
        allow_extra_attributes: bool = True,
    ):
        """
        Initialize the validator.
        
        Args:
            registry: The TriLog registry to validate against
            strict: If True, warnings become errors
            allow_extra_attributes: If True, unknown attributes are warnings not errors
        """
        self.registry = registry
        self.strict = strict
        self.allow_extra_attributes = allow_extra_attributes
        
        # Build lookup tables
        self._expected_keys = registry.get_expected_keys()
        self._object_prefixes = {
            obj_cls.get_otel_prefix(): obj_cls
            for obj_cls in registry.get_all_objects().values()
        }
    
    def validate(self, attributes: Dict[str, Any]) -> ValidationResult:
        """
        Validate a set of log attributes.
        
        Args:
            attributes: Dictionary of OTel attributes
        
        Returns:
            ValidationResult with any issues found
        """
        result = ValidationResult(valid=True)
        
        # Check required attributes
        self._check_required(attributes, result)
        
        # Check for unknown attributes
        self._check_unknown(attributes, result)
        
        # Check attribute types
        self._check_types(attributes, result)
        
        # Check object-specific validation
        self._check_object_specific(attributes, result)
        
        # In strict mode, warnings become errors
        if self.strict:
            for issue in result.issues:
                if issue.severity == ValidationSeverity.WARNING:
                    issue.severity = ValidationSeverity.ERROR
                    result.valid = False
        
        return result
    
    def _check_required(self, attributes: Dict[str, Any], result: ValidationResult) -> None:
        """Check that required attributes are present"""
        # trilog.obj.id is required for object logs
        if "trilog.obj.type" in attributes:
            if "trilog.obj.id" not in attributes:
                result.add_error(
                    "MISSING_OBJ_ID",
                    "trilog.obj.id is required when trilog.obj.type is present",
                    attribute="trilog.obj.id"
                )
        
        # If obj_id is present, obj_type should be too
        if "trilog.obj.id" in attributes:
            if "trilog.obj.type" not in attributes:
                result.add_warning(
                    "MISSING_OBJ_TYPE",
                    "trilog.obj.type should be present when trilog.obj.id is set",
                    attribute="trilog.obj.type"
                )
    
    def _check_unknown(self, attributes: Dict[str, Any], result: ValidationResult) -> None:
        """Check for unknown attributes"""
        for key in attributes:
            # Skip non-trilog attributes
            is_trilog = key.startswith("trilog.")
            is_object = any(key.startswith(f"{p}.") for p in self._object_prefixes)
            
            if not is_trilog and not is_object:
                continue
            
            if key not in self._expected_keys:
                if self.allow_extra_attributes:
                    result.add_warning(
                        "UNKNOWN_ATTRIBUTE",
                        f"Attribute '{key}' is not in the registry",
                        attribute=key
                    )
                else:
                    result.add_error(
                        "UNKNOWN_ATTRIBUTE",
                        f"Attribute '{key}' is not in the registry",
                        attribute=key
                    )
    
    def _check_types(self, attributes: Dict[str, Any], result: ValidationResult) -> None:
        """Check attribute value types"""
        obj_type_name = attributes.get("trilog.obj.type")
        if not obj_type_name:
            return
        
        obj_cls = self.registry.get_object(obj_type_name)
        if not obj_cls:
            result.add_error(
                "UNKNOWN_OBJECT_TYPE",
                f"Object type '{obj_type_name}' is not in the registry",
                attribute="trilog.obj.type",
                actual=obj_type_name
            )
            return
        
        prefix = obj_cls.get_otel_prefix()
        fields = obj_cls.get_fields()
        
        for key, value in attributes.items():
            if not key.startswith(f"{prefix}."):
                continue
            
            field_name = key[len(prefix) + 1:]
            if field_name not in fields:
                continue
            
            field_def = fields[field_name]
            
            # Try to validate the value
            try:
                field_def.validate(value)
            except ValueError as e:
                result.add_error(
                    "INVALID_VALUE",
                    f"Invalid value for {key}: {e}",
                    attribute=key,
                    actual=value
                )
    
    def _check_object_specific(self, attributes: Dict[str, Any], result: ValidationResult) -> None:
        """Run object-specific validation rules"""
        obj_type_name = attributes.get("trilog.obj.type")
        if not obj_type_name:
            return
        
        obj_cls = self.registry.get_object(obj_type_name)
        if not obj_cls:
            return
        
        prefix = obj_cls.get_otel_prefix()
        fields = obj_cls.get_fields()
        
        # Check that required fields have values
        for field_name, field_def in fields.items():
            key = f"{prefix}.{field_name}"
            if field_def.required and key not in attributes:
                result.add_warning(
                    "MISSING_REQUIRED_FIELD",
                    f"Required field '{field_name}' is not present",
                    attribute=key
                )


class BatchValidator:
    """
    Validates batches of log records efficiently.
    
    Useful for validating logs before sending to the collector.
    """
    
    def __init__(self, registry: Registry, **kwargs):
        self.validator = LogValidator(registry, **kwargs)
        self._stats = {
            "total": 0,
            "valid": 0,
            "invalid": 0,
            "errors": 0,
            "warnings": 0,
        }
    
    def validate_batch(
        self,
        records: List[Dict[str, Any]]
    ) -> List[ValidationResult]:
        """
        Validate a batch of log records.
        
        Args:
            records: List of attribute dictionaries
        
        Returns:
            List of ValidationResult for each record
        """
        results = []
        for record in records:
            result = self.validator.validate(record)
            results.append(result)
            
            # Update stats
            self._stats["total"] += 1
            if result.valid:
                self._stats["valid"] += 1
            else:
                self._stats["invalid"] += 1
            self._stats["errors"] += len(result.errors)
            self._stats["warnings"] += len(result.warnings)
        
        return results
    
    def get_stats(self) -> Dict[str, int]:
        """Get validation statistics"""
        return dict(self._stats)
    
    def reset_stats(self) -> None:
        """Reset validation statistics"""
        for key in self._stats:
            self._stats[key] = 0
