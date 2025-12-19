"""
TriLog Storage Layer

This module provides the ClickHouse integration for storing
and querying TriLog telemetry data.

Key components:
- ClickHouseClient: Async client wrapper
- Schema management and migrations
- Optimized time-series queries
"""

from trilog.storage.client import (
    ClickHouseClient,
    AsyncClickHouseClient,
)

from trilog.storage.schema import (
    TableSchema,
    create_tables,
)

from trilog.storage.migrations import (
    MigrationManager,
    Migration,
)

__all__ = [
    "ClickHouseClient",
    "AsyncClickHouseClient",
    "TableSchema",
    "create_tables",
    "MigrationManager",
    "Migration",
]
