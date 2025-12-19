"""
TriLog initialization for Nexus AI

This module sets up OpenTelemetry and TriLog for the nexus-ai service.
It configures the OTLP exporter to send logs to the TriLog collector.

Uses the centralized trilog-schemas from the nexus-python root directory.
"""

import sys
import os
from pathlib import Path

# Add centralized schema path
# In dev: ../../trilog-schemas
# In Docker: /app/trilog-schemas
nexus_root = Path(__file__).parent.parent.parent
schema_path = nexus_root / "trilog-schemas"
if not schema_path.exists():
    raise RuntimeError(f"Centralized trilog-schemas not found at {schema_path}")
sys.path.insert(0, str(nexus_root))

# Add trilog library to path
dev_trilog_root = nexus_root / "trilog"
docker_trilog_root = Path("/trilog")

if docker_trilog_root.exists():
    trilog_root = docker_trilog_root
elif dev_trilog_root.exists():
    trilog_root = dev_trilog_root
    sys.path.insert(0, str(trilog_root))
else:
    raise RuntimeError("Cannot find trilog library directory")

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# Import TriLog logger
from trilog.context import TriLogLogger

# Import centralized Nexus registry
from trilog_schemas.registry import nexus_registry

# Use the centralized registry
registry = nexus_registry


def initialize_trilog():
    """
    Initialize TriLog with OpenTelemetry configuration.

    Detects whether running in Kubernetes or locally and configures
    the appropriate OTLP endpoint.

    Returns:
        Registry: The Nexus schema registry
    """
    # Detect K8s environment
    in_k8s = os.path.exists("/var/run/secrets/kubernetes.io")

    if in_k8s:
        # Use FQDN for cross-namespace communication in K8s
        # Falls back to correct default if env var not set
        endpoint = os.getenv(
            "OTEL_ENDPOINT",
            "trilog-otel-collector.trilog-system.svc.cluster.local:4317"
        )
    else:
        # Local development - assume port-forward or docker-compose
        endpoint = os.getenv("OTEL_ENDPOINT", "localhost:4317")

    # Create resource with service metadata
    resource = Resource.create({
        SERVICE_NAME: "nexus-ai",
        SERVICE_VERSION: "1.0.0",
        "deployment.environment": os.getenv("DEPLOYMENT_ENV", "development"),
        "trilog.registry.name": registry.name,
        "trilog.registry.version": registry.version,
    })

    # Configure tracer provider
    tracer_provider = TracerProvider(resource=resource)

    # Add OTLP exporter
    otlp_exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
    span_processor = BatchSpanProcessor(otlp_exporter)
    tracer_provider.add_span_processor(span_processor)

    # Set global tracer provider
    trace.set_tracer_provider(tracer_provider)

    print(f"✓ TriLog initialized: {registry.name} v{registry.version}")
    print(f"  Service: nexus-ai")
    print(f"  OTLP Endpoint: {endpoint}")
    print(f"  Environment: {os.getenv('DEPLOYMENT_ENV', 'development')}")

    return registry


def get_logger(name: str) -> TriLogLogger:
    """
    Create a TriLog logger instance.

    Args:
        name: Logger name (e.g., "nexus_ai.sync_agent")

    Returns:
        TriLogLogger: Configured logger instance
    """
    return TriLogLogger(name)
