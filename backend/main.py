from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from app.database import engine
from app import models
import os
import logging

# Import Routers
from app.api.risk import router as risk_router
from app.routers.invoice import router as invoice_router
from app.routers.auth import router as auth_router
from app.routers.kyc import router as kyc_router, admin_router as admin_kyc_router
from app.routers.profile import router as profile_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def _ensure_invoice_schema_compatibility() -> None:
    """Add new invoice marketplace columns for existing DBs without migrations."""
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

    if not statements:
        return

    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))



# ── Environment & Security Configuration ──────────────────────────
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
SECURE_COOKIES = ENVIRONMENT == "production"  # True if prod/HTTPS, False if localhost

# Email Configuration
EMAIL_SERVICE = os.getenv("EMAIL_SERVICE", "gmail")  # gmail, sendgrid, ses
EMAIL_FROM = os.getenv("EMAIL_FROM", "noreply@invoicechain.com")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
EMAIL_VERIFICATION_EXPIRY_HOURS = int(os.getenv("EMAIL_VERIFICATION_EXPIRY_HOURS", "24"))

logger.debug(f"Environment: {ENVIRONMENT}")
logger.debug(f"Email Service: {EMAIL_SERVICE}")
logger.debug(f"Frontend URL: {FRONTEND_URL}")
logger.debug(f"Email Verification Expiry: {EMAIL_VERIFICATION_EXPIRY_HOURS} hours")


# Create all tables on startup
models.Base.metadata.create_all(bind=engine)
_ensure_invoice_schema_compatibility()

app = FastAPI(
    title="InvoiceChain API",
    description="Blockchain-Based Invoice Factoring Platform",
    version="1.0.0",
)

# Allow frontend (Next.js on port 3000) to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# Invoice logic
app.include_router(invoice_router, prefix="/api/v1/invoice", tags=["Invoice Processing"])

# Auth
app.include_router(auth_router, prefix="/auth", tags=["Authentication"])

# KYC
app.include_router(kyc_router)
app.include_router(admin_kyc_router)

# Profile
app.include_router(profile_router)