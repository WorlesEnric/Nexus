-- TriLog ClickHouse Initialization Script
-- This script creates the database and tables for TriLog storage.
-- Run this when setting up a new ClickHouse instance.

-- Create database
CREATE DATABASE IF NOT EXISTS trilog;

-- Switch to trilog database
USE trilog;

-- ============================================================================
-- MAIN EVENTS TABLE
-- Stores all TriLog events with full attributes
-- ============================================================================
CREATE TABLE IF NOT EXISTS trilog_events
(
    -- Core identifiers
    timestamp DateTime64(9) DEFAULT now64(9),
    obj_id String,
    obj_type LowCardinality(String),
    event_type LowCardinality(String) DEFAULT 'state_change',
    
    -- OpenTelemetry context
    trace_id String DEFAULT '',
    span_id String DEFAULT '',
    parent_span_id String DEFAULT '',
    
    -- Event payload (as JSON string for flexibility)
    attributes String DEFAULT '{}',
    
    -- Additional metadata
    severity_text LowCardinality(String) DEFAULT 'INFO',
    service_name LowCardinality(String) DEFAULT '',
    service_version String DEFAULT '',
    
    -- Indexing helpers
    _partition Date DEFAULT toDate(timestamp),
    _inserted_at DateTime64(3) DEFAULT now64(3)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(_partition)
ORDER BY (obj_type, obj_id, timestamp)
TTL _partition + INTERVAL 90 DAY DELETE
SETTINGS
    index_granularity = 8192,
    ttl_only_drop_parts = 1;

-- Create index for trace correlation
ALTER TABLE trilog_events
    ADD INDEX idx_trace_id trace_id TYPE bloom_filter GRANULARITY 4;

-- Create index for event type filtering
ALTER TABLE trilog_events
    ADD INDEX idx_event_type event_type TYPE set(100) GRANULARITY 4;


-- ============================================================================
-- SNAPSHOTS TABLE
-- Stores periodic state snapshots for faster reconstruction
-- ============================================================================
CREATE TABLE IF NOT EXISTS trilog_snapshots
(
    obj_id String,
    obj_type LowCardinality(String),
    timestamp DateTime64(9),
    state String,  -- Full state as JSON
    version UInt32 DEFAULT 1,
    
    _partition Date DEFAULT toDate(timestamp)
)
ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(_partition)
ORDER BY (obj_type, obj_id, timestamp)
SETTINGS
    index_granularity = 8192;


-- ============================================================================
-- PROCESSES TABLE
-- Stores trace-level aggregations for workflow analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS trilog_processes
(
    trace_id String,
    process_type LowCardinality(String),
    start_time DateTime64(9),
    end_time DateTime64(9) DEFAULT now64(9),
    duration_ms UInt64 DEFAULT 0,
    
    -- Process state
    current_phase LowCardinality(String) DEFAULT '',
    status LowCardinality(String) DEFAULT 'running',  -- running, completed, failed
    
    -- Participating objects
    obj_ids Array(String) DEFAULT [],
    
    -- Metadata
    attributes String DEFAULT '{}',
    span_count UInt32 DEFAULT 0,
    
    _partition Date DEFAULT toDate(start_time)
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(_partition)
ORDER BY (process_type, trace_id)
SETTINGS
    index_granularity = 8192;


-- ============================================================================
-- MIGRATIONS TABLE
-- Tracks schema migrations
-- ============================================================================
CREATE TABLE IF NOT EXISTS trilog_migrations
(
    version String,
    name String,
    applied_at DateTime DEFAULT now(),
    checksum String
)
ENGINE = MergeTree()
ORDER BY (version, applied_at);


-- ============================================================================
-- MATERIALIZED VIEWS FOR ANALYTICS
-- ============================================================================

-- Object activity summary (hourly)
CREATE MATERIALIZED VIEW IF NOT EXISTS trilog_object_activity_hourly
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (obj_type, hour)
AS SELECT
    obj_type,
    toStartOfHour(timestamp) AS hour,
    count() AS event_count,
    uniqExact(obj_id) AS unique_objects
FROM trilog_events
GROUP BY obj_type, hour;


-- Event type distribution (daily)
CREATE MATERIALIZED VIEW IF NOT EXISTS trilog_event_distribution_daily
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (obj_type, event_type, day)
AS SELECT
    obj_type,
    event_type,
    toDate(timestamp) AS day,
    count() AS event_count
FROM trilog_events
GROUP BY obj_type, event_type, day;


-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to extract JSON attribute
CREATE FUNCTION IF NOT EXISTS trilog_get_attr AS (attrs, key) -> 
    JSONExtractString(attrs, key);

-- Function to check if attribute exists
CREATE FUNCTION IF NOT EXISTS trilog_has_attr AS (attrs, key) -> 
    JSONHas(attrs, key);


-- ============================================================================
-- INITIAL MIGRATION RECORD
-- ============================================================================
INSERT INTO trilog_migrations (version, name, checksum)
VALUES ('001', 'initial_schema', 'trilog_v1.1_initial');


-- ============================================================================
-- SAMPLE DATA (for testing - remove in production)
-- ============================================================================
-- Uncomment to insert sample data:
/*
INSERT INTO trilog_events (obj_id, obj_type, event_type, attributes)
VALUES 
    ('cart_001', 'ShoppingCart', 'state_change', '{"item_count": 0, "total_value": 0.0}'),
    ('cart_001', 'ShoppingCart', 'state_change', '{"item_count": 2, "total_value": 29.99}'),
    ('cart_001', 'ShoppingCart', 'state_change', '{"item_count": 3, "total_value": 49.99}');
*/
