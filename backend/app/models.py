import enum
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, JSON, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

# ── Enums ─────────────────────────────────────────────────────────

class UserRole(str, enum.Enum): 
    sme = "sme"
    investor = "investor"
    admin = "admin"


# ── User & Authentication ──────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.sme)
    full_name = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)

    # Account state
    email_verified = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    last_login = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


# ───────Invoice Processing Pipeline ──────────────────────────────

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

    # Marketplace Selling Strategy
    sector = Column(String, nullable=True)
    financing_type = Column(String, default="fixed") # "fixed", "auction", "fractional"
    ask_price = Column(Float, nullable=True)
    share_price = Column(Float, nullable=True)
    min_bid_increment = Column(Float, nullable=True)

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


# ────RISK AND ANALYTICS──────────────────────────────
class CreditHistory(Base):
    __tablename__ = "credit_history"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, unique=True, index=True)
    payment_history_score = Column(Integer)  # Normalized 0-100 (from CSV credit_score)
    client_reputation_score = Column(Integer)  # Normalized 0-100
    seller_track_record = Column(Integer)  # Normalized 0-100

    # Multi-entity indicators (Three-Entity system: SME, core enterprise, relationship)
    employment_years = Column(Float, nullable=True)  # Years employed from underwriting dataset
    debt_to_income = Column(Float, nullable=True)  # Debt-to-income ratio from underwriting dataset
    core_enterprise_rating = Column(Integer, nullable=True)  # Credit of the buyer (0-100)
    transaction_stability = Column(Float, nullable=True)  # Years or normalized stability metric
    logistics_consistency = Column(Float, nullable=True)  # Delivery success rate (0-1 or 0-100)
    esg_score = Column(Float, nullable=True)  # ESG rating (riskier when < ~4.73 or mapped to 0-100)

    # Interpretable ML outputs
    risk_contributors = Column(JSON, nullable=True)  # Stores SHAP-style attributions per feature

    composite_score = Column(Integer, default=0)  # Final Risk Score (0-100)
    last_updated = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

class FraudFlag(Base):
    __tablename__ = "fraud_flags"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, index=True)
    seller_id = Column(Integer, index=True) # Added to link flags to sellers easily
    reason = Column(Text)
    severity = Column(String) # "HIGH", "MEDIUM", "LOW"
    is_resolved = Column(Boolean, default=False)
    resolved_by = Column(Integer, nullable=True)        # admin user_id
    created_at = Column(DateTime(timezone=True), server_default=func.now())
