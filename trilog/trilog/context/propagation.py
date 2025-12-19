"""
TriLog Context Propagation

Provides the TriLogLogger for emitting logs with automatic context
enrichment, and utilities for setting up OpenTelemetry.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Optional, Type
import json

from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.resources import Resource
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.baggage import get_baggage

from trilog.context.anchor import get_current_anchor, get_current_obj_id, get_current_obj_type
from trilog.dsl.base import Object


# Global state for OTel providers
_tracer_provider: Optional[TracerProvider] = None
_meter_provider: Optional[MeterProvider] = None
_is_initialized = False


def setup_otel(
    service_name: str = "trilog-app",
    otlp_endpoint: str = "localhost:4317",
    resource_attributes: Optional[Dict[str, str]] = None,
) -> None:
    """
    Initialize OpenTelemetry with TriLog-compatible configuration.
    
    Args:
        service_name: Name of your service
        otlp_endpoint: OTLP collector endpoint
        resource_attributes: Additional resource attributes
    """
    global _tracer_provider, _meter_provider, _is_initialized
    
    if _is_initialized:
        return
    
    # Build resource
    attrs = {
        "service.name": service_name,
        "trilog.version": "1.1.0",
    }
    if resource_attributes:
        attrs.update(resource_attributes)
    
    resource = Resource.create(attrs)
    
    # Set up tracing
    _tracer_provider = TracerProvider(resource=resource)
    span_exporter = OTLPSpanExporter(endpoint=otlp_endpoint, insecure=True)
    _tracer_provider.add_span_processor(BatchSpanProcessor(span_exporter))
    trace.set_tracer_provider(_tracer_provider)
    
    # Set up metrics
    _meter_provider = MeterProvider(resource=resource)
    metrics.set_meter_provider(_meter_provider)
    
    _is_initialized = True


def get_tracer(name: str = "trilog") -> trace.Tracer:
    """Get an OpenTelemetry tracer"""
    return trace.get_tracer(name)


def get_meter(name: str = "trilog") -> metrics.Meter:
    """Get an OpenTelemetry meter"""
    return metrics.get_meter(name)


class TriLogLogger:
    """
    Logger that automatically enriches logs with TriLog context.
    
    This logger integrates with Python's standard logging and
    OpenTelemetry to ensure all logs include the current anchor
    context (object ID, type, etc.).
    
    Example:
        logger = TriLogLogger(__name__)
        
        with anchor("cart_123", ShoppingCart):
            # Logs include trilog.obj.id=cart_123 automatically
            logger.state_change(item_count=5, total_value=99.99)
            logger.event("item_added", item_id="SKU-001")
    """
    
    def __init__(
        self,
        name: str,
        level: int = logging.INFO,
    ):
        """
        Initialize a TriLogLogger.
        
        Args:
            name: Logger name (typically __name__)
            level: Logging level
        """
        self._logger = logging.getLogger(name)
        self._logger.setLevel(level)
        self._name = name
        
        # Ensure we have a handler
        if not self._logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(TriLogFormatter())
            self._logger.addHandler(handler)
    
    def _get_trilog_attributes(self) -> Dict[str, Any]:
        """Get current TriLog context attributes"""
        attrs = {}
        
        # Get from anchor context
        anchor = get_current_anchor()
        if anchor is not None:
            attrs["trilog.obj.id"] = anchor.obj_id
            attrs["trilog.obj.type"] = anchor.type_name
            attrs["trilog.anchor.depth"] = 0  # Will be updated
            
            # Count depth
            depth = 0
            current = anchor
            while current.parent is not None:
                depth += 1
                current = current.parent
            attrs["trilog.anchor.depth"] = depth
            
            # Add metadata
            for key, value in anchor.metadata.items():
                attrs[f"trilog.meta.{key}"] = value
        else:
            # Try to get from baggage directly
            obj_id = get_current_obj_id()
            if obj_id:
                attrs["trilog.obj.id"] = obj_id
            obj_type = get_current_obj_type()
            if obj_type:
                attrs["trilog.obj.type"] = obj_type
        
        return attrs
    
    def _log(
        self,
        level: int,
        message: str,
        category: str = "general",
        **attributes
    ) -> None:
        """Internal logging method"""
        # Merge context attributes with provided attributes
        all_attrs = self._get_trilog_attributes()
        all_attrs["trilog.log.category"] = category
        all_attrs["trilog.log.timestamp"] = datetime.utcnow().isoformat()
        
        # Add span context if available
        span = trace.get_current_span()
        if span.is_recording():
            ctx = span.get_span_context()
            all_attrs["trace_id"] = format(ctx.trace_id, '032x')
            all_attrs["span_id"] = format(ctx.span_id, '016x')
        
        # Add user-provided attributes
        all_attrs.update(attributes)
        
        # Log using standard logger
        self._logger.log(level, message, extra={"trilog_attrs": all_attrs})
        
        # Also add as span events if in a span
        if span.is_recording():
            span.add_event(message, attributes=all_attrs)
    
    def state_change(self, **fields) -> None:
        """
        Log a state change event.
        
        This is used when object fields are modified.
        
        Args:
            **fields: Field names and their new values
        """
        anchor = get_current_anchor()
        if anchor is None:
            raise RuntimeError("state_change requires an active anchor context")
        
        # Prefix fields with object type
        prefix = anchor.otel_prefix
        prefixed_fields = {
            f"{prefix}.{k}": v for k, v in fields.items()
        }
        
        field_names = ", ".join(fields.keys())
        self._log(
            logging.INFO,
            f"State change: {field_names}",
            category="state_change",
            **prefixed_fields
        )
    
    def event(self, event_name: str, **data) -> None:
        """
        Log a domain event.
        
        This is used for significant events in your application logic.
        
        Args:
            event_name: Name of the event
            **data: Event data
        """
        self._log(
            logging.INFO,
            f"Event: {event_name}",
            category="event",
            event_name=event_name,
            **data
        )
    
    def action(self, action_name: str, **params) -> None:
        """
        Log an action/command.
        
        This is used when an action is triggered (before execution).
        
        Args:
            action_name: Name of the action
            **params: Action parameters
        """
        self._log(
            logging.INFO,
            f"Action: {action_name}",
            category="action",
            action_name=action_name,
            **params
        )
    
    def error(self, message: str, error: Optional[Exception] = None, **context) -> None:
        """
        Log an error.
        
        Args:
            message: Error message
            error: Optional exception
            **context: Additional context
        """
        attrs = dict(context)
        if error is not None:
            attrs["error.type"] = type(error).__name__
            attrs["error.message"] = str(error)
        
        self._log(logging.ERROR, message, category="error", **attrs)
    
    def debug(self, message: str, **context) -> None:
        """Log a debug message"""
        self._log(logging.DEBUG, message, category="debug", **context)
    
    def info(self, message: str, **context) -> None:
        """Log an info message"""
        self._log(logging.INFO, message, category="info", **context)
    
    def warning(self, message: str, **context) -> None:
        """Log a warning message"""
        self._log(logging.WARNING, message, category="warning", **context)


class TriLogFormatter(logging.Formatter):
    """
    Custom formatter that includes TriLog attributes in log output.
    """
    
    def format(self, record: logging.LogRecord) -> str:
        # Get trilog attributes
        attrs = getattr(record, 'trilog_attrs', {})
        
        # Build the log line
        timestamp = attrs.get('trilog.log.timestamp', datetime.utcnow().isoformat())
        obj_id = attrs.get('trilog.obj.id', '-')
        obj_type = attrs.get('trilog.obj.type', '-')
        category = attrs.get('trilog.log.category', 'general')
        
        # Format: [timestamp] [category] [type:id] message {attrs}
        base = f"[{timestamp}] [{category:12}] [{obj_type}:{obj_id}] {record.getMessage()}"
        
        # Add relevant attributes (exclude internal ones)
        extra_attrs = {
            k: v for k, v in attrs.items()
            if not k.startswith('trilog.') and k not in ('trace_id', 'span_id')
        }
        
        if extra_attrs:
            attrs_str = json.dumps(extra_attrs, default=str)
            base += f" {attrs_str}"
        
        return base


class TriLogHandler(logging.Handler):
    """
    Logging handler that sends logs to an OTLP endpoint.
    
    This handler can be added to existing loggers to enable
    TriLog context propagation.
    """
    
    def __init__(
        self,
        otlp_endpoint: str = "localhost:4317",
        level: int = logging.INFO,
    ):
        super().__init__(level)
        self.otlp_endpoint = otlp_endpoint
        self._tracer = get_tracer("trilog.logs")
    
    def emit(self, record: logging.LogRecord) -> None:
        try:
            # Get current span
            span = trace.get_current_span()
            if span.is_recording():
                # Get trilog attributes
                attrs = getattr(record, 'trilog_attrs', {})
                attrs['log.level'] = record.levelname
                attrs['log.logger'] = record.name
                
                # Add as span event
                span.add_event(record.getMessage(), attributes=attrs)
        except Exception:
            self.handleError(record)
