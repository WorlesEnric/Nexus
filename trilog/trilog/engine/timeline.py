"""
Timeline analysis for TriLog events.

This module provides tools for analyzing sequences of events,
detecting state transitions, and computing diffs between states.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, Iterator, List, Optional, Tuple, Union
from enum import Enum
import json


class TransitionType(Enum):
    """Type of state transition."""
    
    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"
    PHASE_CHANGE = "phase_change"  # For process state machines


@dataclass
class TimelineEvent:
    """
    A single event in a timeline with full context.
    
    Attributes:
        timestamp: When the event occurred
        event_type: Type of event (state_change, action, etc.)
        obj_id: Object identifier
        obj_type: Object type name
        attributes: Event attributes/payload
        trace_id: Associated trace ID (for process correlation)
        span_id: Associated span ID
        metadata: Additional metadata
    """
    
    timestamp: datetime
    event_type: str
    obj_id: str
    obj_type: str
    attributes: Dict[str, Any] = field(default_factory=dict)
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    @classmethod
    def from_row(cls, row: tuple, columns: List[str]) -> 'TimelineEvent':
        """Create from database row."""
        data = dict(zip(columns, row))
        
        attrs = data.get('attributes', {})
        if isinstance(attrs, str):
            attrs = json.loads(attrs)
        
        meta = data.get('metadata', {})
        if isinstance(meta, str):
            meta = json.loads(meta)
        
        return cls(
            timestamp=data['timestamp'],
            event_type=data.get('event_type', 'unknown'),
            obj_id=data['obj_id'],
            obj_type=data['obj_type'],
            attributes=attrs,
            trace_id=data.get('trace_id'),
            span_id=data.get('span_id'),
            metadata=meta,
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'event_type': self.event_type,
            'obj_id': self.obj_id,
            'obj_type': self.obj_type,
            'attributes': self.attributes,
            'trace_id': self.trace_id,
            'span_id': self.span_id,
            'metadata': self.metadata,
        }


@dataclass
class StateTransition:
    """
    Represents a detected state transition.
    
    Captures what changed between two events, useful for
    understanding object lifecycle and debugging.
    """
    
    transition_type: TransitionType
    timestamp: datetime
    from_state: Dict[str, Any]
    to_state: Dict[str, Any]
    changed_fields: List[str]
    triggering_event: TimelineEvent
    
    @property
    def diff(self) -> Dict[str, Any]:
        """Get the difference between states."""
        return {
            'added': {k: self.to_state[k] for k in self.to_state if k not in self.from_state},
            'removed': {k: self.from_state[k] for k in self.from_state if k not in self.to_state},
            'changed': {
                k: {'from': self.from_state[k], 'to': self.to_state[k]}
                for k in self.changed_fields
                if k in self.from_state and k in self.to_state
            }
        }
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'transition_type': self.transition_type.value,
            'timestamp': self.timestamp.isoformat(),
            'from_state': self.from_state,
            'to_state': self.to_state,
            'changed_fields': self.changed_fields,
            'diff': self.diff,
        }


@dataclass
class TimelineSegment:
    """A segment of a timeline with summary statistics."""
    
    start_time: datetime
    end_time: datetime
    event_count: int
    transition_count: int
    events: List[TimelineEvent] = field(default_factory=list)
    transitions: List[StateTransition] = field(default_factory=list)
    
    @property
    def duration(self) -> timedelta:
        """Duration of this segment."""
        return self.end_time - self.start_time
    
    @property
    def events_per_minute(self) -> float:
        """Event rate in this segment."""
        minutes = self.duration.total_seconds() / 60
        return self.event_count / minutes if minutes > 0 else 0


class Timeline:
    """
    Timeline for analyzing event sequences.
    
    Provides methods for iterating events, detecting transitions,
    computing state at any point, and segmenting by time.
    
    Example:
        >>> timeline = Timeline(events)
        >>> for transition in timeline.transitions():
        ...     print(f"{transition.timestamp}: {transition.changed_fields}")
        
        >>> # Get state at specific time
        >>> state = timeline.state_at(some_time)
        
        >>> # Segment by hour
        >>> for segment in timeline.segment_by(timedelta(hours=1)):
        ...     print(f"{segment.start_time}: {segment.event_count} events")
    """
    
    def __init__(
        self,
        events: List[TimelineEvent],
        initial_state: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize timeline from events.
        
        Args:
            events: List of timeline events (will be sorted)
            initial_state: Known initial state (optional)
        """
        self.events = sorted(events, key=lambda e: e.timestamp)
        self.initial_state = initial_state or {}
        self._state_cache: Dict[int, Dict[str, Any]] = {}
    
    @property
    def start_time(self) -> Optional[datetime]:
        """Start time of timeline."""
        return self.events[0].timestamp if self.events else None
    
    @property
    def end_time(self) -> Optional[datetime]:
        """End time of timeline."""
        return self.events[-1].timestamp if self.events else None
    
    @property
    def duration(self) -> Optional[timedelta]:
        """Total duration of timeline."""
        if self.start_time and self.end_time:
            return self.end_time - self.start_time
        return None
    
    def __len__(self) -> int:
        return len(self.events)
    
    def __iter__(self) -> Iterator[TimelineEvent]:
        return iter(self.events)
    
    def __getitem__(self, index: int) -> TimelineEvent:
        return self.events[index]
    
    def state_at(self, target_time: datetime) -> Dict[str, Any]:
        """
        Compute state at a specific time.
        
        Args:
            target_time: Time to compute state for
            
        Returns:
            State dictionary at that time
        """
        state = self.initial_state.copy()
        
        for event in self.events:
            if event.timestamp > target_time:
                break
            
            # Apply event attributes to state
            for key, value in event.attributes.items():
                if value is None and key in state:
                    del state[key]
                else:
                    state[key] = value
        
        return state
    
    def state_after_event(self, event_index: int) -> Dict[str, Any]:
        """
        Get state after applying events up to given index.
        
        Uses caching for efficiency on repeated calls.
        """
        if event_index in self._state_cache:
            return self._state_cache[event_index].copy()
        
        # Find nearest cached state
        nearest_cached = -1
        for cached_idx in sorted(self._state_cache.keys()):
            if cached_idx < event_index:
                nearest_cached = cached_idx
            else:
                break
        
        if nearest_cached >= 0:
            state = self._state_cache[nearest_cached].copy()
            start_idx = nearest_cached + 1
        else:
            state = self.initial_state.copy()
            start_idx = 0
        
        for i in range(start_idx, event_index + 1):
            event = self.events[i]
            for key, value in event.attributes.items():
                if value is None and key in state:
                    del state[key]
                else:
                    state[key] = value
        
        self._state_cache[event_index] = state.copy()
        return state
    
    def transitions(self) -> Iterator[StateTransition]:
        """
        Iterate over all state transitions.
        
        Yields StateTransition objects for each event that
        changes the object state.
        """
        prev_state = self.initial_state.copy()
        
        for i, event in enumerate(self.events):
            new_state = prev_state.copy()
            changed_fields = []
            
            for key, value in event.attributes.items():
                old_value = prev_state.get(key)
                
                if value is None and key in new_state:
                    del new_state[key]
                    changed_fields.append(key)
                elif old_value != value:
                    new_state[key] = value
                    changed_fields.append(key)
            
            if changed_fields:
                # Determine transition type
                if not prev_state and new_state:
                    trans_type = TransitionType.CREATED
                elif event.event_type == 'phase_change':
                    trans_type = TransitionType.PHASE_CHANGE
                else:
                    trans_type = TransitionType.UPDATED
                
                yield StateTransition(
                    transition_type=trans_type,
                    timestamp=event.timestamp,
                    from_state=prev_state.copy(),
                    to_state=new_state.copy(),
                    changed_fields=changed_fields,
                    triggering_event=event,
                )
            
            prev_state = new_state
    
    def filter(
        self,
        event_type: Optional[str] = None,
        fields: Optional[List[str]] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ) -> 'Timeline':
        """
        Filter timeline to create a new sub-timeline.
        
        Args:
            event_type: Filter by event type
            fields: Only include events that modify these fields
            start_time: Start of time window
            end_time: End of time window
            
        Returns:
            New Timeline with filtered events
        """
        filtered = []
        
        for event in self.events:
            # Time filter
            if start_time and event.timestamp < start_time:
                continue
            if end_time and event.timestamp > end_time:
                continue
            
            # Event type filter
            if event_type and event.event_type != event_type:
                continue
            
            # Fields filter
            if fields:
                if not any(f in event.attributes for f in fields):
                    continue
            
            filtered.append(event)
        
        # Compute initial state for filtered timeline
        initial = self.initial_state.copy()
        if start_time:
            initial = self.state_at(start_time)
        
        return Timeline(filtered, initial_state=initial)
    
    def segment_by(
        self,
        interval: timedelta,
        include_empty: bool = False,
    ) -> Iterator[TimelineSegment]:
        """
        Segment timeline by time intervals.
        
        Args:
            interval: Duration of each segment
            include_empty: Whether to yield segments with no events
            
        Yields:
            TimelineSegment for each interval
        """
        if not self.events:
            return
        
        current_start = self.start_time
        current_events: List[TimelineEvent] = []
        
        for event in self.events:
            # Check if event belongs to current segment
            while event.timestamp >= current_start + interval:
                # Yield current segment if not empty
                if current_events or include_empty:
                    segment_end = current_start + interval
                    transitions = list(Timeline(
                        current_events,
                        self.state_at(current_start)
                    ).transitions())
                    
                    yield TimelineSegment(
                        start_time=current_start,
                        end_time=segment_end,
                        event_count=len(current_events),
                        transition_count=len(transitions),
                        events=current_events,
                        transitions=transitions,
                    )
                
                current_start = current_start + interval
                current_events = []
            
            current_events.append(event)
        
        # Yield final segment
        if current_events or include_empty:
            transitions = list(Timeline(
                current_events,
                self.state_at(current_start)
            ).transitions())
            
            yield TimelineSegment(
                start_time=current_start,
                end_time=current_start + interval,
                event_count=len(current_events),
                transition_count=len(transitions),
                events=current_events,
                transitions=transitions,
            )
    
    def find_field_changes(self, field_name: str) -> List[StateTransition]:
        """
        Find all transitions where a specific field changed.
        
        Args:
            field_name: Name of field to track
            
        Returns:
            List of transitions affecting that field
        """
        return [
            t for t in self.transitions()
            if field_name in t.changed_fields
        ]
    
    def field_history(self, field_name: str) -> List[Tuple[datetime, Any]]:
        """
        Get the history of values for a specific field.
        
        Args:
            field_name: Name of field to track
            
        Returns:
            List of (timestamp, value) tuples
        """
        history = []
        
        # Initial value
        if field_name in self.initial_state:
            if self.events:
                history.append((self.events[0].timestamp, self.initial_state[field_name]))
        
        for transition in self.transitions():
            if field_name in transition.changed_fields:
                new_value = transition.to_state.get(field_name)
                history.append((transition.timestamp, new_value))
        
        return history
    
    def summary(self) -> Dict[str, Any]:
        """
        Generate summary statistics for the timeline.
        
        Returns:
            Dictionary with summary statistics
        """
        transitions = list(self.transitions())
        
        # Count transitions by type
        type_counts = {}
        for t in transitions:
            type_counts[t.transition_type.value] = type_counts.get(t.transition_type.value, 0) + 1
        
        # Count changed fields
        field_counts = {}
        for t in transitions:
            for field in t.changed_fields:
                field_counts[field] = field_counts.get(field, 0) + 1
        
        return {
            'event_count': len(self.events),
            'transition_count': len(transitions),
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'duration_seconds': self.duration.total_seconds() if self.duration else None,
            'transitions_by_type': type_counts,
            'changes_by_field': field_counts,
            'most_changed_field': max(field_counts, key=field_counts.get) if field_counts else None,
        }
    
    def to_dataframe(self) -> Any:
        """
        Convert timeline to pandas DataFrame.
        
        Returns:
            pandas DataFrame with events
            
        Raises:
            ImportError: If pandas is not installed
        """
        try:
            import pandas as pd
        except ImportError:
            raise ImportError("pandas is required for to_dataframe()")
        
        records = []
        for event in self.events:
            record = {
                'timestamp': event.timestamp,
                'event_type': event.event_type,
                'obj_id': event.obj_id,
                'obj_type': event.obj_type,
                'trace_id': event.trace_id,
                'span_id': event.span_id,
            }
            # Flatten attributes
            for k, v in event.attributes.items():
                record[f'attr_{k}'] = v
            records.append(record)
        
        return pd.DataFrame(records)


