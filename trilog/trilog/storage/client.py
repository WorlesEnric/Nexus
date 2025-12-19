"""
TriLog ClickHouse Client

Provides both synchronous and asynchronous clients for
interacting with ClickHouse.
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Iterator, List, Optional, Tuple, Union
import json

from clickhouse_driver import Client as SyncClient
from clickhouse_driver.errors import Error as ClickHouseError


@dataclass
class ConnectionConfig:
    """ClickHouse connection configuration"""
    host: str = "localhost"
    port: int = 9000
    database: str = "trilog"
    user: str = "default"
    password: str = ""
    connect_timeout: int = 10
    send_receive_timeout: int = 300
    sync_request_timeout: int = 5
    settings: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.settings is None:
            self.settings = {}
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to connection parameters dict"""
        return {
            "host": self.host,
            "port": self.port,
            "database": self.database,
            "user": self.user,
            "password": self.password,
            "connect_timeout": self.connect_timeout,
            "send_receive_timeout": self.send_receive_timeout,
            "sync_request_timeout": self.sync_request_timeout,
            "settings": self.settings,
        }


class ClickHouseClient:
    """
    Synchronous ClickHouse client for TriLog.
    
    Provides high-level methods for common TriLog operations
    while exposing low-level query capabilities.
    
    Example:
        client = ClickHouseClient(host="localhost", database="trilog")
        
        # Query events for an object
        events = client.get_object_events("cart_123")
        
        # Get object state at a point in time
        state = client.get_object_state("cart_123", target_time)
    """
    
    def __init__(
        self,
        host: str = "localhost",
        port: int = 9000,
        database: str = "trilog",
        user: str = "default",
        password: str = "",
        **kwargs
    ):
        """
        Initialize the client.
        
        Args:
            host: ClickHouse host
            port: ClickHouse native port
            database: Database name
            user: Username
            password: Password
            **kwargs: Additional connection parameters
        """
        self.config = ConnectionConfig(
            host=host,
            port=port,
            database=database,
            user=user,
            password=password,
            **kwargs
        )
        self._client: Optional[SyncClient] = None
    
    @property
    def client(self) -> SyncClient:
        """Get or create the underlying client"""
        if self._client is None:
            self._client = SyncClient(**self.config.to_dict())
        return self._client
    
    def close(self) -> None:
        """Close the connection"""
        if self._client is not None:
            self._client.disconnect()
            self._client = None
    
    def __enter__(self) -> ClickHouseClient:
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()
    
    def execute(
        self,
        query: str,
        params: Optional[Dict[str, Any]] = None,
        with_column_types: bool = False,
    ) -> Union[List[Tuple], Tuple[List[Tuple], List[Tuple]]]:
        """
        Execute a query.
        
        Args:
            query: SQL query string
            params: Query parameters
            with_column_types: If True, return column types
        
        Returns:
            Query results
        """
        return self.client.execute(
            query,
            params or {},
            with_column_types=with_column_types
        )
    
    def execute_iter(
        self,
        query: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Iterator[Tuple]:
        """
        Execute a query and iterate over results.
        
        Args:
            query: SQL query string
            params: Query parameters
        
        Yields:
            Result rows
        """
        return self.client.execute_iter(query, params or {})
    
    def insert(
        self,
        table: str,
        data: List[Dict[str, Any]],
        columns: Optional[List[str]] = None,
    ) -> int:
        """
        Insert data into a table.
        
        Args:
            table: Table name
            data: List of row dictionaries
            columns: Column names (inferred from data if not provided)
        
        Returns:
            Number of rows inserted
        """
        if not data:
            return 0
        
        if columns is None:
            columns = list(data[0].keys())
        
        # Convert dicts to tuples in column order
        rows = [
            tuple(row.get(col) for col in columns)
            for row in data
        ]
        
        cols_str = ", ".join(columns)
        query = f"INSERT INTO {table} ({cols_str}) VALUES"
        
        return self.client.execute(query, rows)
    
    # TriLog-specific methods
    
    def get_object_events(
        self,
        obj_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 1000,
    ) -> List[Dict[str, Any]]:
        """
        Get all events for an object.
        
        Args:
            obj_id: Object ID
            start_time: Start of time range
            end_time: End of time range
            limit: Maximum number of results
        
        Returns:
            List of event dictionaries
        """
        conditions = ["obj_id = %(obj_id)s"]
        params = {"obj_id": obj_id, "limit": limit}
        
        if start_time:
            conditions.append("timestamp >= %(start_time)s")
            params["start_time"] = start_time
        
        if end_time:
            conditions.append("timestamp <= %(end_time)s")
            params["end_time"] = end_time
        
        where_clause = " AND ".join(conditions)
        
        query = f"""
            SELECT 
                timestamp,
                trace_id,
                span_id,
                obj_id,
                obj_type,
                body,
                severity_text,
                attributes
            FROM trilog_events
            WHERE {where_clause}
            ORDER BY timestamp ASC
            LIMIT %(limit)s
        """
        
        results = self.execute(query, params, with_column_types=True)
        rows, columns = results
        column_names = [c[0] for c in columns]
        
        return [dict(zip(column_names, row)) for row in rows]
    
    def get_object_state(
        self,
        obj_id: str,
        target_time: datetime,
    ) -> Dict[str, Any]:
        """
        Get the state of an object at a specific time.
        
        This aggregates all events up to target_time.
        
        Args:
            obj_id: Object ID
            target_time: Point in time to reconstruct
        
        Returns:
            Dictionary of attribute values at that time
        """
        query = """
            SELECT 
                arrayJoin(mapKeys(attributes)) as key,
                argMax(mapValues(attributes)[indexOf(mapKeys(attributes), key)], timestamp) as value
            FROM trilog_events
            WHERE obj_id = %(obj_id)s
              AND timestamp <= %(target_time)s
            GROUP BY key
        """
        
        results = self.execute(query, {
            "obj_id": obj_id,
            "target_time": target_time,
        })
        
        state = {}
        for key, value in results:
            state[key] = value
        
        return state
    
    def get_object_timeline(
        self,
        obj_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get the timeline of state changes for an object.
        
        Args:
            obj_id: Object ID
            start_time: Start of time range
            end_time: End of time range
        
        Returns:
            List of state snapshots with timestamps
        """
        events = self.get_object_events(obj_id, start_time, end_time)
        
        timeline = []
        current_state = {}
        
        for event in events:
            # Update state with event attributes
            attrs = event.get("attributes", {})
            if isinstance(attrs, str):
                attrs = json.loads(attrs)
            
            current_state.update(attrs)
            
            timeline.append({
                "timestamp": event["timestamp"],
                "body": event.get("body", ""),
                "state": dict(current_state),
            })
        
        return timeline
    
    def count_objects(
        self,
        obj_type: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ) -> int:
        """
        Count unique objects.
        
        Args:
            obj_type: Filter by object type
            start_time: Start of time range
            end_time: End of time range
        
        Returns:
            Number of unique objects
        """
        conditions = ["1=1"]
        params = {}
        
        if obj_type:
            conditions.append("obj_type = %(obj_type)s")
            params["obj_type"] = obj_type
        
        if start_time:
            conditions.append("timestamp >= %(start_time)s")
            params["start_time"] = start_time
        
        if end_time:
            conditions.append("timestamp <= %(end_time)s")
            params["end_time"] = end_time
        
        where_clause = " AND ".join(conditions)
        
        query = f"""
            SELECT count(DISTINCT obj_id)
            FROM trilog_events
            WHERE {where_clause}
        """
        
        result = self.execute(query, params)
        return result[0][0]
    
    def list_object_ids(
        self,
        obj_type: Optional[str] = None,
        limit: int = 100,
    ) -> List[str]:
        """
        List object IDs.
        
        Args:
            obj_type: Filter by object type
            limit: Maximum number of results
        
        Returns:
            List of object IDs
        """
        conditions = ["1=1"]
        params = {"limit": limit}
        
        if obj_type:
            conditions.append("obj_type = %(obj_type)s")
            params["obj_type"] = obj_type
        
        where_clause = " AND ".join(conditions)
        
        query = f"""
            SELECT DISTINCT obj_id
            FROM trilog_events
            WHERE {where_clause}
            ORDER BY obj_id
            LIMIT %(limit)s
        """
        
        result = self.execute(query, params)
        return [row[0] for row in result]


class AsyncClickHouseClient:
    """
    Asynchronous ClickHouse client for TriLog.
    
    Provides the same interface as ClickHouseClient but with
    async/await support.
    
    Note: This uses clickhouse-connect which has better async support.
    """
    
    def __init__(
        self,
        host: str = "localhost",
        port: int = 8123,  # HTTP port
        database: str = "trilog",
        username: str = "default",
        password: str = "",
        **kwargs
    ):
        """
        Initialize the async client.
        
        Args:
            host: ClickHouse host
            port: ClickHouse HTTP port
            database: Database name
            username: Username
            password: Password
            **kwargs: Additional connection parameters
        """
        # Import here to avoid requiring clickhouse-connect for sync usage
        import clickhouse_connect
        
        self._client = clickhouse_connect.get_client(
            host=host,
            port=port,
            database=database,
            username=username,
            password=password,
            **kwargs
        )
    
    async def execute(
        self,
        query: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """Execute a query asynchronously"""
        # clickhouse-connect is sync, wrap in executor
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._client.query(query, parameters=params)
        )
    
    async def get_object_events(
        self,
        obj_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 1000,
    ) -> List[Dict[str, Any]]:
        """Get all events for an object asynchronously"""
        conditions = [f"obj_id = '{obj_id}'"]
        
        if start_time:
            conditions.append(f"timestamp >= '{start_time.isoformat()}'")
        if end_time:
            conditions.append(f"timestamp <= '{end_time.isoformat()}'")
        
        where_clause = " AND ".join(conditions)
        
        query = f"""
            SELECT *
            FROM trilog_events
            WHERE {where_clause}
            ORDER BY timestamp ASC
            LIMIT {limit}
        """
        
        result = await self.execute(query)
        return result.named_results()
    
    def close(self) -> None:
        """Close the connection"""
        self._client.close()
    
    async def __aenter__(self) -> AsyncClickHouseClient:
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()
