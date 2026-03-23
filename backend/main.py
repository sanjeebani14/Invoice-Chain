from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from app.database import engine
from app import models
import os
import logging

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
from app.services.blockchain_sync import start_blockchain_sync_worker, stop_blockchain_sync_worker
from app.auth.tokens import decode_token
from app.database import SessionLocal
from app.models import User

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def _ensure_invoice_schema_compatibility() -> None:
    """Add new invoice marketplace and blockchain columns for existing DBs without migrations."""
    inspector = inspect(engine)
    if "invoices" not in inspector.get_table_names():
        return

    existing = {c["name"] for c in inspector.get_columns("invoices")}
    statements: list[str] = []

    if "sector" not in existing:
        statements.append("ALTER TABLE invoices ADD COLUMN sector VARCHAR")
    if "financing_type" not in existing:
        statements.append("ALTER TABLE invoices ADD COLUMN financing_type VARCHAR DEFAULT 'fixed'")
    if "ask_price" not in existing:
        statements.append("ALTER TABLE invoices ADD COLUMN ask_price DOUBLE PRECISION")
    if "share_price" not in existing:
        statements.append("ALTER TABLE invoices ADD COLUMN share_price DOUBLE PRECISION")
    if "min_bid_increment" not in existing:
        statements.append("ALTER TABLE invoices ADD COLUMN min_bid_increment DOUBLE PRECISION")
    if "supply" not in existing:
        statements.append("ALTER TABLE invoices ADD COLUMN supply INTEGER DEFAULT 1")
    if "token_id" not in existing:
        statements.append("ALTER TABLE invoices ADD COLUMN token_id VARCHAR")
    if "escrow_status" not in existing:
        statements.append("ALTER TABLE invoices ADD COLUMN escrow_status VARCHAR NOT NULL DEFAULT 'not_applicable'")
    if "escrow_reference" not in existing:
        statements.append("ALTER TABLE invoices ADD COLUMN escrow_reference VARCHAR")
    if "escrow_held_at" not in existing:
        statements.append("ALTER TABLE invoices ADD COLUMN escrow_held_at TIMESTAMPTZ")
    if "escrow_released_at" not in existing:
        statements.append("ALTER TABLE invoices ADD COLUMN escrow_released_at TIMESTAMPTZ")

    if not statements:
        return

    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def _ensure_user_schema_compatibility() -> None:
    """Add missing user columns and enum values for existing DBs without migrations."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    existing = {c["name"] for c in inspector.get_columns("users")}
    statements: list[str] = []

    if "email_verified" not in existing:
        statements.append("ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE")
    if "verified_at" not in existing:
        statements.append("ALTER TABLE users ADD COLUMN verified_at TIMESTAMPTZ")
    if "is_active" not in existing:
        statements.append("ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE")
    if "last_login" not in existing:
        statements.append("ALTER TABLE users ADD COLUMN last_login TIMESTAMPTZ")
    if "last_refresh_token_issued_at" not in existing:
        statements.append("ALTER TABLE users ADD COLUMN last_refresh_token_issued_at TIMESTAMPTZ")
    if "wallet_address" not in existing:
        statements.append("ALTER TABLE users ADD COLUMN wallet_address VARCHAR")
    if "two_factor_enabled" not in existing:
        statements.append("ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE")
    if "two_factor_secret" not in existing:
        statements.append("ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR")

    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))

        if engine.dialect.name == "postgresql":
            # PostgreSQL enum created by SQLAlchemy is typically named 'userrole'.
            conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'userrole') THEN
                            BEGIN
                                ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'seller';
                            EXCEPTION WHEN duplicate_object THEN
                                NULL;
                            END;
                        END IF;
                    END $$;
                    """
                )
            )


