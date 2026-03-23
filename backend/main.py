import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

<<<<<<< HEAD
# Import Routers
from app.api.risk import router as risk_router
from app.api.analytics import router as analytics_router
from app.api.sme_dashboard import router as sme_dashboard_router
from app.routers.invoice import router as invoice_router
from app.routers.auth import router as auth_router
from app.routers.kyc import router as kyc_router, admin_router as admin_kyc_router
from app.routers.profile import router as profile_router
from app.routers.admin_users import router as admin_users_router
from app.routers.admin_stats import router as admin_stats_router
from app.services.realtime import notification_hub
=======
# Lifecycle & Maintenance
from app.database_init import run_database_maintenance
>>>>>>> 20a2d1db8dba8ae5b2af8c59e98ae365ac6c5488
from app.services.blockchain_sync import start_blockchain_sync_worker, stop_blockchain_sync_worker

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
    defaults = {"http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001"}
    if FRONTEND_URL:
        defaults.add(FRONTEND_URL.rstrip("/"))
    extra = os.getenv("CORS_EXTRA_ORIGINS", "").strip()
    if extra:
        for origin in extra.split(","):
            clean = origin.strip().rstrip("/")
            if clean: defaults.add(clean)
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
    
    yield # App is running
    
    # Shutdown Logic
    stop_blockchain_sync_worker()
    logger.info("Sync Worker Stopped")

# ── App Initialization ──────────────────────────────────────────
app = FastAPI(
    title="InvoiceChain API",
    version="1.0.0",
    lifespan=lifespan
)

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

<<<<<<< HEAD
# Investor and platform analytics
app.include_router(analytics_router)

# SME dashboard summary and activity
app.include_router(sme_dashboard_router)

# Invoice logic
app.include_router(invoice_router, prefix="/api/v1/invoice", tags=["Invoice Processing"])

# Auth
app.include_router(auth_router, prefix="/auth", tags=["Authentication"])

# KYC
app.include_router(kyc_router)
app.include_router(admin_kyc_router)

# Profile
app.include_router(profile_router)

# Admin user management
app.include_router(admin_users_router)

# Admin statistics and analytics
app.include_router(admin_stats_router)


@app.websocket("/ws/notifications")
async def notifications_ws(websocket: WebSocket):
    access_token = websocket.cookies.get("access_token")
    if not access_token:
        await websocket.close(code=1008)
        return

    try:
        payload = decode_token(access_token)
        if payload.get("type") != "access":
            await websocket.close(code=1008)
            return
        user_id = int(payload.get("user_id"))
    except Exception:
        await websocket.close(code=1008)
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    finally:
        db.close()

    if not user:
        await websocket.close(code=1008)
        return

    await notification_hub.connect(websocket, user_id=user.id, role=str(user.role.value))
    try:
        while True:
            payload = await websocket.receive_json()
            action = str(payload.get("action") or "").lower()
            invoice_id_raw = payload.get("invoice_id")

            if action == "ping":
                await websocket.send_json({"event": "pong", "payload": {}})
                continue

            if action in {"subscribe", "unsubscribe"}:
                try:
                    invoice_id = int(invoice_id_raw)
                except (TypeError, ValueError):
                    await websocket.send_json(
                        {
                            "event": "error",
                            "payload": {"message": "invoice_id must be a valid integer"},
                        }
                    )
                    continue

                if action == "subscribe":
                    notification_hub.subscribe_invoice(websocket, invoice_id)
                    await websocket.send_json(
                        {
                            "event": "subscribed",
                            "payload": {"invoice_id": invoice_id},
                        }
                    )
                else:
                    notification_hub.unsubscribe_invoice(websocket, invoice_id)
                    await websocket.send_json(
                        {
                            "event": "unsubscribed",
                            "payload": {"invoice_id": invoice_id},
                        }
                    )
                continue

            await websocket.send_json(
                {
                    "event": "error",
                    "payload": {"message": "Unknown websocket action"},
                }
            )
    except WebSocketDisconnect:
        notification_hub.disconnect(websocket)
    except Exception:
        notification_hub.disconnect(websocket)


@app.on_event("startup")
def startup_sync_worker() -> None:
    start_blockchain_sync_worker()


@app.on_event("shutdown")
def shutdown_sync_worker() -> None:
    stop_blockchain_sync_worker()
=======
# Include the WebSocket notifications
app.include_router(notifications_router)
>>>>>>> 20a2d1db8dba8ae5b2af8c59e98ae365ac6c5488
