"""
Tests for TriLog DSL module.

Tests cover:
- Field types and validation
- Object and Process definitions
- Registry operations and export
"""

import pytest
import json
import tempfile
from datetime import datetime

from trilog.dsl import (
    Object, Process, Registry,
    Integer, Float, String, Boolean, List, Dict, Timestamp, Reference,
)


# =============================================================================
# TEST FIXTURES
# =============================================================================

class SimpleObject(Object):
    """Simple test object."""
    name = String(required=True)
    count = Integer(default=0)
    value = Float(default=0.0)
    active = Boolean(default=True)


class ComplexObject(Object):
    """Complex test object with all field types."""
    title = String(required=True)
    quantity = Integer(default=0, min_value=0, max_value=1000)
    price = Float(default=0.0)
    enabled = Boolean(default=False)
    tags = List(default=[])
    metadata = Dict(default={})
    created_at = Timestamp()
    parent_id = Reference("ParentObject")


class SimpleProcess(Process):
    """Simple test process."""
    phases = ["init", "running", "complete"]
    
    task_name = String(default="")
    progress = Integer(default=0)


class OrderProcess(Process):
    """Order workflow process."""
    phases = ["pending", "processing", "shipped", "delivered", "cancelled"]
    
    order_id = Reference("Order")
    customer_id = Reference("Customer")
    item_count = Integer(default=0)
    total_amount = Float(default=0.0)


# =============================================================================
# FIELD TESTS
# =============================================================================

class TestFields:
    """Test field types and validation."""
    
    def test_integer_field(self):
        field = Integer(default=10, min_value=0, max_value=100)
        assert field.default == 10
        assert field.validate(50) == 50
        
    def test_integer_validation(self):
        field = Integer(min_value=0, max_value=100)
        with pytest.raises(ValueError):
            field.validate(-1)
        with pytest.raises(ValueError):
            field.validate(101)
    
    def test_float_field(self):
        field = Float(default=3.14)
        assert field.default == 3.14
        assert field.validate(2.5) == 2.5
    
    def test_string_field(self):
        field = String(default="hello")
        assert field.default == "hello"
        assert field.validate("world") == "world"
    
    def test_string_max_length(self):
        field = String(max_length=5)
        assert field.validate("hi") == "hi"
        with pytest.raises(ValueError):
            field.validate("toolong")
    
    def test_boolean_field(self):
        field = Boolean(default=True)
        assert field.default is True
        assert field.validate(False) is False
    
    def test_list_field(self):
        field = List(default=[1, 2, 3])
        assert field.default == [1, 2, 3]
        assert field.validate([4, 5]) == [4, 5]
    
    def test_dict_field(self):
        field = Dict(default={"a": 1})
        assert field.default == {"a": 1}
        assert field.validate({"b": 2}) == {"b": 2}
    
    def test_timestamp_field(self):
        field = Timestamp()
        now = datetime.utcnow()
        assert field.validate(now) == now
    
    def test_reference_field(self):
        field = Reference("OtherObject")
        assert field.target_type == "OtherObject"
        assert field.validate("ref_123") == "ref_123"
    
    def test_required_field(self):
        field = String(required=True)
        assert field.required is True
        with pytest.raises(ValueError):
            field.validate(None)


# =============================================================================
# OBJECT TESTS
# =============================================================================

class TestObject:
    """Test Object base class."""
    
    def test_object_creation(self):
        obj = SimpleObject()
        assert obj.count == 0
        assert obj.value == 0.0
        assert obj.active is True
    
    def test_object_with_values(self):
        obj = SimpleObject()
        obj.name = "Test"
        obj.count = 5
        assert obj.name == "Test"
        assert obj.count == 5
    
    def test_object_to_dict(self):
        obj = SimpleObject()
        obj.name = "Test"
        obj.count = 10
        
        data = obj.to_dict()
        assert data["name"] == "Test"
        assert data["count"] == 10
    
    def test_object_apply_change(self):
        obj = SimpleObject()
        obj.name = "Initial"
        
        obj.apply_change({"name": "Updated", "count": 42})
        assert obj.name == "Updated"
        assert obj.count == 42
    
    def test_object_fields_discovery(self):
        assert "name" in SimpleObject._fields
        assert "count" in SimpleObject._fields
        assert "value" in SimpleObject._fields
        assert "active" in SimpleObject._fields
    
    def test_object_otel_prefix(self):
        # CamelCase to snake_case
        assert SimpleObject._otel_prefix == "simple_object"
        assert ComplexObject._otel_prefix == "complex_object"
    
    def test_complex_object_fields(self):
        obj = ComplexObject()
        obj.title = "Test Item"
        obj.tags = ["a", "b", "c"]
        obj.metadata = {"key": "value"}
        
        assert obj.tags == ["a", "b", "c"]
        assert obj.metadata["key"] == "value"