def _ensure_repayment_snapshot_schema_compatibility() -> None:
    """Add missing repayment_snapshots columns for existing DBs without migrations."""
    inspector = inspect(engine)
    if "repayment_snapshots" not in inspector.get_table_names():
        return

    existing = {c["name"] for c in inspector.get_columns("repayment_snapshots")}
    statements: list[str] = []

    if "invoice_id" not in existing:
        statements.append("ALTER TABLE repayment_snapshots ADD COLUMN invoice_id INTEGER")
    if "investor_id" not in existing:
        statements.append("ALTER TABLE repayment_snapshots ADD COLUMN investor_id INTEGER")
    if "seller_id" not in existing:
        statements.append("ALTER TABLE repayment_snapshots ADD COLUMN seller_id INTEGER")
    if "funded_amount" not in existing:
        statements.append("ALTER TABLE repayment_snapshots ADD COLUMN funded_amount DOUBLE PRECISION DEFAULT 0")
    if "repayment_amount" not in existing:
        statements.append("ALTER TABLE repayment_snapshots ADD COLUMN repayment_amount DOUBLE PRECISION")
    if "funded_at" not in existing:
        statements.append("ALTER TABLE repayment_snapshots ADD COLUMN funded_at TIMESTAMPTZ")
    if "repaid_at" not in existing:
        statements.append("ALTER TABLE repayment_snapshots ADD COLUMN repaid_at TIMESTAMPTZ")
    if "impact_score" not in existing:
        statements.append("ALTER TABLE repayment_snapshots ADD COLUMN impact_score DOUBLE PRECISION")
    if "weighted_average_days_late" not in existing:
        statements.append("ALTER TABLE repayment_snapshots ADD COLUMN weighted_average_days_late DOUBLE PRECISION")
    if "industry_sector" not in existing:
        statements.append("ALTER TABLE repayment_snapshots ADD COLUMN industry_sector VARCHAR")
    if "geography" not in existing:
        statements.append("ALTER TABLE repayment_snapshots ADD COLUMN geography VARCHAR")
    if "created_at" not in existing:
        statements.append("ALTER TABLE repayment_snapshots ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()")
    if "updated_at" not in existing:
        statements.append("ALTER TABLE repayment_snapshots ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()")

    if not statements:
        return

    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def _ensure_marketplace_tables_compatibility() -> None:
    """Create missing marketplace ledger tables for existing DBs without migrations."""
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    required = {
        "marketplace_listings",
        "marketplace_auctions",
        "marketplace_transactions",
        "settlement_records",
    }

    if required.issubset(table_names):
        return

    # Uses SQLAlchemy metadata to create only missing tables.
    models.Base.metadata.create_all(bind=engine)



# ── Environment & Security Configuration ──────────────────────────
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
SECURE_COOKIES = ENVIRONMENT == "production"  # True if prod/HTTPS, False if localhost

# Email Configuration
EMAIL_SERVICE = os.getenv("EMAIL_SERVICE", "gmail")  # gmail, sendgrid, ses
EMAIL_FROM = os.getenv("EMAIL_FROM", "noreply@invoicechain.com")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
EMAIL_VERIFICATION_EXPIRY_HOURS = int(os.getenv("EMAIL_VERIFICATION_EXPIRY_HOURS", "24"))


def _build_allowed_origins() -> list[str]:
    # Keep local dev flexible: Next.js may auto-shift ports when 3000 is occupied.
    defaults = {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
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

logger.debug(f"Environment: {ENVIRONMENT}")
logger.debug(f"Email Service: {EMAIL_SERVICE}")
logger.debug(f"Frontend URL: {FRONTEND_URL}")
logger.debug(f"Email Verification Expiry: {EMAIL_VERIFICATION_EXPIRY_HOURS} hours")


# Create all tables on startup
try:
    models.Base.metadata.create_all(bind=engine)
    _ensure_invoice_schema_compatibility()
    _ensure_user_schema_compatibility()
    _ensure_repayment_snapshot_schema_compatibility()
    _ensure_marketplace_tables_compatibility()
except SQLAlchemyError as exc:
    logger.warning("Skipping DB bootstrap during startup: %s", exc)

app = FastAPI(
    title="InvoiceChain API",
    description="Blockchain-Based Invoice Factoring Platform",
    version="1.0.0",
)

if os.path.isdir("uploads"):
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Allow frontend (Next.js on port 3000) to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=_build_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def sanitize_request_middleware(request: Request, call_next):
    query_text = request.url.query
    if "\x00" in query_text:
        return JSONResponse(status_code=400, content={"detail": "Invalid query input"})

    for key, value in request.query_params.multi_items():
        if len(key) > 200 or len(value) > 4000:
            return JSONResponse(status_code=400, content={"detail": "Query parameter too long"})
        if any(ord(ch) < 32 and ch not in "\t\n\r" for ch in value):
            return JSONResponse(status_code=400, content={"detail": "Invalid control characters in query"})

    return await call_next(request)

# ── Base Route ──────────────────────────────────────────────────
@app.get("/")
def read_root():
    return {
        "message": "InvoiceChain API is Live",
        "infrastructure": "Healthy",
        "docs": "/docs"
    }

# ── Include Routers ─────────────────────────────────────────────
# Risk & Fraud logic
app.include_router(risk_router, prefix="/api/v1/risk", tags=["Risk & Fraud"])

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