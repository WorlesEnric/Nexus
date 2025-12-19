"""
Nexus State Management Service - FastAPI Application
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import time

from .config import settings
from .database import init_db, close_db
from .api import state, snapshot
from .services.redis_service import redis_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle management"""
    # Startup
    print(f"[{settings.SERVICE_NAME}] Starting service...")
    await init_db()
    print(f"[{settings.SERVICE_NAME}] Database initialized")

    # Check Redis connection
    if await redis_service.health_check():
        print(f"[{settings.SERVICE_NAME}] Redis connected")
    else:
        print(f"[{settings.SERVICE_NAME}] WARNING: Redis connection failed")

    yield

    # Shutdown
    print(f"[{settings.SERVICE_NAME}] Shutting down...")
    await close_db()


app = FastAPI(
    title="Nexus State Management Service",
    description="High-performance panel state management with Redis caching and Git history",
    version="0.1.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time
    print(f"[{settings.SERVICE_NAME}] {request.method} {request.url.path} - {response.status_code} ({duration:.3f}s)")
    return response

# Include routers
app.include_router(state.router, prefix="/api/state", tags=["state"])
app.include_router(snapshot.router, prefix="/api/snapshots", tags=["snapshots"])

@app.get("/")
async def root():
    return {
        "service": settings.SERVICE_NAME,
        "version": "0.1.0",
        "status": "running"
    }

@app.get("/health")
async def health():
    """Health check endpoint"""
    redis_ok = await redis_service.health_check()
    return {
        "status": "healthy" if redis_ok else "degraded",
        "redis": "connected" if redis_ok else "disconnected",
        "service": settings.SERVICE_NAME
    }
