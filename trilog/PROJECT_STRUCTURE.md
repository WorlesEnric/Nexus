# TriLog Project Structure

```
trilog-project/
├── PROJECT_STRUCTURE.md          # This file
├── README.md                     # Project documentation
├── docker-compose.yml            # Docker setup for OTel Collector + ClickHouse
├── requirements.txt              # Python dependencies
├── setup.py                      # Package setup
│
├── trilog/                       # Core TriLog library
│   ├── __init__.py
│   ├── dsl/                      # Python DSL for schema definition
│   │   ├── __init__.py
│   │   ├── base.py               # Base classes (Object, Process, Field types)
│   │   ├── fields.py             # Field type definitions
│   │   └── registry.py           # Schema export to JSON Registry
│   │
│   ├── context/                  # OTel context management
│   │   ├── __init__.py
│   │   ├── anchor.py             # Context anchoring utilities
│   │   └── propagation.py        # Baggage propagation helpers
│   │
│   ├── collector/                # OTel Collector configuration
│   │   ├── __init__.py
│   │   ├── config.py             # Collector config generator
│   │   └── validator.py          # Log validation against registry
│   │
│   ├── storage/                  # ClickHouse integration
│   │   ├── __init__.py
│   │   ├── client.py             # ClickHouse client wrapper
│   │   ├── schema.py             # Table schema definitions
│   │   └── migrations.py         # Database migrations
│   │
│   └── engine/                   # Query & Reconstruction Engine
│       ├── __init__.py
│       ├── query.py              # Time-travel query builder
│       ├── reconstructor.py      # Digital Twin reconstruction
│       └── timeline.py           # Event timeline utilities
│
├── config/                       # Configuration files
│   ├── otel-collector-config.yaml
│   └── clickhouse-init.sql
│
├── examples/                     # Example implementations
│   └── nexus_graphstudio/        # Nexus GraphStudio modeling
│       ├── __init__.py
│       ├── schema.py             # TriLog schema for GraphStudio
│       ├── demo.py               # Demo application
│       └── README.md             # Example documentation
│
└── tests/                        # Test suite
    ├── __init__.py
    ├── test_dsl.py
    ├── test_context.py
    ├── test_storage.py
    └── test_reconstruction.py
```

## Component Overview

### 1. DSL Layer (`trilog/dsl/`)
- Define Objects (entities) and Processes (workflows)
- Field types: Integer, Float, String, Boolean, List, Dict, Timestamp
- Export schema to JSON Registry

### 2. Context Layer (`trilog/context/`)
- OpenTelemetry Baggage integration
- Automatic context propagation
- Anchor/detach lifecycle management

### 3. Collector Layer (`trilog/collector/`)
- OTel Collector configuration generation
- Log validation against schema registry
- Routing rules to ClickHouse

### 4. Storage Layer (`trilog/storage/`)
- ClickHouse client with async support
- Schema management and migrations
- Optimized columnar storage

### 5. Engine Layer (`trilog/engine/`)
- Time-travel queries
- Digital Twin reconstruction
- Event timeline analysis

### 6. Nexus GraphStudio Example
- Complete modeling of GraphStudio entities
- User, Workspace, Panel, Subscription objects
- Workflows for panel lifecycle, AI sync, etc.
