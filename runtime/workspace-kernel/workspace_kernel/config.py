"""
Configuration for Workspace Kernel.
"""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings."""

    # App
    app_name: str = "Nexus Workspace Kernel"
    app_version: str = "1.0.0"
    debug: bool = False

    # Server
    host: str = "0.0.0.0"
    port: int = 3000

    # CORS
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Database
    database_url: str = "postgresql+asyncpg://nexus:nexus@localhost:5432/nexus"

    # JWT
    jwt_secret_key: str = "your-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24  # 24 hours

    # Git
    git_workspace_dir: str = "./workspaces"

    # Sandbox
    sandbox_pool_size: int = 10

    # TriLog
    trilog_enabled: bool = True
    otel_endpoint: str = "http://localhost:4318"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
