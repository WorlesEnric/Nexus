"""
TriLog Database Migrations

Provides a simple migration system for managing ClickHouse
schema changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Type
import hashlib
import json


@dataclass
class Migration:
    """
    Represents a single database migration.
    
    Example:
        migration = Migration(
            version="001",
            name="add_category_column",
            up="ALTER TABLE trilog_events ADD COLUMN category String",
            down="ALTER TABLE trilog_events DROP COLUMN category",
        )
    """
    version: str
    name: str
    up: str  # SQL to apply migration
    down: str  # SQL to rollback migration
    created_at: datetime = field(default_factory=datetime.utcnow)
    checksum: Optional[str] = None
    
    def __post_init__(self):
        if self.checksum is None:
            self.checksum = self._compute_checksum()
    
    def _compute_checksum(self) -> str:
        """Compute a checksum of the migration SQL"""
        content = f"{self.up}|{self.down}"
        return hashlib.sha256(content.encode()).hexdigest()[:16]
    
    @property
    def id(self) -> str:
        """Get the migration ID (version_name)"""
        return f"{self.version}_{self.name}"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "version": self.version,
            "name": self.name,
            "up": self.up,
            "down": self.down,
            "created_at": self.created_at.isoformat(),
            "checksum": self.checksum,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> Migration:
        """Create from dictionary"""
        return cls(
            version=data["version"],
            name=data["name"],
            up=data["up"],
            down=data["down"],
            created_at=datetime.fromisoformat(data.get("created_at", datetime.utcnow().isoformat())),
            checksum=data.get("checksum"),
        )


# Migrations tracking table schema
MIGRATIONS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS trilog_migrations (
    version String,
    name String,
    applied_at DateTime64(6) DEFAULT now64(6),
    checksum String,
    PRIMARY KEY (version)
) ENGINE = MergeTree()
ORDER BY version;
"""


class MigrationManager:
    """
    Manages database migrations for TriLog.
    
    Example:
        manager = MigrationManager(client)
        
        # Register migrations
        manager.add(Migration("001", "initial", up_sql, down_sql))
        manager.add(Migration("002", "add_index", up_sql, down_sql))
        
        # Apply pending migrations
        manager.migrate()
        
        # Rollback last migration
        manager.rollback()
    """
    
    def __init__(self, client, migrations_dir: Optional[Path] = None):
        """
        Initialize the migration manager.
        
        Args:
            client: ClickHouse client
            migrations_dir: Optional directory containing migration files
        """
        self.client = client
        self.migrations_dir = migrations_dir
        self._migrations: Dict[str, Migration] = {}
        self._initialized = False
    
    def _ensure_migrations_table(self) -> None:
        """Create the migrations tracking table if needed"""
        if not self._initialized:
            self.client.execute(MIGRATIONS_TABLE_SQL)
            self._initialized = True
    
    def add(self, migration: Migration) -> None:
        """
        Add a migration to the manager.
        
        Args:
            migration: Migration to add
        """
        self._migrations[migration.id] = migration
    
    def load_from_directory(self, directory: Optional[Path] = None) -> None:
        """
        Load migrations from a directory.
        
        Migration files should be named like:
        001_initial.json or 001_initial.sql
        
        Args:
            directory: Directory to load from (uses migrations_dir if not provided)
        """
        directory = directory or self.migrations_dir
        if not directory:
            raise ValueError("No migrations directory specified")
        
        directory = Path(directory)
        if not directory.exists():
            return
        
        for path in sorted(directory.glob("*.json")):
            with open(path) as f:
                data = json.load(f)
                migration = Migration.from_dict(data)
                self.add(migration)
    
    def get_applied(self) -> List[str]:
        """Get list of applied migration versions"""
        self._ensure_migrations_table()
        result = self.client.execute(
            "SELECT version FROM trilog_migrations ORDER BY version"
        )
        return [row[0] for row in result]
    
    def get_pending(self) -> List[Migration]:
        """Get list of pending migrations"""
        applied = set(self.get_applied())
        pending = [
            m for m in sorted(self._migrations.values(), key=lambda m: m.version)
            if m.version not in applied
        ]
        return pending
    
    def migrate(self, target_version: Optional[str] = None) -> List[str]:
        """
        Apply pending migrations.
        
        Args:
            target_version: Stop after reaching this version
        
        Returns:
            List of applied migration versions
        """
        self._ensure_migrations_table()
        applied = []
        
        for migration in self.get_pending():
            if target_version and migration.version > target_version:
                break
            
            # Apply the migration
            try:
                self.client.execute(migration.up)
                
                # Record in tracking table
                self.client.execute(
                    "INSERT INTO trilog_migrations (version, name, checksum) VALUES",
                    [(migration.version, migration.name, migration.checksum)]
                )
                
                applied.append(migration.version)
                print(f"Applied migration: {migration.id}")
                
            except Exception as e:
                print(f"Failed to apply migration {migration.id}: {e}")
                raise
        
        return applied
    
    def rollback(self, steps: int = 1) -> List[str]:
        """
        Rollback migrations.
        
        Args:
            steps: Number of migrations to rollback
        
        Returns:
            List of rolled back migration versions
        """
        self._ensure_migrations_table()
        applied = self.get_applied()
        
        if not applied:
            print("No migrations to rollback")
            return []
        
        rolled_back = []
        
        for version in reversed(applied[-steps:]):
            migration = None
            for m in self._migrations.values():
                if m.version == version:
                    migration = m
                    break
            
            if not migration:
                print(f"Warning: Migration {version} not found in registry")
                continue
            
            try:
                # Apply rollback
                self.client.execute(migration.down)
                
                # Remove from tracking table
                self.client.execute(
                    "ALTER TABLE trilog_migrations DELETE WHERE version = %(version)s",
                    {"version": version}
                )
                
                rolled_back.append(version)
                print(f"Rolled back migration: {migration.id}")
                
            except Exception as e:
                print(f"Failed to rollback migration {migration.id}: {e}")
                raise
        
        return rolled_back
    
    def status(self) -> Dict[str, Any]:
        """
        Get migration status.
        
        Returns:
            Dictionary with status information
        """
        applied = self.get_applied()
        pending = self.get_pending()
        
        return {
            "applied_count": len(applied),
            "pending_count": len(pending),
            "applied": applied,
            "pending": [m.id for m in pending],
            "latest_applied": applied[-1] if applied else None,
        }
    
    def generate(self, name: str) -> Migration:
        """
        Generate a new migration template.
        
        Args:
            name: Migration name (snake_case)
        
        Returns:
            New Migration instance
        """
        # Determine next version number
        existing = sorted(self._migrations.keys())
        if existing:
            last_version = existing[-1].split("_")[0]
            next_num = int(last_version) + 1
        else:
            next_num = 1
        
        version = f"{next_num:03d}"
        
        migration = Migration(
            version=version,
            name=name,
            up="-- Add your UP migration SQL here",
            down="-- Add your DOWN migration SQL here",
        )
        
        return migration
    
    def save_migration(self, migration: Migration, directory: Optional[Path] = None) -> Path:
        """
        Save a migration to a file.
        
        Args:
            migration: Migration to save
            directory: Directory to save to
        
        Returns:
            Path to saved file
        """
        directory = directory or self.migrations_dir
        if not directory:
            raise ValueError("No migrations directory specified")
        
        directory = Path(directory)
        directory.mkdir(parents=True, exist_ok=True)
        
        path = directory / f"{migration.id}.json"
        with open(path, "w") as f:
            json.dump(migration.to_dict(), f, indent=2)
        
        return path


