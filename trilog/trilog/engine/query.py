"""
TriLog Query Builder

Provides a fluent interface for building time-travel queries
against the TriLog event store.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Type, Union


class AggregateFunction(str, Enum):
    """Supported aggregate functions"""
    COUNT = "count"
    SUM = "sum"
    AVG = "avg"
    MIN = "min"
    MAX = "max"
    FIRST = "argMin"
    LAST = "argMax"


class OrderDirection(str, Enum):
    """Order direction"""
    ASC = "ASC"
    DESC = "DESC"


@dataclass
class TimeRange:
    """Represents a time range for queries"""
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    
    @classmethod
    def last(cls, minutes: int = 0, hours: int = 0, days: int = 0) -> TimeRange:
        """Create a time range for the last N minutes/hours/days"""
        end = datetime.utcnow()
        delta = timedelta(minutes=minutes, hours=hours, days=days)
        start = end - delta
        return cls(start=start, end=end)
    
    @classmethod
    def between(cls, start: datetime, end: datetime) -> TimeRange:
        """Create a time range between two dates"""
        return cls(start=start, end=end)
    
    @classmethod
    def at(cls, point: datetime, tolerance_ms: int = 0) -> TimeRange:
        """Create a time range at a specific point with optional tolerance"""
        if tolerance_ms > 0:
            delta = timedelta(milliseconds=tolerance_ms)
            return cls(start=point - delta, end=point + delta)
        return cls(start=point, end=point)
    
    def to_sql_conditions(self, column: str = "timestamp") -> List[str]:
        """Generate SQL conditions for this time range"""
        conditions = []
        if self.start:
            conditions.append(f"{column} >= '{self.start.isoformat()}'")
        if self.end:
            conditions.append(f"{column} <= '{self.end.isoformat()}'")
        return conditions


@dataclass
class QueryCondition:
    """A single query condition"""
    column: str
    operator: str
    value: Any
    
    def to_sql(self) -> str:
        """Convert to SQL"""
        if isinstance(self.value, str):
            value_str = f"'{self.value}'"
        elif isinstance(self.value, (list, tuple)):
            items = ", ".join(
                f"'{v}'" if isinstance(v, str) else str(v)
                for v in self.value
            )
            value_str = f"({items})"
        else:
            value_str = str(self.value)
        
        return f"{self.column} {self.operator} {value_str}"


@dataclass
class TimelineQuery:
    """
    Query for retrieving object timelines.
    
    Example:
        query = (TimelineQuery()
            .for_object("cart_123")
            .of_type("ShoppingCart")
            .in_time_range(TimeRange.last(hours=24))
            .with_fields(["item_count", "total_value"])
            .limit(100))
        
        results = query.execute(client)
    """
    obj_id: Optional[str] = None
    obj_type: Optional[str] = None
    time_range: Optional[TimeRange] = None
    fields: List[str] = field(default_factory=list)
    conditions: List[QueryCondition] = field(default_factory=list)
    order_by: str = "timestamp"
    order_direction: OrderDirection = OrderDirection.ASC
    limit_value: int = 1000
    offset_value: int = 0
    
    def for_object(self, obj_id: str) -> TimelineQuery:
        """Filter by object ID"""
        self.obj_id = obj_id
        return self
    
    def of_type(self, obj_type: str) -> TimelineQuery:
        """Filter by object type"""
        self.obj_type = obj_type
        return self
    
    def in_time_range(self, time_range: TimeRange) -> TimelineQuery:
        """Filter by time range"""
        self.time_range = time_range
        return self
    
    def after(self, timestamp: datetime) -> TimelineQuery:
        """Filter events after timestamp"""
        if self.time_range is None:
            self.time_range = TimeRange()
        self.time_range.start = timestamp
        return self
    
    def before(self, timestamp: datetime) -> TimelineQuery:
        """Filter events before timestamp"""
        if self.time_range is None:
            self.time_range = TimeRange()
        self.time_range.end = timestamp
        return self
    
    def with_fields(self, fields: List[str]) -> TimelineQuery:
        """Select specific fields to return"""
        self.fields = fields
        return self
    
    def where(self, column: str, operator: str, value: Any) -> TimelineQuery:
        """Add a condition"""
        self.conditions.append(QueryCondition(column, operator, value))
        return self
    
    def where_eq(self, column: str, value: Any) -> TimelineQuery:
        """Add an equality condition"""
        return self.where(column, "=", value)
    
    def where_in(self, column: str, values: List[Any]) -> TimelineQuery:
        """Add an IN condition"""
        return self.where(column, "IN", values)
    
    def order(self, column: str, direction: OrderDirection = OrderDirection.ASC) -> TimelineQuery:
        """Set order by"""
        self.order_by = column
        self.order_direction = direction
        return self
    
    def limit(self, n: int) -> TimelineQuery:
        """Set result limit"""
        self.limit_value = n
        return self
    
    def offset(self, n: int) -> TimelineQuery:
        """Set result offset"""
        self.offset_value = n
        return self
    
    def build_sql(self) -> Tuple[str, Dict[str, Any]]:
        """
        Build the SQL query.
        
        Returns:
            Tuple of (sql_string, parameters_dict)
        """
        # Build SELECT clause
        if self.fields:
            select_cols = ["timestamp", "obj_id", "obj_type", "body", "trace_id", "span_id"]
            # Add attribute extractions
            for f in self.fields:
                select_cols.append(f"attributes['{f}'] as `{f}`")
            select_clause = ", ".join(select_cols)
        else:
            select_clause = "*"
        
        # Build WHERE clause
        conditions = []
        params = {}
        
        if self.obj_id:
            conditions.append("obj_id = %(obj_id)s")
            params["obj_id"] = self.obj_id
        
        if self.obj_type:
            conditions.append("obj_type = %(obj_type)s")
            params["obj_type"] = self.obj_type
        
        if self.time_range:
            conditions.extend(self.time_range.to_sql_conditions())
        
        for i, cond in enumerate(self.conditions):
            conditions.append(cond.to_sql())
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        # Build full query
        sql = f"""
            SELECT {select_clause}
            FROM trilog_events
            WHERE {where_clause}
            ORDER BY {self.order_by} {self.order_direction.value}
            LIMIT {self.limit_value}
            OFFSET {self.offset_value}
        """
        
        return sql.strip(), params
    
    def execute(self, client) -> List[Dict[str, Any]]:
        """
        Execute the query.
        
        Args:
            client: ClickHouse client
        
        Returns:
            List of result dictionaries
        """
        sql, params = self.build_sql()
        results = client.execute(sql, params, with_column_types=True)
        rows, columns = results
        column_names = [c[0] for c in columns]
        
        return [dict(zip(column_names, row)) for row in rows]


class QueryBuilder:
    """
    Factory for creating various types of queries.
    
    Example:
        builder = QueryBuilder(client, registry)
        
        # Get object timeline
        timeline = builder.timeline("cart_123")
        
        # Get state at point in time
        state = builder.state_at("cart_123", target_time)
        
        # Get all objects of type
        objects = builder.objects_of_type("ShoppingCart")
    """
    
    def __init__(self, client, registry=None):
        """
        Initialize the query builder.
        
        Args:
            client: ClickHouse client
            registry: Optional TriLog registry for type info
        """
        self.client = client
        self.registry = registry
    
    def timeline(
        self,
        obj_id: str,
        time_range: Optional[TimeRange] = None,
    ) -> TimelineQuery:
        """
        Create a timeline query for an object.
        
        Args:
            obj_id: Object ID
            time_range: Optional time range
        
        Returns:
            TimelineQuery instance
        """
        query = TimelineQuery().for_object(obj_id)
        if time_range:
            query = query.in_time_range(time_range)
        return query
    
    def state_at(
        self,
        obj_id: str,
        target_time: datetime,
    ) -> Dict[str, Any]:
        """
        Get object state at a specific point in time.
        
        Args:
            obj_id: Object ID
            target_time: Target timestamp
        
        Returns:
            Dictionary of attribute values
        """
        sql = """
            SELECT 
                arrayJoin(mapKeys(attributes)) as key,
                argMax(attributes[key], timestamp) as value
            FROM trilog_events
            WHERE obj_id = %(obj_id)s
              AND timestamp <= %(target_time)s
            GROUP BY key
        """
        
        results = self.client.execute(sql, {
            "obj_id": obj_id,
            "target_time": target_time,
        })
        
        return {row[0]: row[1] for row in results}
    
    def objects_of_type(
        self,
        obj_type: str,
        time_range: Optional[TimeRange] = None,
        limit: int = 100,
    ) -> List[str]:
        """
        Get all object IDs of a specific type.
        
        Args:
            obj_type: Object type name
            time_range: Optional time range
            limit: Maximum results
        
        Returns:
            List of object IDs
        """
        conditions = ["obj_type = %(obj_type)s"]
        params = {"obj_type": obj_type, "limit": limit}
        
        if time_range:
            conditions.extend(time_range.to_sql_conditions())
        
        where_clause = " AND ".join(conditions)
        
        sql = f"""
            SELECT DISTINCT obj_id
            FROM trilog_events
            WHERE {where_clause}
            ORDER BY obj_id
            LIMIT %(limit)s
        """
        
        results = self.client.execute(sql, params)
        return [row[0] for row in results]
    
    def count_events(
        self,
        obj_id: Optional[str] = None,
        obj_type: Optional[str] = None,
        time_range: Optional[TimeRange] = None,
    ) -> int:
        """
        Count events matching criteria.
        
        Args:
            obj_id: Optional object ID filter
            obj_type: Optional object type filter
            time_range: Optional time range
        
        Returns:
            Event count
        """
        conditions = []
        params = {}
        
        if obj_id:
            conditions.append("obj_id = %(obj_id)s")
            params["obj_id"] = obj_id
        
        if obj_type:
            conditions.append("obj_type = %(obj_type)s")
            params["obj_type"] = obj_type
        
        if time_range:
            conditions.extend(time_range.to_sql_conditions())
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        sql = f"""
            SELECT count()
            FROM trilog_events
            WHERE {where_clause}
        """
        
        result = self.client.execute(sql, params)
        return result[0][0]
    
    def aggregate(
        self,
        obj_type: str,
        field: str,
        function: AggregateFunction,
        time_range: Optional[TimeRange] = None,
        group_by: Optional[str] = None,
    ) -> Union[Any, Dict[str, Any]]:
        """
        Run an aggregate query.
        
        Args:
            obj_type: Object type
            field: Field to aggregate
            function: Aggregate function
            time_range: Optional time range
            group_by: Optional grouping field
        
        Returns:
            Aggregate result or dict of grouped results
        """
        # Get the OTel attribute key
        if self.registry:
            obj_cls = self.registry.get_object(obj_type)
            if obj_cls:
                prefix = obj_cls.get_otel_prefix()
                attr_key = f"{prefix}.{field}"
            else:
                attr_key = field
        else:
            attr_key = field
        
        # Build aggregate expression
        if function == AggregateFunction.COUNT:
            agg_expr = f"count()"
        else:
            agg_expr = f"{function.value}(toFloat64OrZero(attributes['{attr_key}']))"
        
        conditions = [f"obj_type = '{obj_type}'"]
        if time_range:
            conditions.extend(time_range.to_sql_conditions())
        
        where_clause = " AND ".join(conditions)
        
        if group_by:
            group_attr = f"attributes['{group_by}']"
            sql = f"""
                SELECT {group_attr} as group_key, {agg_expr} as value
                FROM trilog_events
                WHERE {where_clause}
                GROUP BY group_key
            """
            results = self.client.execute(sql)
            return {row[0]: row[1] for row in results}
        else:
            sql = f"""
                SELECT {agg_expr}
                FROM trilog_events
                WHERE {where_clause}
            """
            result = self.client.execute(sql)
            return result[0][0]
