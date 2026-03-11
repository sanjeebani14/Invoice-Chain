from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine
from app import models

# Import Routers
from app.api.risk import router as risk_router
from app.routers.invoice import router as invoice_router

# Create all tables (CreditHistory, FraudFlag, etc.)
models.Base.metadata.create_all(bind=engine)

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
# Sanjeebani's Risk & Fraud logic
app.include_router(risk_router, prefix="/api/v1/risk", tags=["Risk & Fraud"])

# Kavya's Invoice logic
app.include_router(invoice_router, prefix="/api/v1/invoice", tags=["Invoice Processing"])