# =============================================================================
# PROCESS TESTS
# =============================================================================

class TestProcess:
    """Test Process base class."""
    
    def test_process_phases(self):
        assert SimpleProcess.phases == ["init", "running", "complete"]
        assert OrderProcess.phases == ["pending", "processing", "shipped", "delivered", "cancelled"]
    
    def test_process_creation(self):
        proc = SimpleProcess()
        assert proc.task_name == ""
        assert proc.progress == 0
    
    def test_process_fields(self):
        assert "task_name" in SimpleProcess._fields
        assert "progress" in SimpleProcess._fields
        assert "order_id" in OrderProcess._fields


# =============================================================================
# REGISTRY TESTS
# =============================================================================

class TestRegistry:
    """Test Registry operations."""
    
    def test_registry_register(self):
        registry = Registry()
        registry.register(SimpleObject)
        
        assert "SimpleObject" in registry._schemas
    
    def test_registry_register_process(self):
        registry = Registry()
        registry.register(SimpleProcess)
        
        assert "SimpleProcess" in registry._schemas
    
    def test_registry_get(self):
        registry = Registry()
        registry.register(SimpleObject)
        
        retrieved = registry.get("SimpleObject")
        assert retrieved is SimpleObject
    
    def test_registry_get_unknown(self):
        registry = Registry()
        assert registry.get("Unknown") is None
    
    def test_registry_export_json(self):
        registry = Registry()
        registry.register(SimpleObject)
        registry.register(SimpleProcess)
        
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            registry.export(f.name)
            
            with open(f.name) as rf:
                data = json.load(rf)
        
        assert "objects" in data
        assert "processes" in data
        assert "SimpleObject" in data["objects"]
        assert "SimpleProcess" in data["processes"]
    
    def test_registry_schema_export(self):
        registry = Registry()
        registry.register(ComplexObject)
        
        schema = registry.get_schema("ComplexObject")
        assert schema is not None
        assert "fields" in schema
        assert "title" in schema["fields"]
    
    def test_registry_validate(self):
        registry = Registry()
        registry.register(SimpleObject)
        
        valid_data = {"name": "Test", "count": 5}
        invalid_data = {"count": "not a number"}  # Missing required 'name'
        
        # Valid data should pass
        errors = registry.validate("SimpleObject", valid_data)
        # Should have no critical errors for name (it's present)
        
    def test_registry_to_otel_config(self):
        registry = Registry()
        registry.register(SimpleObject)
        
        config = registry.to_otel_config()
        assert "attributes" in config
    
    def test_registry_checksum(self):
        registry1 = Registry()
        registry1.register(SimpleObject)
        
        registry2 = Registry()
        registry2.register(SimpleObject)
        
        # Same content should have same checksum
        assert registry1.compute_checksum() == registry2.compute_checksum()


# =============================================================================
# INTEGRATION TESTS
# =============================================================================

class TestIntegration:
    """Integration tests for DSL components."""
    
    def test_full_workflow(self):
        """Test complete workflow from definition to export."""
        
        # Define schema
        class ShoppingCart(Object):
            customer_id = String(required=True)
            item_count = Integer(default=0)
            total_value = Float(default=0.0)
            items = List(default=[])
        
        class CheckoutProcess(Process):
            phases = ["cart", "payment", "confirmation", "complete"]
            
            cart_id = Reference("ShoppingCart")
            payment_method = String(default="")
            amount = Float(default=0.0)
        
        # Create registry
        registry = Registry()
        registry.register(ShoppingCart)
        registry.register(CheckoutProcess)
        
        # Create instances
        cart = ShoppingCart()
        cart.customer_id = "cust_123"
        cart.apply_change({"item_count": 3, "total_value": 99.99})
        
        assert cart.item_count == 3
        assert cart.total_value == 99.99
        
        # Export registry
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            registry.export(f.name)
            
            with open(f.name) as rf:
                data = json.load(rf)
        
        assert "ShoppingCart" in data["objects"]
        assert "CheckoutProcess" in data["processes"]
        assert data["processes"]["CheckoutProcess"]["phases"] == ["cart", "payment", "confirmation", "complete"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
