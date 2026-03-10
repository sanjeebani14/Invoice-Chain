from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, JSON
from sqlalchemy.sql import func
from .database import Base

# ── Sanjeebani's existing models ─────────────────────────────────

class CreditHistory(Base):
    __tablename__ = "credit_history"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, index=True)
    payment_history_score = Column(Integer)
    client_reputation_score = Column(Integer)
    seller_track_record = Column(Integer)
    composite_score = Column(Integer, default=0)  # Risk Score (0-100)
    last_updated = Column(DateTime(timezone=True), onupdate=func.now())


# ── Kavya: Invoice Processing Pipeline ───────────────────────────

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)

    # File info
    original_filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)          # local path / S3 / IPFS URL

    # Extracted fields (from OCR)
    invoice_number = Column(String, index=True)
    seller_name = Column(String)
    client_name = Column(String)
    amount = Column(Float)
    currency = Column(String, default="INR")
    issue_date = Column(String)                         # stored as string for flexibility
    due_date = Column(String)

    # OCR confidence scores (0.0 - 1.0 per field)
    ocr_confidence = Column(JSON)                       # e.g. {"amount": 0.95, "due_date": 0.71}

    # Fraud / duplicate detection
    canonical_hash = Column(String, unique=True, index=True)   # keccak256 hash
    is_duplicate = Column(Boolean, default=False)

    # Lifecycle status
    # pending_review → approved → minted → listed → sold
    status = Column(String, default="pending_review", index=True)

    # Seller (links to Users table when Gaurisha builds auth)
    seller_id = Column(Integer, index=True, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class FraudFlag(Base):
    __tablename__ = "fraud_flags"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, index=True)            # FK to invoices.id
    reason = Column(Text)                               # e.g. "Exact duplicate hash detected"
    severity = Column(String)                           # "HIGH", "MEDIUM", "LOW"
    is_resolved = Column(Boolean, default=False)
    resolved_by = Column(Integer, nullable=True)        # admin user_id
    created_at = Column(DateTime(timezone=True), server_default=func.now())
