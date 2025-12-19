"""
Pytest configuration and fixtures for TriLog tests.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock

from trilog.dsl import Object, Process, Registry, String, Integer, Float, List


# =============================================================================
# COMMON TEST OBJECTS
# =============================================================================

class SampleObject(Object):
    """Sample object for testing."""
    name = String(required=True)
    count = Integer(default=0)
    value = Float(default=0.0)
    tags = List(default=[])


class SampleProcess(Process):
    """Sample process for testing."""
    phases = ["init", "running", "complete", "failed"]
    
    task_id = String(default="")
    progress = Integer(default=0)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def sample_object():
    """Create a sample object instance."""
    obj = SampleObject()
    obj.name = "Test Object"
    obj.count = 10
    return obj


@pytest.fixture
def sample_registry():
    """Create a pre-configured registry."""
    registry = Registry()
    registry.register(SampleObject)
    registry.register(SampleProcess)
    return registry


@pytest.fixture
def mock_clickhouse_client():
    """Create a mock ClickHouse client."""
    client = Mock()
    client.execute.return_value = []
    return client


@pytest.fixture
def sample_events():
    """Create sample timeline events."""
    from trilog.engine.timeline import TimelineEvent
    
    base_time = datetime(2024, 1, 1, 12, 0, 0)
    
    return [
        TimelineEvent(
            timestamp=base_time,
            event_type="state_change",
            obj_id="test_obj",
            obj_type="SampleObject",
            attributes={"count": 0},
        ),
        TimelineEvent(
            timestamp=base_time + timedelta(minutes=5),
            event_type="state_change",
            obj_id="test_obj",
            obj_type="SampleObject",
            attributes={"count": 5},
        ),
        TimelineEvent(
            timestamp=base_time + timedelta(minutes=10),
            event_type="state_change",
            obj_id="test_obj",
            obj_type="SampleObject",
            attributes={"count": 10},
        ),
    ]


@pytest.fixture
def timeline(sample_events):
    """Create a timeline from sample events."""
    from trilog.engine.timeline import Timeline
    return Timeline(sample_events)


# =============================================================================
# PYTEST CONFIGURATION
# =============================================================================

def pytest_configure(config):
    """Configure pytest markers."""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests"
    )
