"""
Digital Twin Reconstruction Engine.

This module provides the core capability of TriLog: reconstructing the state
of any object at any point in time by replaying its event history.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, Generic, List, Optional, Type, TypeVar, Union
import json
import hashlib
from enum import Enum

from ..dsl.base import Object
from ..dsl.registry import Registry
from ..storage.client import ClickHouseClient, AsyncClickHouseClient


T = TypeVar('T', bound=Object)


class ReconstructionStrategy(Enum):
    """Strategy for reconstructing object state."""
    
    FULL_REPLAY = "full_replay"  # Replay all events from beginning
    SNAPSHOT_DELTA = "snapshot_delta"  # Start from nearest snapshot
    CACHED = "cached"  # Use cached state if available


@dataclass
class ReconstructionMetadata:
    """Metadata about the reconstruction process."""
    
    obj_id: str
    obj_type: str
    target_time: datetime
    events_replayed: int
    snapshot_used: bool
    snapshot_time: Optional[datetime]
    reconstruction_time_ms: float
    state_hash: str
    strategy: ReconstructionStrategy


@dataclass
class ReconstructionResult(Generic[T]):
    """Result of a Digital Twin reconstruction."""
    
    twin: T
    metadata: ReconstructionMetadata
    events: List[Dict[str, Any]] = field(default_factory=list)
    
    @property
    def state(self) -> Dict[str, Any]:
        """Get the current state as a dictionary."""
        return self.twin.to_dict()
    
    def state_at_event(self, event_index: int) -> Dict[str, Any]:
        """
        Get the state after applying events up to the given index.
        
        Args:
            event_index: Index of the event (0-based)
            
        Returns:
            State dictionary after applying events[0:event_index+1]
        """
        if event_index < 0 or event_index >= len(self.events):
            raise IndexError(f"Event index {event_index} out of range")
        
        # Create fresh instance and replay up to index
        twin_class = type(self.twin)
        temp_twin = twin_class()
        
        for i, event in enumerate(self.events):
            if i > event_index:
                break
            attrs = event.get('attributes', {})
            temp_twin.apply_change(attrs)
        
        return temp_twin.to_dict()


class Reconstructor:
    """
    Digital Twin Reconstructor.
    
    This is the core engine that rebuilds object state from event history.
    It supports multiple reconstruction strategies for optimization.
    
    Example:
        >>> reconstructor = Reconstructor(client, registry)
        >>> result = reconstructor.reconstruct("cart_123", target_time=some_time)
        >>> print(result.twin.item_count)  # Reconstructed state
        >>> print(result.metadata.events_replayed)  # How many events were replayed
    """
    
    def __init__(
        self,
        client: Union[ClickHouseClient, AsyncClickHouseClient],
        registry: Registry,
        enable_caching: bool = True,
        snapshot_interval: int = 100,
    ):
        """
        Initialize the Reconstructor.
        
        Args:
            client: ClickHouse client for querying events
            registry: Schema registry for type information
            enable_caching: Whether to cache reconstruction results
            snapshot_interval: Number of events between automatic snapshots
        """
        self.client = client
        self.registry = registry
        self.enable_caching = enable_caching
        self.snapshot_interval = snapshot_interval
        self._cache: Dict[str, ReconstructionResult] = {}
    
    def reconstruct(
        self,
        obj_id: str,
        target_time: Optional[datetime] = None,
        obj_type: Optional[str] = None,
        strategy: ReconstructionStrategy = ReconstructionStrategy.SNAPSHOT_DELTA,
        include_events: bool = False,
    ) -> ReconstructionResult:
        """
        Reconstruct the state of an object at a specific time.
        
        Args:
            obj_id: The object identifier
            target_time: Target time for reconstruction (default: now)
            obj_type: Object type hint (auto-detected if not provided)
            strategy: Reconstruction strategy to use
            include_events: Whether to include raw events in result
            
        Returns:
            ReconstructionResult containing the reconstructed twin
            
        Raises:
            ValueError: If object not found or type cannot be determined
        """
        import time
        start_time = time.time()
        
        if target_time is None:
            target_time = datetime.utcnow()
        
        # Check cache first
        cache_key = f"{obj_id}:{target_time.isoformat()}"
        if self.enable_caching and cache_key in self._cache:
            return self._cache[cache_key]
        
        # Detect object type if not provided
        if obj_type is None:
            obj_type = self._detect_object_type(obj_id)
        
        # Get the blueprint class
        blueprint_class = self._get_blueprint_class(obj_type)
        
        # Choose reconstruction path based on strategy
        if strategy == ReconstructionStrategy.SNAPSHOT_DELTA:
            twin, events, snapshot_info = self._reconstruct_from_snapshot(
                obj_id, obj_type, blueprint_class, target_time
            )
        else:
            twin, events, snapshot_info = self._reconstruct_full(
                obj_id, obj_type, blueprint_class, target_time
            )
        
        # Calculate state hash for verification
        state_hash = self._compute_state_hash(twin)
        
        # Build metadata
        elapsed_ms = (time.time() - start_time) * 1000
        metadata = ReconstructionMetadata(
            obj_id=obj_id,
            obj_type=obj_type,
            target_time=target_time,
            events_replayed=len(events),
            snapshot_used=snapshot_info.get('used', False),
            snapshot_time=snapshot_info.get('time'),
            reconstruction_time_ms=elapsed_ms,
            state_hash=state_hash,
            strategy=strategy,
        )
        
        # Build result
        result = ReconstructionResult(
            twin=twin,
            metadata=metadata,
            events=events if include_events else [],
        )
        
        # Cache result
        if self.enable_caching:
            self._cache[cache_key] = result
        
        # Consider creating snapshot if many events were replayed
        if len(events) >= self.snapshot_interval:
            self._maybe_create_snapshot(obj_id, obj_type, twin, target_time)
        
        return result
    
    def reconstruct_batch(
        self,
        obj_ids: List[str],
        target_time: Optional[datetime] = None,
        obj_type: Optional[str] = None,
    ) -> Dict[str, ReconstructionResult]:
        """
        Reconstruct multiple objects efficiently.
        
        Args:
            obj_ids: List of object identifiers
            target_time: Target time for all reconstructions
            obj_type: Object type (must be same for all)
            
        Returns:
            Dictionary mapping obj_id to ReconstructionResult
        """
        results = {}
        for obj_id in obj_ids:
            try:
                results[obj_id] = self.reconstruct(
                    obj_id=obj_id,
                    target_time=target_time,
                    obj_type=obj_type,
                )
            except Exception as e:
                # Log error but continue with other objects
                results[obj_id] = None
        return results
    
    def get_state_at(
        self,
        obj_id: str,
        target_time: datetime,
        field_name: Optional[str] = None,
    ) -> Any:
        """
        Get object state (or specific field) at a point in time.
        
        Args:
            obj_id: Object identifier
            target_time: Target time
            field_name: Specific field to retrieve (optional)
            
        Returns:
            Full state dict or specific field value
        """
        result = self.reconstruct(obj_id, target_time)
        
        if field_name:
            return getattr(result.twin, field_name, None)
        return result.state
    
    def compare_states(
        self,
        obj_id: str,
        time_a: datetime,
        time_b: datetime,
    ) -> Dict[str, Any]:
        """
        Compare object states between two points in time.
        
        Args:
            obj_id: Object identifier
            time_a: First time point
            time_b: Second time point
            
        Returns:
            Dictionary with 'added', 'removed', 'changed' keys
        """
        state_a = self.reconstruct(obj_id, time_a).state
        state_b = self.reconstruct(obj_id, time_b).state
        
        diff = {
            'time_a': time_a.isoformat(),
            'time_b': time_b.isoformat(),
            'added': {},
            'removed': {},
            'changed': {},
        }
        
        all_keys = set(state_a.keys()) | set(state_b.keys())
        
        for key in all_keys:
            in_a = key in state_a
            in_b = key in state_b
            
            if in_a and not in_b:
                diff['removed'][key] = state_a[key]
            elif in_b and not in_a:
                diff['added'][key] = state_b[key]
            elif state_a[key] != state_b[key]:
                diff['changed'][key] = {
                    'from': state_a[key],
                    'to': state_b[key],
                }
        
        return diff
    
    def _detect_object_type(self, obj_id: str) -> str:
        """Detect object type from the first event."""
        query = """
            SELECT obj_type
            FROM trilog_events
            WHERE obj_id = %(obj_id)s
            LIMIT 1
        """
        result = self.client.execute(query, {'obj_id': obj_id})
        
        if not result:
            raise ValueError(f"No events found for object: {obj_id}")
        
        return result[0][0]
    
    def _get_blueprint_class(self, obj_type: str) -> Type[Object]:
        """Get the blueprint class from registry."""
        blueprint = self.registry.get(obj_type)
        if blueprint is None:
            raise ValueError(f"Unknown object type: {obj_type}")
        return blueprint
    
    def _reconstruct_full(
        self,
        obj_id: str,
        obj_type: str,
        blueprint_class: Type[T],
        target_time: datetime,
    ) -> tuple:
        """Full replay reconstruction from the beginning."""
        # Fetch all events up to target time
        query = """
            SELECT timestamp, event_type, attributes
            FROM trilog_events
            WHERE obj_id = %(obj_id)s
              AND obj_type = %(obj_type)s
              AND timestamp <= %(target_time)s
            ORDER BY timestamp ASC
        """
        
        events = self.client.execute(query, {
            'obj_id': obj_id,
            'obj_type': obj_type,
            'target_time': target_time,
        })
        
        # Create fresh instance
        twin = blueprint_class()
        twin._obj_id = obj_id
        
        # Replay all events
        event_list = []
        for row in events:
            timestamp, event_type, attributes = row
            
            # Parse attributes if JSON string
            if isinstance(attributes, str):
                attributes = json.loads(attributes)
            
            event_list.append({
                'timestamp': timestamp,
                'event_type': event_type,
                'attributes': attributes,
            })
            
            # Apply change to twin
            twin.apply_change(attributes)
        
        snapshot_info = {'used': False, 'time': None}
        return twin, event_list, snapshot_info
    
    def _reconstruct_from_snapshot(
        self,
        obj_id: str,
        obj_type: str,
        blueprint_class: Type[T],
        target_time: datetime,
    ) -> tuple:
        """Reconstruct using nearest snapshot + delta events."""
        # Try to find a snapshot before target time
        snapshot_query = """
            SELECT timestamp, state
            FROM trilog_snapshots
            WHERE obj_id = %(obj_id)s
              AND obj_type = %(obj_type)s
              AND timestamp <= %(target_time)s
            ORDER BY timestamp DESC
            LIMIT 1
        """
        
        snapshot_result = self.client.execute(snapshot_query, {
            'obj_id': obj_id,
            'obj_type': obj_type,
            'target_time': target_time,
        })
        
        if snapshot_result:
            # Use snapshot as starting point
            snapshot_time, snapshot_state = snapshot_result[0]
            
            if isinstance(snapshot_state, str):
                snapshot_state = json.loads(snapshot_state)
            
            # Create twin from snapshot
            twin = blueprint_class()
            twin._obj_id = obj_id
            twin.apply_change(snapshot_state)
            
            # Fetch delta events after snapshot
            delta_query = """
                SELECT timestamp, event_type, attributes
                FROM trilog_events
                WHERE obj_id = %(obj_id)s
                  AND obj_type = %(obj_type)s
                  AND timestamp > %(snapshot_time)s
                  AND timestamp <= %(target_time)s
                ORDER BY timestamp ASC
            """
            
            events = self.client.execute(delta_query, {
                'obj_id': obj_id,
                'obj_type': obj_type,
                'snapshot_time': snapshot_time,
                'target_time': target_time,
            })
            
            # Replay delta events
            event_list = []
            for row in events:
                timestamp, event_type, attributes = row
                
                if isinstance(attributes, str):
                    attributes = json.loads(attributes)
                
                event_list.append({
                    'timestamp': timestamp,
                    'event_type': event_type,
                    'attributes': attributes,
                })
                
                twin.apply_change(attributes)
            
            snapshot_info = {'used': True, 'time': snapshot_time}
            return twin, event_list, snapshot_info
        else:
            # No snapshot found, fall back to full replay
            return self._reconstruct_full(obj_id, obj_type, blueprint_class, target_time)
    
    def _compute_state_hash(self, twin: Object) -> str:
        """Compute a hash of the current state for verification."""
        state_json = json.dumps(twin.to_dict(), sort_keys=True, default=str)
        return hashlib.sha256(state_json.encode()).hexdigest()[:16]
    
    def _maybe_create_snapshot(
        self,
        obj_id: str,
        obj_type: str,
        twin: Object,
        timestamp: datetime,
    ) -> None:
        """Create a snapshot if conditions are met."""
        try:
            state_json = json.dumps(twin.to_dict(), default=str)
            
            insert_query = """
                INSERT INTO trilog_snapshots
                (obj_id, obj_type, timestamp, state, version)
                VALUES
            """
            
            self.client.execute(
                insert_query,
                [{
                    'obj_id': obj_id,
                    'obj_type': obj_type,
                    'timestamp': timestamp,
                    'state': state_json,
                    'version': 1,
                }]
            )
        except Exception:
            # Snapshot creation is best-effort
            pass
    
    def clear_cache(self, obj_id: Optional[str] = None) -> None:
        """
        Clear reconstruction cache.
        
        Args:
            obj_id: Clear only for specific object, or all if None
        """
        if obj_id:
            keys_to_remove = [k for k in self._cache if k.startswith(f"{obj_id}:")]
            for key in keys_to_remove:
                del self._cache[key]
        else:
            self._cache.clear()


class AsyncReconstructor:
    """Async version of the Digital Twin Reconstructor."""
    
    def __init__(
        self,
        client: AsyncClickHouseClient,
        registry: Registry,
        enable_caching: bool = True,
        snapshot_interval: int = 100,
    ):
        self.client = client
        self.registry = registry
        self.enable_caching = enable_caching
        self.snapshot_interval = snapshot_interval
        self._cache: Dict[str, ReconstructionResult] = {}
    
    async def reconstruct(
        self,
        obj_id: str,
        target_time: Optional[datetime] = None,
        obj_type: Optional[str] = None,
        strategy: ReconstructionStrategy = ReconstructionStrategy.SNAPSHOT_DELTA,
        include_events: bool = False,
    ) -> ReconstructionResult:
        """Async version of reconstruct."""
        import time
        start_time = time.time()
        
        if target_time is None:
            target_time = datetime.utcnow()
        
        cache_key = f"{obj_id}:{target_time.isoformat()}"
        if self.enable_caching and cache_key in self._cache:
            return self._cache[cache_key]
        
        if obj_type is None:
            obj_type = await self._detect_object_type(obj_id)
        
        blueprint_class = self._get_blueprint_class(obj_type)
        
        if strategy == ReconstructionStrategy.SNAPSHOT_DELTA:
            twin, events, snapshot_info = await self._reconstruct_from_snapshot(
                obj_id, obj_type, blueprint_class, target_time
            )
        else:
            twin, events, snapshot_info = await self._reconstruct_full(
                obj_id, obj_type, blueprint_class, target_time
            )
        
        state_hash = self._compute_state_hash(twin)
        
        elapsed_ms = (time.time() - start_time) * 1000
        metadata = ReconstructionMetadata(
            obj_id=obj_id,
            obj_type=obj_type,
            target_time=target_time,
            events_replayed=len(events),
            snapshot_used=snapshot_info.get('used', False),
            snapshot_time=snapshot_info.get('time'),
            reconstruction_time_ms=elapsed_ms,
            state_hash=state_hash,
            strategy=strategy,
        )
        
        result = ReconstructionResult(
            twin=twin,
            metadata=metadata,
            events=events if include_events else [],
        )
        
        if self.enable_caching:
            self._cache[cache_key] = result
        
        return result
    
    async def _detect_object_type(self, obj_id: str) -> str:
        query = """
            SELECT obj_type
            FROM trilog_events
            WHERE obj_id = %(obj_id)s
            LIMIT 1
        """
        result = await self.client.execute(query, {'obj_id': obj_id})
        if not result:
            raise ValueError(f"No events found for object: {obj_id}")
        return result[0][0]
    
    def _get_blueprint_class(self, obj_type: str) -> Type[Object]:
        blueprint = self.registry.get(obj_type)
        if blueprint is None:
            raise ValueError(f"Unknown object type: {obj_type}")
        return blueprint
    
    async def _reconstruct_full(
        self,
        obj_id: str,
        obj_type: str,
        blueprint_class: Type[T],
        target_time: datetime,
    ) -> tuple:
        query = """
            SELECT timestamp, event_type, attributes
            FROM trilog_events
            WHERE obj_id = %(obj_id)s
              AND obj_type = %(obj_type)s
              AND timestamp <= %(target_time)s
            ORDER BY timestamp ASC
        """
        
        events = await self.client.execute(query, {
            'obj_id': obj_id,
            'obj_type': obj_type,
            'target_time': target_time,
        })
        
        twin = blueprint_class()
        twin._obj_id = obj_id
        
        event_list = []
        for row in events:
            timestamp, event_type, attributes = row
            if isinstance(attributes, str):
                attributes = json.loads(attributes)
            event_list.append({
                'timestamp': timestamp,
                'event_type': event_type,
                'attributes': attributes,
            })
            twin.apply_change(attributes)
        
        return twin, event_list, {'used': False, 'time': None}
    
    async def _reconstruct_from_snapshot(
        self,
        obj_id: str,
        obj_type: str,
        blueprint_class: Type[T],
        target_time: datetime,
    ) -> tuple:
        snapshot_query = """
            SELECT timestamp, state
            FROM trilog_snapshots
            WHERE obj_id = %(obj_id)s
              AND obj_type = %(obj_type)s
              AND timestamp <= %(target_time)s
            ORDER BY timestamp DESC
            LIMIT 1
        """
        
        snapshot_result = await self.client.execute(snapshot_query, {
            'obj_id': obj_id,
            'obj_type': obj_type,
            'target_time': target_time,
        })
        
        if snapshot_result:
            snapshot_time, snapshot_state = snapshot_result[0]
            if isinstance(snapshot_state, str):
                snapshot_state = json.loads(snapshot_state)
            
            twin = blueprint_class()
            twin._obj_id = obj_id
            twin.apply_change(snapshot_state)
            
            delta_query = """
                SELECT timestamp, event_type, attributes
                FROM trilog_events
                WHERE obj_id = %(obj_id)s
                  AND obj_type = %(obj_type)s
                  AND timestamp > %(snapshot_time)s
                  AND timestamp <= %(target_time)s
                ORDER BY timestamp ASC
            """
            
            events = await self.client.execute(delta_query, {
                'obj_id': obj_id,
                'obj_type': obj_type,
                'snapshot_time': snapshot_time,
                'target_time': target_time,
            })
            
            event_list = []
            for row in events:
                timestamp, event_type, attributes = row
                if isinstance(attributes, str):
                    attributes = json.loads(attributes)
                event_list.append({
                    'timestamp': timestamp,
                    'event_type': event_type,
                    'attributes': attributes,
                })
                twin.apply_change(attributes)
            
            return twin, event_list, {'used': True, 'time': snapshot_time}
        else:
            return await self._reconstruct_full(obj_id, obj_type, blueprint_class, target_time)
    
    def _compute_state_hash(self, twin: Object) -> str:
        state_json = json.dumps(twin.to_dict(), sort_keys=True, default=str)
        return hashlib.sha256(state_json.encode()).hexdigest()[:16]