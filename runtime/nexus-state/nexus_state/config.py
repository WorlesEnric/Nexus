"""
Configuration management for nexus-state service
"""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings"""

    # Service
    SERVICE_NAME: str = "nexus-state"
    SERVICE_PORT: int = 8001

    # Database components
    DATABASE_HOST: str = os.getenv("DATABASE_HOST", "localhost")
    DATABASE_PORT: int = int(os.getenv("DATABASE_PORT", "5432"))
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "nexus")
    DATABASE_USER: str = os.getenv("DATABASE_USER", "nexus")
    DATABASE_PASSWORD: str = os.getenv("DATABASE_PASSWORD", "nexus")

    # Constructed DATABASE_URL
    @property
    def DATABASE_URL(self) -> str:
        """Construct DATABASE_URL from components"""
        return f"postgresql+asyncpg://{self.DATABASE_USER}:{self.DATABASE_PASSWORD}@{self.DATABASE_HOST}:{self.DATABASE_PORT}/{self.DATABASE_NAME}"

    # Redis
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_DB: int = int(os.getenv("REDIS_DB", "0"))
    REDIS_PASSWORD: str | None = os.getenv("REDIS_PASSWORD")

    # Cache
    CACHE_TTL_SECONDS: int = int(os.getenv("CACHE_TTL_SECONDS", "1800"))  # 30 minutes

    # Git
    GIT_WORKSPACE_ROOT: str = os.getenv("GIT_WORKSPACE_ROOT", "/app/state-snapshots")
    GIT_AUTO_SNAPSHOT_INTERVAL: int = int(os.getenv("GIT_AUTO_SNAPSHOT_INTERVAL", "300"))  # 5 minutes

    # Auth
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "supersecretkey")
    JWT_ALGORITHM: str = "HS256"

    # Performance
    MAX_STATE_SIZE_BYTES: int = int(os.getenv("MAX_STATE_SIZE_BYTES", str(1024 * 1024)))  # 1MB

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
