"""
Instance Pool - Pool of pre-warmed sandbox instances.
"""

import asyncio
from typing import Dict, Optional
from dataclasses import dataclass
from datetime import datetime
from .executor import SandboxExecutor


@dataclass
class PooledInstance:
    """A pooled sandbox instance."""

    instance_id: str
    executor: SandboxExecutor
    created_at: datetime
    last_used: datetime
    use_count: int


class InstancePool:
    """
    Pool of pre-warmed sandbox instances for fast execution.

    Maintains a pool of ready-to-use executor instances to reduce
    initialization overhead.
    """

    def __init__(self, size: int = 10):
        self.size = size
        self.instances: Dict[str, PooledInstance] = {}
        self.available: asyncio.Queue = asyncio.Queue()
        self.lock = asyncio.Lock()
        self._initialized = False

    async def initialize(self):
        """Pre-warm the instance pool."""
        if self._initialized:
            return

        async with self.lock:
            if self._initialized:
                return

            for i in range(self.size):
                instance = PooledInstance(
                    instance_id=f"instance_{i}",
                    executor=SandboxExecutor(),
                    created_at=datetime.utcnow(),
                    last_used=datetime.utcnow(),
                    use_count=0,
                )
                self.instances[instance.instance_id] = instance
                await self.available.put(instance.instance_id)

            self._initialized = True

    async def acquire(self) -> PooledInstance:
        """
        Acquire an instance from the pool.

        Returns:
            Pooled instance ready for use
        """
        if not self._initialized:
            await self.initialize()

        instance_id = await self.available.get()
        instance = self.instances[instance_id]

        instance.last_used = datetime.utcnow()
        instance.use_count += 1

        return instance

    async def release(self, instance_id: str):
        """
        Return an instance to the pool.

        Args:
            instance_id: Instance ID to release
        """
        await self.available.put(instance_id)

    async def shutdown(self):
        """Shutdown the pool."""
        self.instances.clear()
        self._initialized = False

    @property
    def stats(self) -> Dict[str, any]:
        """Get pool statistics."""
        if not self.instances:
            return {
                "size": 0,
                "available": 0,
                "in_use": 0,
            }

        total_uses = sum(inst.use_count for inst in self.instances.values())

        return {
            "size": len(self.instances),
            "available": self.available.qsize(),
            "in_use": len(self.instances) - self.available.qsize(),
            "total_uses": total_uses,
        }