# Pre-defined migrations for initial setup
INITIAL_MIGRATIONS = [
    Migration(
        version="001",
        name="initial_schema",
        up="""
            CREATE TABLE IF NOT EXISTS trilog_events (
                timestamp DateTime64(6) CODEC(Delta, ZSTD(1)),
                trace_id String CODEC(ZSTD(1)),
                span_id String CODEC(ZSTD(1)),
                obj_id String CODEC(ZSTD(1)),
                obj_type String CODEC(ZSTD(1)),
                body String CODEC(ZSTD(1)),
                severity_text String,
                attributes Map(String, String) CODEC(ZSTD(1))
            ) ENGINE = MergeTree()
            PARTITION BY toYYYYMM(timestamp)
            ORDER BY (obj_type, obj_id, timestamp)
            TTL timestamp + INTERVAL 90 DAY;
        """,
        down="DROP TABLE IF EXISTS trilog_events;",
    ),
    Migration(
        version="002",
        name="add_snapshots_table",
        up="""
            CREATE TABLE IF NOT EXISTS trilog_snapshots (
                snapshot_time DateTime64(6),
                obj_id String,
                obj_type String,
                version UInt64,
                state String CODEC(ZSTD(1))
            ) ENGINE = ReplacingMergeTree(version)
            PARTITION BY toYYYYMM(snapshot_time)
            ORDER BY (obj_type, obj_id, snapshot_time);
        """,
        down="DROP TABLE IF EXISTS trilog_snapshots;",
    ),
    Migration(
        version="003",
        name="add_processes_table",
        up="""
            CREATE TABLE IF NOT EXISTS trilog_processes (
                trace_id String,
                process_type String,
                started_at DateTime64(6),
                completed_at Nullable(DateTime64(6)),
                status String,
                duration_ms Nullable(UInt64),
                involved_objects Array(String),
                metadata Map(String, String)
            ) ENGINE = MergeTree()
            PARTITION BY toYYYYMM(started_at)
            ORDER BY (process_type, started_at);
        """,
        down="DROP TABLE IF EXISTS trilog_processes;",
    ),
]
