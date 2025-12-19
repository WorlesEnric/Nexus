"""
TriLog ClickHouse Schema Definitions

Defines the table schemas for storing TriLog telemetry data
in ClickHouse.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Type
import textwrap

from trilog.dsl.registry import Registry


class ColumnType(str, Enum):
    """ClickHouse column types"""
    STRING = "String"
    INT8 = "Int8"
    INT16 = "Int16"
    INT32 = "Int32"
    INT64 = "Int64"
    UINT8 = "UInt8"
    UINT16 = "UInt16"
    UINT32 = "UInt32"
    UINT64 = "UInt64"
    FLOAT32 = "Float32"
    FLOAT64 = "Float64"
    DATETIME = "DateTime"
    DATETIME64 = "DateTime64(6)"
    DATE = "Date"
    UUID = "UUID"
    ARRAY_STRING = "Array(String)"
    MAP_STRING = "Map(String, String)"
    JSON = "JSON"


@dataclass
class Column:
    """Definition of a table column"""
    name: str
    type: ColumnType
    nullable: bool = False
    default: Optional[str] = None
    codec: Optional[str] = None
    comment: Optional[str] = None
    
    def to_sql(self) -> str:
        """Generate SQL column definition"""
        type_str = self.type.value
        if self.nullable:
            type_str = f"Nullable({type_str})"
        
        parts = [self.name, type_str]
        
        if self.default:
            parts.append(f"DEFAULT {self.default}")
        
        if self.codec:
            parts.append(f"CODEC({self.codec})")
        
        if self.comment:
            parts.append(f"COMMENT '{self.comment}'")
        
        return " ".join(parts)


@dataclass
class TableSchema:
    """
    Definition of a ClickHouse table schema.
    
    Example:
        schema = TableSchema(
            name="trilog_events",
            columns=[
                Column("timestamp", ColumnType.DATETIME64),
                Column("obj_id", ColumnType.STRING),
                ...
            ],
            engine="MergeTree()",
            partition_by="toYYYYMM(timestamp)",
            order_by=["obj_type", "obj_id", "timestamp"],
        )
        
        print(schema.to_sql())
    """
    name: str
    columns: List[Column]
    engine: str = "MergeTree()"
    partition_by: Optional[str] = None
    order_by: List[str] = field(default_factory=list)
    primary_key: Optional[List[str]] = None
    ttl: Optional[str] = None
    settings: Dict[str, Any] = field(default_factory=dict)
    
    def to_sql(self, if_not_exists: bool = True) -> str:
        """Generate CREATE TABLE SQL"""
        lines = []
        
        # CREATE TABLE
        exists = "IF NOT EXISTS " if if_not_exists else ""
        lines.append(f"CREATE TABLE {exists}{self.name} (")
        
        # Columns
        col_defs = [f"    {col.to_sql()}" for col in self.columns]
        lines.append(",\n".join(col_defs))
        
        lines.append(f") ENGINE = {self.engine}")
        
        # Partition
        if self.partition_by:
            lines.append(f"PARTITION BY {self.partition_by}")
        
        # Order
        if self.order_by:
            order = ", ".join(self.order_by)
            lines.append(f"ORDER BY ({order})")
        
        # Primary key (if different from order by)
        if self.primary_key:
            pk = ", ".join(self.primary_key)
            lines.append(f"PRIMARY KEY ({pk})")
        
        # TTL
        if self.ttl:
            lines.append(f"TTL {self.ttl}")
        
        # Settings
        if self.settings:
            settings_str = ", ".join(f"{k}={v}" for k, v in self.settings.items())
            lines.append(f"SETTINGS {settings_str}")
        
        return "\n".join(lines) + ";"
    
    def get_drop_sql(self, if_exists: bool = True) -> str:
        """Generate DROP TABLE SQL"""
        exists = "IF EXISTS " if if_exists else ""
        return f"DROP TABLE {exists}{self.name};"


# Standard TriLog event table schema
TRILOG_EVENTS_SCHEMA = TableSchema(
    name="trilog_events",
    columns=[
        Column("timestamp", ColumnType.DATETIME64, codec="Delta, ZSTD(1)", 
               comment="Event timestamp with microsecond precision"),
        Column("trace_id", ColumnType.STRING, codec="ZSTD(1)",
               comment="OpenTelemetry trace ID"),
        Column("span_id", ColumnType.STRING, codec="ZSTD(1)",
               comment="OpenTelemetry span ID"),
        Column("obj_id", ColumnType.STRING, codec="ZSTD(1)",
               comment="TriLog object ID"),
        Column("obj_type", ColumnType.STRING, codec="ZSTD(1)",
               comment="TriLog object type name"),
        Column("body", ColumnType.STRING, codec="ZSTD(1)",
               comment="Log message body"),
        Column("severity_text", ColumnType.STRING,
               comment="Log severity level"),
        Column("severity_number", ColumnType.INT32, default="0",
               comment="Numeric severity"),
        Column("attributes", ColumnType.MAP_STRING, codec="ZSTD(1)",
               comment="Event attributes as key-value map"),
        Column("resource_attributes", ColumnType.MAP_STRING, nullable=True,
               codec="ZSTD(1)", comment="Resource attributes"),
        Column("flags", ColumnType.UINT32, default="0",
               comment="Log record flags"),
    ],
    engine="MergeTree()",
    partition_by="toYYYYMM(timestamp)",
    order_by=["obj_type", "obj_id", "timestamp"],
    ttl="timestamp + INTERVAL 90 DAY",
    settings={"index_granularity": 8192},
)


# Object state snapshots table (for faster reconstruction)
TRILOG_SNAPSHOTS_SCHEMA = TableSchema(
    name="trilog_snapshots",
    columns=[
        Column("snapshot_time", ColumnType.DATETIME64,
               comment="Time this snapshot was taken"),
        Column("obj_id", ColumnType.STRING,
               comment="Object ID"),
        Column("obj_type", ColumnType.STRING,
               comment="Object type name"),
        Column("version", ColumnType.UINT64,
               comment="Object version at snapshot"),
        Column("state", ColumnType.STRING, codec="ZSTD(1)",
               comment="JSON-encoded object state"),
    ],
    engine="ReplacingMergeTree(version)",
    partition_by="toYYYYMM(snapshot_time)",
    order_by=["obj_type", "obj_id", "snapshot_time"],
)


# Process/trace summary table
TRILOG_PROCESSES_SCHEMA = TableSchema(
    name="trilog_processes",
    columns=[
        Column("trace_id", ColumnType.STRING,
               comment="Trace ID"),
        Column("process_type", ColumnType.STRING,
               comment="Process type name"),
        Column("started_at", ColumnType.DATETIME64,
               comment="Process start time"),
        Column("completed_at", ColumnType.DATETIME64, nullable=True,
               comment="Process completion time"),
        Column("status", ColumnType.STRING,
               comment="Process status (started, completed, failed)"),
        Column("duration_ms", ColumnType.UINT64, nullable=True,
               comment="Duration in milliseconds"),
        Column("involved_objects", ColumnType.ARRAY_STRING,
               comment="Object IDs involved in this process"),
        Column("metadata", ColumnType.MAP_STRING,
               comment="Additional process metadata"),
    ],
    engine="MergeTree()",
    partition_by="toYYYYMM(started_at)",
    order_by=["process_type", "started_at"],
)


def create_tables(
    client,
    registry: Optional[Registry] = None,
    include_snapshots: bool = True,
    include_processes: bool = True,
) -> None:
    """
    Create all TriLog tables in ClickHouse.
    
    Args:
        client: ClickHouse client
        registry: Optional registry for custom indexed columns
        include_snapshots: Create snapshots table
        include_processes: Create processes table
    """
    # Create main events table
    events_schema = TRILOG_EVENTS_SCHEMA
    
    # Add indexed columns from registry if provided
    if registry:
        events_schema = _add_registry_columns(events_schema, registry)
    
    client.execute(events_schema.to_sql())
    
    if include_snapshots:
        client.execute(TRILOG_SNAPSHOTS_SCHEMA.to_sql())
    
    if include_processes:
        client.execute(TRILOG_PROCESSES_SCHEMA.to_sql())


def _add_registry_columns(schema: TableSchema, registry: Registry) -> TableSchema:
    """Add columns for indexed registry fields"""
    from trilog.dsl.fields import FieldType
    
    # Create a copy of columns
    columns = list(schema.columns)
    
    # Map field types to ClickHouse types
    type_map = {
        FieldType.INTEGER: ColumnType.INT64,
        FieldType.FLOAT: ColumnType.FLOAT64,
        FieldType.STRING: ColumnType.STRING,
        FieldType.BOOLEAN: ColumnType.UINT8,
        FieldType.TIMESTAMP: ColumnType.DATETIME64,
    }
    
    # Add columns for indexed fields
    for obj_cls in registry.get_all_objects().values():
        prefix = obj_cls.get_otel_prefix()
        for name, field_def in obj_cls.get_fields().items():
            if field_def.indexed:
                col_type = type_map.get(field_def.field_type, ColumnType.STRING)
                col_name = f"idx_{prefix}_{name}".replace(".", "_")
                columns.append(Column(
                    name=col_name,
                    type=col_type,
                    nullable=True,
                    comment=f"Indexed: {prefix}.{name}"
                ))
    
    # Return new schema with added columns
    return TableSchema(
        name=schema.name,
        columns=columns,
        engine=schema.engine,
        partition_by=schema.partition_by,
        order_by=schema.order_by,
        ttl=schema.ttl,
        settings=schema.settings,
    )


def get_init_sql(database: str = "trilog") -> str:
    """
    Generate initialization SQL for ClickHouse.
    
    This creates the database and all required tables.
    
    Args:
        database: Database name
    
    Returns:
        SQL string
    """
    return textwrap.dedent(f"""
        -- TriLog ClickHouse Initialization
        -- Auto-generated
        
        CREATE DATABASE IF NOT EXISTS {database};
        
        USE {database};
        
        {TRILOG_EVENTS_SCHEMA.to_sql()}
        
        {TRILOG_SNAPSHOTS_SCHEMA.to_sql()}
        
        {TRILOG_PROCESSES_SCHEMA.to_sql()}
        
        -- Create materialized view for object latest state
        CREATE MATERIALIZED VIEW IF NOT EXISTS trilog_object_latest
        ENGINE = ReplacingMergeTree(timestamp)
        ORDER BY (obj_type, obj_id)
        AS SELECT
            obj_id,
            obj_type,
            max(timestamp) as timestamp,
            argMax(attributes, timestamp) as latest_attributes
        FROM trilog_events
        GROUP BY obj_id, obj_type;
    """).strip()