def compute_diff(
    state_a: Dict[str, Any],
    state_b: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Compute difference between two states.
    
    Args:
        state_a: First state
        state_b: Second state
        
    Returns:
        Dictionary with 'added', 'removed', 'changed' keys
    """
    added = {k: v for k, v in state_b.items() if k not in state_a}
    removed = {k: v for k, v in state_a.items() if k not in state_b}
    changed = {
        k: {'from': state_a[k], 'to': state_b[k]}
        for k in state_a
        if k in state_b and state_a[k] != state_b[k]
    }
    
    return {
        'added': added,
        'removed': removed,
        'changed': changed,
        'unchanged_count': len([
            k for k in state_a
            if k in state_b and state_a[k] == state_b[k]
        ]),
    }


def merge_timelines(
    timelines: List[Timeline],
    sort: bool = True,
) -> Timeline:
    """
    Merge multiple timelines into one.
    
    Args:
        timelines: List of timelines to merge
        sort: Whether to sort the merged timeline
        
    Returns:
        New Timeline with all events
    """
    all_events = []
    merged_initial = {}
    
    for timeline in timelines:
        all_events.extend(timeline.events)
        merged_initial.update(timeline.initial_state)
    
    if sort:
        all_events.sort(key=lambda e: e.timestamp)
    
    return Timeline(all_events, initial_state=merged_initial)
