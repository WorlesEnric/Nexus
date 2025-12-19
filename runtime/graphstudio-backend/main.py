from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from contextlib import asynccontextmanager
import os
import time

load_dotenv()
from database import engine, Base
from routers import auth, subscription, marketplace

# Initialize TriLog
from trilog_setup import initialize_trilog, get_logger
registry = initialize_trilog()

# Create logger for API requests
logger = get_logger("graphstudio.api")

# Import schema for anchoring - using centralized schemas
import sys
from pathlib import Path
nexus_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(nexus_root))
from trilog_schemas import APIRequest
from trilog.context import anchor

# Initialize database with retry logic
def init_db():
    """Initialize database with retry logic for Kubernetes deployments"""
    from sqlalchemy import text
    max_retries = 5
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            # Test database connection
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            # Create tables if connection succeeds
            Base.metadata.create_all(bind=engine)
            print(f"[Database] Successfully connected and initialized database")
            return True
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"[Database] Connection attempt {attempt + 1} failed: {e}. Retrying in {retry_delay}s...")
                time.sleep(retry_delay)
            else:
                print(f"[Database] Failed to connect after {max_retries} attempts: {e}")
                print(f"[Database] Continuing anyway - tables will be created on first request")
                return False
    
    return False

# Lifespan context manager for startup/shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle management for FastAPI app."""
    # Startup
    print("[Startup] Initializing database...")
    init_db()

    print("[Startup] Running marketplace seeding...")
    try:
        from seed_marketplace import seed_marketplace
        seed_marketplace()
    except Exception as e:
        print(f"[Startup] Seeding failed (non-fatal): {e}")

    yield

    # Shutdown
    print("[Shutdown] Cleaning up...")

app = FastAPI(title="Nexus Backend", lifespan=lifespan)

# Get CORS origins from environment variable
import json
cors_origins_str = os.getenv("CORS_ORIGINS", '["http://localhost:5173", "http://localhost:8080"]')
print(f"[CORS] Raw CORS_ORIGINS env var: {repr(cors_origins_str)}")

# Strip any surrounding quotes that might come from ConfigMap
cors_origins_str = cors_origins_str.strip()
# Remove outer single or double quotes if present
if cors_origins_str.startswith("'") and cors_origins_str.endswith("'"):
    cors_origins_str = cors_origins_str[1:-1]
if cors_origins_str.startswith('"') and cors_origins_str.endswith('"'):
    cors_origins_str = cors_origins_str[1:-1]

try:
    cors_origins = json.loads(cors_origins_str)
    if not isinstance(cors_origins, list):
        print(f"[CORS] Warning: CORS_ORIGINS is not a list, using defaults")
        cors_origins = ["http://localhost:5173", "http://localhost:8080", "http://127.0.0.1:8080"]
except (json.JSONDecodeError, TypeError) as e:
    print(f"[CORS] Error parsing CORS_ORIGINS: {e}, using defaults")
    cors_origins = ["http://localhost:5173", "http://localhost:8080", "http://127.0.0.1:8080"]

# Ensure we have the necessary origins
required_origins = ["http://localhost:8080", "http://127.0.0.1:8080"]
for origin in required_origins:
    if origin not in cors_origins:
        cors_origins.append(origin)

# Log CORS origins for debugging
print(f"[CORS] Configured origins: {cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# CORS debugging middleware - logs CORS headers
@app.middleware("http")
async def cors_debug_middleware(request: Request, call_next):
    """Debug middleware to log CORS-related headers"""
    origin = request.headers.get("Origin")
    if origin:
        print(f"[CORS Debug] Request from origin: {origin}")
        print(f"[CORS Debug] Allowed origins: {cors_origins}")
        if origin in cors_origins:
            print(f"[CORS Debug] Origin {origin} is in allowed list")
        else:
            print(f"[CORS Debug] WARNING: Origin {origin} is NOT in allowed list!")
    
    response = await call_next(request)
    
    # Log response CORS headers
    cors_headers = {k: v for k, v in response.headers.items() if "access-control" in k.lower()}
    if cors_headers:
        print(f"[CORS Debug] Response CORS headers: {cors_headers}")
    else:
        print(f"[CORS Debug] WARNING: No CORS headers in response!")
    
    return response

# TriLog middleware for request tracking
@app.middleware("http")
async def trilog_middleware(request: Request, call_next):
    """Log all API requests with TriLog"""
    request_id = f"req_{int(time.time() * 1000000)}"
    start = time.time()

    # Extract user from token if present
    user_id = None
    if hasattr(request.state, "user"):
        user_id = request.state.user.id

    with anchor(request_id, APIRequest):
        logger.info("request_start",
            method=request.method,
            path=str(request.url.path),
            user_id=user_id or "anonymous"
        )

        try:
            response = await call_next(request)
            duration_ms = int((time.time() - start) * 1000)

            logger.state_change(
                status_code=response.status_code,
                duration_ms=duration_ms
            )

            return response
        except Exception as e:
            duration_ms = int((time.time() - start) * 1000)
            logger.error("request_error", error=e, duration_ms=duration_ms)
            raise

app.include_router(auth.router)
app.include_router(subscription.router)
app.include_router(marketplace.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Nexus API"}

@app.get("/health")
def health_check():
    """Health check endpoint"""
    from sqlalchemy import text
    try:
        # Test database connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "connected"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }

@app.get("/cors-test")
def cors_test(request: Request):
    """Test endpoint to verify CORS is working"""
    origin = request.headers.get("Origin", "No Origin header")
    return {
        "message": "CORS test successful",
        "request_origin": origin,
        "configured_origins": cors_origins,
        "origin_allowed": origin in cors_origins if origin != "No Origin header" else None,
        "headers": "Check response headers for Access-Control-Allow-Origin"
    }

