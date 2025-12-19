# TriLog - Model-Driven Observability System

[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![OpenTelemetry](https://img.shields.io/badge/OTel-1.20+-green.svg)](https://opentelemetry.io/)

**TriLog** is a Model-Driven Observability system that creates a functional **Digital Twin** of your runtime environment. Unlike traditional logging, TriLog enforces a strict relationship between your system's high-level design (the "Blueprint") and its live telemetry (the "Fingerprints").

## Key Features

- **Schema-First Design**: Define your system's entities and workflows using a Python DSL
- **OTel-Native**: Built on OpenTelemetry for industry-standard observability
- **Time-Travel Debugging**: Reconstruct the exact state of any object at any point in time
- **Context Propagation**: Automatic inheritance of object IDs across nested calls
- **Digital Twin**: Live reconstruction of system state from telemetry data

## Quick Start

### 1. Installation

```bash
pip install trilog
# or from source
pip install -e .
```

### 2. Define Your Schema

```python
# schema.py
from trilog.dsl import Object, Process, Integer, Float, String, List

class ShoppingCart(Object):
    """A user's shopping cart"""
    item_count = Integer(default=0)
    total_value = Float(default=0.0)
    items = List(String())
    status = String(default="active")

class CheckoutFlow(Process):
    """Distributed workflow for purchasing"""
    pass
```

### 3. Export Registry

```python
from trilog.dsl import Registry

registry = Registry()
registry.register(ShoppingCart)
registry.register(CheckoutFlow)
registry.export("registry.json")
```

### 4. Instrument Your Code

```python
from opentelemetry import baggage, context
from trilog.context import anchor, TriLogLogger

logger = TriLogLogger(__name__)

# Anchor to a specific object
with anchor("cart_123", ShoppingCart):
    # All logs automatically inherit the object ID
    logger.state_change(item_count=5, total_value=99.99)
    logger.event("item_added", item_id="SKU-001")
```

### 5. Reconstruct Digital Twin

```python
from trilog.engine import Reconstructor

reconstructor = Reconstructor(clickhouse_client)

# Get cart state at a specific time
cart_twin = reconstructor.reconstruct(
    obj_id="cart_123",
    target_time="2024-01-15T10:30:00Z"
)
print(f"Cart had {cart_twin.item_count} items worth ${cart_twin.total_value}")
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Your App      │     │  OTel Collector │     │   ClickHouse    │
│                 │────▶│                 │────▶│                 │
│  (Manual Plant) │     │  (Validation)   │     │  (Time-Series)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        │           ┌─────────────────┐                 │
        └──────────▶│    Registry     │◀────────────────┘
                    │  (JSON Schema)  │
                    └─────────────────┘
```

## The Three Channels

Every event in TriLog occupies a coordinate in 3D observability space:

| Channel     | Identity Mechanism | Storage Column                  |
|-------------|--------------------|---------------------------------|
| **Process** | Trace ID (OTel)    | `trace_id`                      |
| **Object**  | Baggage ID (OTel)  | `attributes['trilog.obj.id']`   |
| **Function**| Span ID / Log Msg  | `body` & `span_id`              |

## Docker Setup

Start the full stack with Docker Compose:

```bash
docker-compose up -d
```

This launches:
- **OTel Collector**: Receives and validates logs
- **ClickHouse**: Stores time-series telemetry
- **TriLog UI** (optional): Visual twin explorer

## Examples

See the `examples/` directory for complete implementations:

- **Nexus GraphStudio**: Full modeling of a complex web application
- **E-commerce**: Shopping cart and checkout workflow
- **Microservices**: Distributed tracing with digital twins

## Documentation

- [DSL Reference](docs/dsl.md)
- [Context Propagation](docs/context.md)
- [Query API](docs/queries.md)
- [Deployment Guide](docs/deployment.md)

## License

MIT License - See [LICENSE](LICENSE) for details.
