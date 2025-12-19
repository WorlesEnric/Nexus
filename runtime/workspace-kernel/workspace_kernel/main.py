"""
Workspace Kernel - FastAPI application entry point.

Provides REST API and WebSocket endpoints for Nexus workspace management.
"""

import logging
import sys
import time
from pathlib import Path
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import engine, Base, get_db
from .api import auth, panels, workspaces, nog
from .websocket import WebSocketManager
from .services import PanelService, NOGService, GitService
from .auth import get_current_active_user
from .models import User

# Initialize TriLog
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))
from trilog_setup import initialize_trilog, get_logger
from trilog_schemas import APIRequest, WebSocketConnection
from trilog.context import anchor

# Initialize TriLog
trilog_registry = initialize_trilog()
trilog_logger = get_logger("workspace_kernel.main")

# Configure standard logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global service instances
ws_manager = WebSocketManager()
panel_service = PanelService()
nog_service = NOGService()
git_service = GitService()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """
    Application lifespan manager.

    Handles startup and shutdown events.
    """
    # Startup
    logger.info("Starting Workspace Kernel...")

    # Create database tables
    logger.info("Creating database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    logger.info("Workspace Kernel started successfully")

    yield

    # Shutdown
    logger.info("Shutting down Workspace Kernel...")

    # Close all WebSocket connections
    await ws_manager.close_all()

    # Dispose database engine
    await engine.dispose()

    logger.info("Workspace Kernel shut down successfully")


# Create FastAPI application
app = FastAPI(
    title="Nexus Workspace Kernel",
    description="Backend service for Nexus workspace and panel management",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# TriLog middleware for request tracking
@app.middleware("http")
async def trilog_request_middleware(request: Request, call_next):
    """Log all API requests with TriLog"""
    request_id = f"req_{int(time.time() * 1000000)}"
    start = time.time()

    # Extract user from state if authenticated
    user_id = None
    if hasattr(request.state, "user") and request.state.user:
        user_id = request.state.user.id

    with anchor(request_id, APIRequest):
        trilog_logger.info("request_start",
            method=request.method,
            path=str(request.url.path),
            user_id=user_id or "anonymous",
            service="workspace-kernel"
        )

        trilog_logger.state_change(
            method=request.method,
            path=str(request.url.path),
            service_name="workspace-kernel"
        )

        try:
            response = await call_next(request)
            duration_ms = int((time.time() - start) * 1000)

            trilog_logger.state_change(
                status_code=response.status_code,
                duration_ms=duration_ms
            )

            return response
        except Exception as e:
            duration_ms = int((time.time() - start) * 1000)
            trilog_logger.error("request_error", error=str(e), duration_ms=duration_ms)
            raise


# Include API routers
app.include_router(
    auth.router,
    prefix="/api/auth",
    tags=["Authentication"],
)

app.include_router(
    panels.router,
    prefix="/api/panels",
    tags=["Panels"],
)

app.include_router(
    workspaces.router,
    prefix="/api/workspaces",
    tags=["Workspaces"],
)

app.include_router(
    nog.router,
    prefix="/api/nog",
    tags=["NOG"],
)


@app.get("/")
async def root():
    """Root endpoint - health check."""
    return {
        "service": "Nexus Workspace Kernel",
        "version": "0.1.0",
        "status": "running",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "database": "connected",
        "websocket_connections": sum(
            len(conns) for conns in ws_manager.connections.values()
        ),
    }


@app.websocket("/ws/{workspace_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    workspace_id: str,
    token: str,
):
    """
    WebSocket endpoint for real-time workspace updates.

    Args:
        websocket: WebSocket connection
        workspace_id: Workspace ID to connect to
        token: JWT authentication token (passed as query parameter)

    Protocol:
        Client → Server:
            - {"type": "ping"} → Keep-alive
            - {"type": "subscribe", "panel_id": "..."} → Subscribe to panel updates
            - {"type": "unsubscribe", "panel_id": "..."} → Unsubscribe from panel

        Server → Client:
            - {"type": "connected", "workspace_id": "...", "message": "..."}
            - {"type": "pong"} → Keep-alive response
            - {"type": "state_update", "panel_id": "...", "mutations": [...]}
            - {"type": "event", "panel_id": "...", "event_name": "...", "event_data": {...}}
            - {"type": "nog_update", "snapshot": {...}}
            - {"type": "error", "message": "..."}
    """
    # Authenticate user from token
    try:
        from jose import jwt, JWTError
        from sqlalchemy.ext.asyncio import AsyncSession
        from sqlalchemy import select

        # Decode token
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        # Get user from database
        async with AsyncSession(engine) as db:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()

            if not user or not user.is_active:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return

        # Connect to WebSocket manager
        await ws_manager.connect(websocket, workspace_id, user_id)
        logger.info(f"WebSocket connected: user={user_id}, workspace={workspace_id}")

        # Create WebSocket connection tracking with TriLog
        connection_id = f"ws_{workspace_id}_{user_id}_{int(time.time() * 1000)}"
        with anchor(connection_id, WebSocketConnection):
            trilog_logger.event("websocket_connected",
                workspace_id=workspace_id,
                user_id=user_id,
                panel_id=""
            )
            trilog_logger.state_change(
                panel_id=workspace_id,
                workspace_id=workspace_id,
                is_connected=True,
                connected_at=time.time()
            )

            try:
                # Message loop
                while True:
                    # Receive message from client
                    data = await websocket.receive_json()

                    # Log message received
                    trilog_logger.event("websocket_message",
                        message_type=data.get("type", "unknown"),
                        workspace_id=workspace_id
                    )

                    # Handle message
                    await ws_manager.handle_message(websocket, data)

            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected: user={user_id}, workspace={workspace_id}")
                trilog_logger.event("websocket_disconnected",
                    workspace_id=workspace_id,
                    user_id=user_id
                )
                trilog_logger.state_change(
                    is_connected=False,
                    disconnected_at=time.time()
                )
                await ws_manager.disconnect(websocket)

            except Exception as e:
                logger.error(f"WebSocket error: {e}", exc_info=True)
                trilog_logger.error("websocket_error",
                    error=str(e),
                    workspace_id=workspace_id
                )
                trilog_logger.state_change(
                    last_error=str(e)
                )
                await websocket.send_json({
                    "type": "error",
                    "message": str(e),
                })
                await ws_manager.disconnect(websocket)

    except JWTError:
        logger.warning("WebSocket authentication failed: Invalid token")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)

    except Exception as e:
        logger.error(f"WebSocket connection error: {e}", exc_info=True)
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "error": str(exc) if settings.debug else "An error occurred",
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "workspace_kernel.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level="info",
    )
