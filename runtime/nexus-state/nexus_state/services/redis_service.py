"""
Redis service for panel state caching
"""

import redis
import json
from typing import Optional, Dict, Any
from datetime import datetime

from ..config import settings


class RedisService:
    """Redis cache for panel states"""

    def __init__(self):
        self.client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=settings.REDIS_DB,
            password=settings.REDIS_PASSWORD,
            decode_responses=True,
            socket_keepalive=True,
            socket_connect_timeout=5,
            retry_on_timeout=True,
        )
        self.default_ttl = settings.CACHE_TTL_SECONDS

    def _state_key(self, workspace_id: str, panel_id: str) -> str:
        """Generate Redis key for panel state"""
        return f"state:{workspace_id}:{panel_id}"

    def _channel_name(self, workspace_id: str) -> str:
        """Generate pub/sub channel name for workspace"""
        return f"state-updates:{workspace_id}"

    async def get_state(self, workspace_id: str, panel_id: str) -> Optional[Dict[str, Any]]:
        """Get state from cache"""
        try:
            key = self._state_key(workspace_id, panel_id)
            data = self.client.get(key)
            if data:
                return json.loads(data)
            return None
        except Exception as e:
            print(f"[RedisService] Error getting state: {e}")
            return None

    async def set_state(
        self,
        workspace_id: str,
        panel_id: str,
        state: Dict[str, Any],
        ttl: Optional[int] = None
    ):
        """Set state in cache"""
        try:
            key = self._state_key(workspace_id, panel_id)
            data = json.dumps(state)
            self.client.setex(key, ttl or self.default_ttl, data)
        except Exception as e:
            print(f"[RedisService] Error setting state: {e}")

    async def invalidate_state(self, workspace_id: str, panel_id: str):
        """Remove state from cache"""
        try:
            key = self._state_key(workspace_id, panel_id)
            self.client.delete(key)
        except Exception as e:
            print(f"[RedisService] Error invalidating state: {e}")

    async def publish_update(
        self,
        workspace_id: str,
        panel_id: str,
        patch: list,
        version: int
    ):
        """Publish state update to subscribers"""
        try:
            channel = self._channel_name(workspace_id)
            message = json.dumps({
                "panel_id": panel_id,
                "patch": patch,
                "version": version,
                "timestamp": datetime.utcnow().isoformat()
            })
            self.client.publish(channel, message)
        except Exception as e:
            print(f"[RedisService] Error publishing update: {e}")

    def subscribe_workspace(self, workspace_id: str):
        """Subscribe to workspace state updates"""
        try:
            pubsub = self.client.pubsub()
            channel = self._channel_name(workspace_id)
            pubsub.subscribe(channel)
            return pubsub
        except Exception as e:
            print(f"[RedisService] Error subscribing: {e}")
            return None

    async def health_check(self) -> bool:
        """Check Redis connection health"""
        try:
            return self.client.ping()
        except Exception as e:
            print(f"[RedisService] Health check failed: {e}")
            return False


# Global Redis service instance
redis_service = RedisService()
