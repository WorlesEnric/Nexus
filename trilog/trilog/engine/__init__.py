"""
TriLog Query & Reconstruction Engine

This module provides the core functionality for:
- Time-travel queries
- Digital Twin reconstruction
- Event timeline analysis
"""

from trilog.engine.query import (
    TimelineQuery,
    QueryBuilder,
    TimeRange,
)

from trilog.engine.reconstructor import (
    Reconstructor,
    AsyncReconstructor,
    ReconstructionResult,
    ReconstructionMetadata,
    ReconstructionStrategy,
)

from trilog.engine.timeline import (
    Timeline,
    TimelineEvent,
    TimelineSegment,
    StateTransition,
    TransitionType,
    compute_diff,
    merge_timelines,
)

__all__ = [
    # Query
    "TimelineQuery",
    "QueryBuilder",
    "TimeRange",
    # Reconstructor
    "Reconstructor",
    "AsyncReconstructor",
    "ReconstructionResult",
    "ReconstructionMetadata",
    "ReconstructionStrategy",
    # Timeline
    "Timeline",
    "TimelineEvent",
    "TimelineSegment",
    "StateTransition",
    "TransitionType",
    "compute_diff",
    "merge_timelines",
]
