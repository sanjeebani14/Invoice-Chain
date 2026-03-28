import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Lifecycle & Maintenance
from app.database_init import run_database_maintenance
from app.services.blockchain_sync import (
    start_blockchain_sync_worker,
    stop_blockchain_sync_worker,
)

# Grouped Routers
from app.api.router import api_router
from app.routers.notifications import router as notifications_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Environment Configuration ─────────────────────────────────────

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")


def _build_allowed_origins() -> list[str]:
    defaults = {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
    }
    if FRONTEND_URL:
        defaults.add(FRONTEND_URL.rstrip("/"))
    extra = os.getenv("CORS_EXTRA_ORIGINS", "").strip()
    if extra:
        for origin in extra.split(","):
            clean = origin.strip().rstrip("/")
            if clean:
                defaults.add(clean)
    return sorted(defaults)


# ── Lifespan (Startup & Shutdown) ────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup Logic: Fix DB and Start Workers
    try:
        run_database_maintenance()
        start_blockchain_sync_worker()
        logger.info("Infrastructure Healthy & Sync Worker Started")
    except Exception as e:
        logger.error(f"Startup Critical Failure: {e}")

    yield  # App is running

    # Shutdown Logic
    stop_blockchain_sync_worker()
    logger.info("Sync Worker Stopped")


# ── App Initialization ──────────────────────────────────────────
app = FastAPI(title="InvoiceChain API", version="1.0.0", lifespan=lifespan)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=_build_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def sanitize_request_middleware(request: Request, call_next):
    # Security: Basic Query Sanitization
    if "\x00" in request.url.query:
        return JSONResponse(status_code=400, content={"detail": "Invalid query input"})
    return await call_next(request)


# Static Files
if os.path.isdir("uploads"):
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


# ── Routes ──────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
def read_root():
    return {"message": "InvoiceChain API is Live", "infrastructure": "Healthy"}


# Grouped router
app.include_router(api_router, prefix="/api/v1")

# Include the WebSocket notifications
app.include_router(notifications_router)
