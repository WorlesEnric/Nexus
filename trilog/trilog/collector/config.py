"""
TriLog OTel Collector Configuration

Generates configuration files for the OpenTelemetry Collector
that enable TriLog-specific processing and routing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional
import yaml

from trilog.dsl.registry import Registry


@dataclass
class CollectorConfig:
    """
    Configuration for the OpenTelemetry Collector.
    
    Attributes:
        registry: The TriLog registry for schema validation
        otlp_grpc_port: Port for OTLP gRPC receiver
        otlp_http_port: Port for OTLP HTTP receiver
        clickhouse_endpoint: ClickHouse connection string
        clickhouse_database: ClickHouse database name
        clickhouse_table: ClickHouse table name
        batch_timeout: Batch timeout in seconds
        batch_size: Maximum batch size
    """
    registry: Optional[Registry] = None
    otlp_grpc_port: int = 4317
    otlp_http_port: int = 4318
    clickhouse_endpoint: str = "tcp://localhost:9000"
    clickhouse_database: str = "trilog"
    clickhouse_table: str = "events"
    batch_timeout: int = 5
    batch_size: int = 1000
    enable_debug: bool = False
    service_name: str = "trilog-collector"
    extra_processors: Dict[str, Any] = field(default_factory=dict)
    
    def to_yaml(self) -> str:
        """Generate the collector YAML configuration"""
        config = self._build_config()
        return yaml.dump(config, default_flow_style=False, sort_keys=False)
    
    def _build_config(self) -> Dict[str, Any]:
        """Build the full collector configuration"""
        config = {
            "receivers": self._build_receivers(),
            "processors": self._build_processors(),
            "exporters": self._build_exporters(),
            "extensions": self._build_extensions(),
            "service": self._build_service(),
        }
        return config
    
    def _build_receivers(self) -> Dict[str, Any]:
        """Build the receivers configuration"""
        return {
            "otlp": {
                "protocols": {
                    "grpc": {
                        "endpoint": f"0.0.0.0:{self.otlp_grpc_port}",
                    },
                    "http": {
                        "endpoint": f"0.0.0.0:{self.otlp_http_port}",
                    },
                }
            }
        }
    
    def _build_processors(self) -> Dict[str, Any]:
        """Build the processors configuration"""
        processors = {
            # Batch processor for efficient export
            "batch": {
                "timeout": f"{self.batch_timeout}s",
                "send_batch_size": self.batch_size,
            },
            # Memory limiter for stability
            "memory_limiter": {
                "check_interval": "1s",
                "limit_mib": 512,
                "spike_limit_mib": 128,
            },
            # TriLog context enrichment
            "attributes/trilog": {
                "actions": [
                    {
                        "key": "trilog.collector.processed_at",
                        "action": "insert",
                        "value": "${timestamp}",
                    },
                    {
                        "key": "trilog.collector.version",
                        "action": "insert",
                        "value": "1.1.0",
                    },
                ]
            },
            # Resource detection
            "resource": {
                "attributes": [
                    {
                        "key": "service.name",
                        "value": self.service_name,
                        "action": "upsert",
                    },
                ]
            },
        }
        
        # Add registry validation if registry is provided
        if self.registry:
            processors["filter/trilog_validate"] = self._build_validation_filter()
        
        # Add extra processors
        processors.update(self.extra_processors)
        
        return processors
    
    def _build_validation_filter(self) -> Dict[str, Any]:
        """Build the registry validation filter"""
        # Build a filter that checks for required attributes
        return {
            "logs": {
                "include": {
                    "match_type": "regexp",
                    "record_attributes": [
                        {
                            "key": "trilog.obj.id",
                            "value": ".+",  # Must be non-empty
                        }
                    ]
                }
            }
        }
    
    def _build_exporters(self) -> Dict[str, Any]:
        """Build the exporters configuration"""
        exporters = {
            # ClickHouse exporter for logs
            "clickhouse": {
                "endpoint": self.clickhouse_endpoint,
                "database": self.clickhouse_database,
                "logs_table_name": self.clickhouse_table,
                "timeout": "10s",
                "retry_on_failure": {
                    "enabled": True,
                    "initial_interval": "5s",
                    "max_interval": "30s",
                    "max_elapsed_time": "300s",
                },
                "sending_queue": {
                    "enabled": True,
                    "num_consumers": 2,
                    "queue_size": 1000,
                },
            },
        }
        
        # Add debug exporter if enabled
        if self.enable_debug:
            exporters["debug"] = {
                "verbosity": "detailed",
            }
        
        return exporters
    
    def _build_extensions(self) -> Dict[str, Any]:
        """Build the extensions configuration"""
        return {
            "health_check": {
                "endpoint": "0.0.0.0:13133",
            },
            "zpages": {
                "endpoint": "0.0.0.0:55679",
            },
        }
    
    def _build_service(self) -> Dict[str, Any]:
        """Build the service configuration"""
        processors = ["memory_limiter", "batch", "attributes/trilog", "resource"]
        
        if self.registry:
            processors.append("filter/trilog_validate")
        
        # Add extra processor names
        for proc_name in self.extra_processors:
            if proc_name not in processors:
                processors.append(proc_name)
        
        exporters = ["clickhouse"]
        if self.enable_debug:
            exporters.append("debug")
        
        return {
            "extensions": ["health_check", "zpages"],
            "pipelines": {
                "logs": {
                    "receivers": ["otlp"],
                    "processors": processors,
                    "exporters": exporters,
                },
                "traces": {
                    "receivers": ["otlp"],
                    "processors": ["memory_limiter", "batch"],
                    "exporters": exporters,
                },
            },
            "telemetry": {
                "logs": {
                    "level": "info" if not self.enable_debug else "debug",
                },
                "metrics": {
                    "address": "0.0.0.0:8888",
                },
            },
        }
    
    def save(self, path: Path | str) -> None:
        """Save the configuration to a file"""
        path = Path(path)
        path.write_text(self.to_yaml())


def generate_collector_config(
    registry: Optional[Registry] = None,
    clickhouse_host: str = "localhost",
    clickhouse_port: int = 9000,
    **kwargs
) -> CollectorConfig:
    """
    Generate a collector configuration with sensible defaults.
    
    Args:
        registry: Optional TriLog registry for validation
        clickhouse_host: ClickHouse host
        clickhouse_port: ClickHouse port
        **kwargs: Additional configuration options
    
    Returns:
        CollectorConfig instance
    """
    endpoint = f"tcp://{clickhouse_host}:{clickhouse_port}"
    
    return CollectorConfig(
        registry=registry,
        clickhouse_endpoint=endpoint,
        **kwargs
    )


def generate_docker_compose_config(
    collector_config: CollectorConfig,
    clickhouse_password: str = "trilog",
) -> str:
    """
    Generate a docker-compose.yml for the TriLog stack.
    
    Args:
        collector_config: The collector configuration
        clickhouse_password: ClickHouse default password
    
    Returns:
        YAML string for docker-compose
    """
    compose = {
        "version": "3.8",
        "services": {
            "otel-collector": {
                "image": "otel/opentelemetry-collector-contrib:latest",
                "container_name": "trilog-collector",
                "command": ["--config=/etc/otel-collector-config.yaml"],
                "volumes": [
                    "./otel-collector-config.yaml:/etc/otel-collector-config.yaml:ro",
                ],
                "ports": [
                    f"{collector_config.otlp_grpc_port}:4317",
                    f"{collector_config.otlp_http_port}:4318",
                    "13133:13133",  # health check
                    "55679:55679",  # zpages
                ],
                "depends_on": ["clickhouse"],
                "restart": "unless-stopped",
            },
            "clickhouse": {
                "image": "clickhouse/clickhouse-server:latest",
                "container_name": "trilog-clickhouse",
                "environment": {
                    "CLICKHOUSE_DB": collector_config.clickhouse_database,
                    "CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT": "1",
                    "CLICKHOUSE_PASSWORD": clickhouse_password,
                },
                "volumes": [
                    "clickhouse_data:/var/lib/clickhouse",
                    "./clickhouse-init.sql:/docker-entrypoint-initdb.d/init.sql:ro",
                ],
                "ports": [
                    "8123:8123",  # HTTP
                    "9000:9000",  # Native
                ],
                "restart": "unless-stopped",
            },
        },
        "volumes": {
            "clickhouse_data": {},
        },
    }
    
    return yaml.dump(compose, default_flow_style=False, sort_keys=False)
