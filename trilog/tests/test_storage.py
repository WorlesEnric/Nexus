"""
Tests for TriLog Storage and Reconstruction modules.

Tests cover:
- ClickHouse schema definitions
- Query building
- Timeline analysis
- Digital Twin reconstruction
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, MagicMock, patch
import json

from trilog.dsl import Object, String, Integer, Float, Registry
from trilog.storage.schema import (
    TableSchema, Column,
    TRILOG_EVENTS_SCHEMA, TRILOG_SNAPSHOTS_SCHEMA,
    get_init_sql,
)
from trilog.engine.query import TimelineQuery, QueryBuilder, TimeRange
from trilog.engine.timeline import (
    Timeline, TimelineEvent, StateTransition, TransitionType,
    compute_diff, merge_timelines,
)
from trilog.engine.reconstructor import (
    Reconstructor, ReconstructionResult, ReconstructionStrategy,
)


# =============================================================================
# TEST FIXTURES
# =============================================================================

class TestCart(Object):
    """Test shopping cart object."""
    item_count = Integer(default=0)
    total_value = Float(default=0.0)
    customer_id = String(default="")


def create_mock_events():
    """Create mock timeline events for testing."""
    base_time = datetime(2024, 1, 1, 12, 0, 0)
    
    return [
        TimelineEvent(
            timestamp=base_time,
            event_type="state_change",
            obj_id="cart_1",
            obj_type="TestCart",
            attributes={"item_count": 0, "total_value": 0.0},
        ),
        TimelineEvent(
            timestamp=base_time + timedelta(minutes=5),
            event_type="state_change",
            obj_id="cart_1",
            obj_type="TestCart",
            attributes={"item_count": 2, "total_value": 29.99},
        ),
        TimelineEvent(
            timestamp=base_time + timedelta(minutes=10),
            event_type="state_change",
            obj_id="cart_1",
            obj_type="TestCart",
            attributes={"item_count": 3, "total_value": 49.99},
        ),
        TimelineEvent(
            timestamp=base_time + timedelta(minutes=15),
            event_type="state_change",
            obj_id="cart_1",
            obj_type="TestCart",
            attributes={"item_count": 1, "total_value": 19.99},
        ),
    ]


# =============================================================================
# SCHEMA TESTS
# =============================================================================

class TestSchema:
    """Test ClickHouse schema definitions."""
    
    def test_events_schema_exists(self):
        assert TRILOG_EVENTS_SCHEMA is not None
        assert TRILOG_EVENTS_SCHEMA.name == "trilog_events"
    
    def test_snapshots_schema_exists(self):
        assert TRILOG_SNAPSHOTS_SCHEMA is not None
        assert TRILOG_SNAPSHOTS_SCHEMA.name == "trilog_snapshots"
    
    def test_column_definition(self):
        col = Column(
            name="test_col",
            type="String",
            default="''",
            comment="Test column",
        )
        assert col.name == "test_col"
        assert col.type == "String"
    
    def test_table_schema_to_sql(self):
        schema = TableSchema(
            name="test_table",
            columns=[
                Column("id", "String"),
                Column("value", "Int32", default="0"),
            ],
            engine="MergeTree()",
            order_by=["id"],
        )
        
        sql = schema.to_create_sql()
        assert "CREATE TABLE" in sql
        assert "test_table" in sql
        assert "MergeTree()" in sql
    
    def test_get_init_sql(self):
        sql = get_init_sql()
        assert "CREATE DATABASE" in sql
        assert "trilog_events" in sql
        assert "trilog_snapshots" in sql


# =============================================================================
# QUERY BUILDER TESTS
# =============================================================================

class TestQueryBuilder:
    """Test query building functionality."""
    
    def test_timeline_query_basic(self):
        query = TimelineQuery().for_object("cart_1")
        assert query._obj_id == "cart_1"
    
    def test_timeline_query_type_filter(self):
        query = TimelineQuery().of_type("ShoppingCart")
        assert query._obj_type == "ShoppingCart"
    
    def test_timeline_query_chaining(self):
        query = (
            TimelineQuery()
            .for_object("cart_1")
            .of_type("ShoppingCart")
            .limit(100)
        )
        
        assert query._obj_id == "cart_1"
        assert query._obj_type == "ShoppingCart"
        assert query._limit == 100
    
    def test_timeline_query_time_range(self):
        start = datetime(2024, 1, 1)
        end = datetime(2024, 1, 2)
        
        query = TimelineQuery().in_time_range(start, end)
        assert query._start_time == start
        assert query._end_time == end
    
    def test_timeline_query_fields(self):
        query = TimelineQuery().with_fields(["item_count", "total_value"])
        assert "item_count" in query._fields
        assert "total_value" in query._fields
    
    def test_timeline_query_where(self):
        query = TimelineQuery().where("status", "=", "active")
        assert len(query._conditions) == 1
    
    def test_query_builder_factory(self):
        query = QueryBuilder.timeline()
        assert isinstance(query, TimelineQuery)
    
    def test_query_builder_state_at(self):
        query = QueryBuilder.state_at("cart_1", datetime.utcnow())
        assert query._obj_id == "cart_1"
    
    def test_time_range_last(self):
        tr = TimeRange.last(hours=24)
        assert tr.end_time is not None
        assert tr.start_time < tr.end_time
    
    def test_time_range_between(self):
        start = datetime(2024, 1, 1)
        end = datetime(2024, 1, 2)
        tr = TimeRange.between(start, end)
        
        assert tr.start_time == start
        assert tr.end_time == end


# =============================================================================
# TIMELINE TESTS
# =============================================================================

class TestTimeline:
    """Test Timeline analysis functionality."""
    
    def test_timeline_creation(self):
        events = create_mock_events()
        timeline = Timeline(events)
        
        assert len(timeline) == 4
    
    def test_timeline_iteration(self):
        events = create_mock_events()
        timeline = Timeline(events)
        
        count = 0
        for event in timeline:
            count += 1
        
        assert count == 4
    
    def test_timeline_indexing(self):
        events = create_mock_events()
        timeline = Timeline(events)
        
        assert timeline[0].attributes["item_count"] == 0
        assert timeline[-1].attributes["item_count"] == 1
    
    def test_timeline_start_end(self):
        events = create_mock_events()
        timeline = Timeline(events)
        
        assert timeline.start_time is not None
        assert timeline.end_time is not None
        assert timeline.start_time < timeline.end_time
    
    def test_timeline_duration(self):
        events = create_mock_events()
        timeline = Timeline(events)
        
        duration = timeline.duration
        assert duration == timedelta(minutes=15)
    
    def test_timeline_state_at(self):
        events = create_mock_events()
        timeline = Timeline(events)
        
        base_time = datetime(2024, 1, 1, 12, 0, 0)
        
        # State at beginning
        state = timeline.state_at(base_time)
        assert state["item_count"] == 0
        
        # State after 7 minutes (after second event)
        state = timeline.state_at(base_time + timedelta(minutes=7))
        assert state["item_count"] == 2
    
    def test_timeline_transitions(self):
        events = create_mock_events()
        timeline = Timeline(events)
        
        transitions = list(timeline.transitions())
        
        # All 4 events should create transitions
        assert len(transitions) == 4
    
    def test_timeline_filter_by_time(self):
        events = create_mock_events()
        timeline = Timeline(events)
        
        base_time = datetime(2024, 1, 1, 12, 0, 0)
        
        filtered = timeline.filter(
            start_time=base_time + timedelta(minutes=5),
            end_time=base_time + timedelta(minutes=10),
        )
        
        assert len(filtered) == 1  # Only the 10-minute event
    
    def test_timeline_find_field_changes(self):
        events = create_mock_events()
        timeline = Timeline(events)
        
        changes = timeline.find_field_changes("item_count")
        assert len(changes) == 4  # All events change item_count
    
    def test_timeline_field_history(self):
        events = create_mock_events()
        timeline = Timeline(events)
        
        history = timeline.field_history("item_count")
        
        values = [v for _, v in history]
        assert values == [0, 2, 3, 1]
    
    def test_timeline_summary(self):
        events = create_mock_events()
        timeline = Timeline(events)
        
        summary = timeline.summary()
        
        assert summary["event_count"] == 4
        assert "transition_count" in summary
        assert "changes_by_field" in summary


# =============================================================================
# STATE TRANSITION TESTS
# =============================================================================

class TestStateTransition:
    """Test StateTransition functionality."""
    
    def test_transition_diff(self):
        event = TimelineEvent(
            timestamp=datetime.utcnow(),
            event_type="state_change",
            obj_id="test",
            obj_type="Test",
            attributes={"count": 10},
        )
        
        transition = StateTransition(
            transition_type=TransitionType.UPDATED,
            timestamp=datetime.utcnow(),
            from_state={"count": 5},
            to_state={"count": 10},
            changed_fields=["count"],
            triggering_event=event,
        )
        
        diff = transition.diff
        assert diff["changed"]["count"]["from"] == 5
        assert diff["changed"]["count"]["to"] == 10
    
    def test_transition_types(self):
        assert TransitionType.CREATED.value == "created"
        assert TransitionType.UPDATED.value == "updated"
        assert TransitionType.DELETED.value == "deleted"


# =============================================================================
# COMPUTE DIFF TESTS
# =============================================================================

class TestComputeDiff:
    """Test compute_diff function."""
    
    def test_diff_added(self):
        state_a = {"a": 1}
        state_b = {"a": 1, "b": 2}
        
        diff = compute_diff(state_a, state_b)
        assert diff["added"] == {"b": 2}
    
    def test_diff_removed(self):
        state_a = {"a": 1, "b": 2}
        state_b = {"a": 1}
        
        diff = compute_diff(state_a, state_b)
        assert diff["removed"] == {"b": 2}
    
    def test_diff_changed(self):
        state_a = {"a": 1}
        state_b = {"a": 2}
        
        diff = compute_diff(state_a, state_b)
        assert diff["changed"]["a"]["from"] == 1
        assert diff["changed"]["a"]["to"] == 2


# =============================================================================
# RECONSTRUCTOR TESTS (Mock)
# =============================================================================

class TestReconstructor:
    """Test Reconstructor with mocked client."""
    
    def test_reconstructor_creation(self):
        mock_client = Mock()
        registry = Registry()
        registry.register(TestCart)
        
        reconstructor = Reconstructor(mock_client, registry)
        assert reconstructor.client == mock_client
        assert reconstructor.registry == registry
    
    def test_reconstruct_with_mock(self):
        """Test reconstruction with mocked ClickHouse responses."""
        mock_client = Mock()
        
        # Mock event query response
        base_time = datetime(2024, 1, 1, 12, 0, 0)
        mock_client.execute.return_value = [
            (base_time, "state_change", '{"item_count": 0, "total_value": 0.0}'),
            (base_time + timedelta(minutes=5), "state_change", '{"item_count": 3, "total_value": 49.99}'),
        ]
        
        registry = Registry()
        registry.register(TestCart)
        
        reconstructor = Reconstructor(mock_client, registry)
        
        # Need to mock _detect_object_type as well
        with patch.object(reconstructor, '_detect_object_type', return_value='TestCart'):
            result = reconstructor.reconstruct(
                "cart_1",
                target_time=base_time + timedelta(minutes=10),
                strategy=ReconstructionStrategy.FULL_REPLAY,
            )
        
        assert isinstance(result, ReconstructionResult)
        assert result.metadata.obj_id == "cart_1"
    
    def test_reconstruction_strategy_enum(self):
        assert ReconstructionStrategy.FULL_REPLAY.value == "full_replay"
        assert ReconstructionStrategy.SNAPSHOT_DELTA.value == "snapshot_delta"
        assert ReconstructionStrategy.CACHED.value == "cached"
    
    def test_reconstructor_caching(self):
        mock_client = Mock()
        registry = Registry()
        registry.register(TestCart)
        
        reconstructor = Reconstructor(mock_client, registry, enable_caching=True)
        
        # Pre-populate cache
        from trilog.engine.reconstructor import ReconstructionMetadata
        
        test_time = datetime(2024, 1, 1)
        cache_key = f"cart_1:{test_time.isoformat()}"
        
        twin = TestCart()
        twin.item_count = 5
        
        cached_result = ReconstructionResult(
            twin=twin,
            metadata=ReconstructionMetadata(
                obj_id="cart_1",
                obj_type="TestCart",
                target_time=test_time,
                events_replayed=1,
                snapshot_used=False,
                snapshot_time=None,
                reconstruction_time_ms=10.0,
                state_hash="abc123",
                strategy=ReconstructionStrategy.FULL_REPLAY,
            ),
        )
        
        reconstructor._cache[cache_key] = cached_result
        
        # Should return cached result without calling client
        result = reconstructor.reconstruct("cart_1", target_time=test_time)
        
        assert result.twin.item_count == 5
        mock_client.execute.assert_not_called()


# =============================================================================
# MERGE TIMELINES TESTS
# =============================================================================

class TestMergeTimelines:
    """Test timeline merging functionality."""
    
    def test_merge_two_timelines(self):
        base_time = datetime(2024, 1, 1, 12, 0, 0)
        
        events_a = [
            TimelineEvent(
                timestamp=base_time,
                event_type="state_change",
                obj_id="obj_a",
                obj_type="Type",
                attributes={"value": 1},
            ),
        ]
        
        events_b = [
            TimelineEvent(
                timestamp=base_time + timedelta(minutes=5),
                event_type="state_change",
                obj_id="obj_b",
                obj_type="Type",
                attributes={"value": 2},
            ),
        ]
        
        timeline_a = Timeline(events_a)
        timeline_b = Timeline(events_b)
        
        merged = merge_timelines([timeline_a, timeline_b])
        
        assert len(merged) == 2
        # Should be sorted by timestamp
        assert merged[0].obj_id == "obj_a"
        assert merged[1].obj_id == "obj_b"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
