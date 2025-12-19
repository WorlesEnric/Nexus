from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
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

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Nexus Backend")

# Get CORS origins from environment variable
import json
cors_origins_str = os.getenv("CORS_ORIGINS", '["http://localhost:5173", "http://localhost:8080"]')
try:
    cors_origins = json.loads(cors_origins_str)
except json.JSONDecodeError:
    cors_origins = ["http://localhost:5173", "http://localhost:8080"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
