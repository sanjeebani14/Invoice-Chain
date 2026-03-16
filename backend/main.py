from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from app.database import engine
from app import models

# Import Routers
from app.api.risk import router as risk_router
from app.routers.invoice import router as invoice_router
from app.routers.auth import router as auth_router


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