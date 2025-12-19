"""
NXML AST Cache - LRU cache for parsed ASTs.
"""

import hashlib
from typing import Optional, Dict
from cachetools import LRUCache
from threading import Lock
from nexus_protocol.ast import NexusPanelAST


class ASTCache:
    """
    LRU cache for parsed NXML ASTs.

    Uses SHA-256 hash of source as cache key.
    Thread-safe with metrics tracking.
    """

    _instance: Optional["ASTCache"] = None
    _lock = Lock()

    def __init__(self, max_size: int = 1000):
        self.cache: LRUCache = LRUCache(maxsize=max_size)
        self.hits = 0
        self.misses = 0

    @classmethod
    def get_instance(cls) -> "ASTCache":
        """Get singleton instance."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def get(self, nxml_source: str) -> Optional[NexusPanelAST]:
        """
        Get cached AST by NXML source.

        Args:
            nxml_source: NXML source code

        Returns:
            Cached AST or None if not found
        """
        key = self._compute_hash(nxml_source)

        with self._lock:
            if key in self.cache:
                self.hits += 1
                return self.cache[key]

            self.misses += 1
            return None

    def put(self, nxml_source: str, ast: NexusPanelAST) -> None:
        """
        Cache parsed AST.

        Args:
            nxml_source: NXML source code
            ast: Parsed AST
        """
        key = self._compute_hash(nxml_source)

        with self._lock:
            self.cache[key] = ast

    def clear(self) -> None:
        """Clear the cache."""
        with self._lock:
            self.cache.clear()
            self.hits = 0
            self.misses = 0

    @property
    def size(self) -> int:
        """Get current cache size."""
        with self._lock:
            return len(self.cache)

    @property
    def hit_rate(self) -> float:
        """Get cache hit rate percentage."""
        with self._lock:
            total = self.hits + self.misses
            return (self.hits / total * 100) if total > 0 else 0.0

    @property
    def stats(self) -> Dict[str, any]:
        """Get cache statistics."""
        with self._lock:
            return {
                "size": len(self.cache),
                "max_size": self.cache.maxsize,
                "hits": self.hits,
                "misses": self.misses,
                "hit_rate": self.hit_rate,
            }

    def _compute_hash(self, source: str) -> str:
        """
        Compute SHA-256 hash of NXML source.

        Args:
            source: NXML source code

        Returns:
            Hexadecimal hash string
        """
        return hashlib.sha256(source.encode("utf-8")).hexdigest()
