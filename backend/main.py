from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app import models

# Create all tables on startup (existing + new invoice tables)
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

# ── Sanjeebani's existing routes ──────────────────────────────────
@app.get("/")
def read_root():
    return {"message": "InvoiceChain API is Live", "tables": "Created Successfully"}

@app.get("/risk/score/{seller_id}")
def get_score(seller_id: int):
    return {"seller_id": seller_id, "score": 75, "status": "Healthy"}

# ── Kavya's invoice processing routes ────────────────────────────
from app.routers.invoice import router as invoice_router
app.include_router(invoice_router)
