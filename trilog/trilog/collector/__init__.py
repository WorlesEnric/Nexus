"""
TriLog Collector Configuration

This module provides utilities for configuring the OpenTelemetry
Collector for TriLog. It includes:
- Config generation for the OTel Collector
- Log validation against the registry
- Routing rules for ClickHouse storage
"""

from trilog.collector.config import (
    CollectorConfig,
    generate_collector_config,
)

from trilog.collector.validator import (
    LogValidator,
    ValidationResult,
)

__all__ = [
    "CollectorConfig",
    "generate_collector_config",
    "LogValidator",
    "ValidationResult",
]
