import enum
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, JSON, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

# ── Enums ─────────────────────────────────────────────────────────

class UserRole(str, enum.Enum): 
    ADMIN = "admin"
    INVESTOR = "investor"
    SELLER = "seller"
    SME = "sme"  # Legacy value kept for backward compatibility.


# ── User & Authentication ──────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(
        Enum(
            UserRole,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
            name="userrole",
        ),
        nullable=False,
        default=UserRole.SELLER,
    )
    full_name = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)

    # Account state
    email_verified = Column(Boolean, nullable=False, default=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)  # When email was verified
    is_active = Column(Boolean, nullable=False, default=True)
    last_login = Column(DateTime(timezone=True), nullable=True)
    last_refresh_token_issued_at = Column(DateTime(timezone=True), nullable=True)

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

    # Fractional Minting Support
    supply = Column(Integer, default=1)  # 1 for whole invoice, N for N fractional shares
    token_id = Column(String, nullable=True, index=True)  # ERC1155 token ID from smart contract

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
    risk_input_signature = Column(String, nullable=True)  # Hash of features used for latest score

    composite_score = Column(Integer, default=0)  # Final Risk Score (0-100)
    last_updated = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

class FraudFlag(Base):
    __tablename__ = "fraud_flags"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, index=True)
    seller_id = Column(Integer, index=True) # Added to link flags to sellers easily
    reason = Column(Text)
    severity = Column(String) # "HIGH", "MEDIUM", "LOW"
    anomaly_metadata = Column(JSON, nullable=True)
    is_resolved = Column(Boolean, default=False)
    resolution_action = Column(String, nullable=True)  # clear | confirm_fraud
    resolved_by = Column(Integer, nullable=True)        # admin user_id
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# ────TOKEN MANAGEMENT──────────────────────────────
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    token_hash = Column(String, nullable=False)  # Hashed version of actual token
    fingerprint = Column(String, nullable=True)  # Browser/device fingerprint for extra security
    is_revoked = Column(Boolean, default=False, index=True)
    issued_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


# ────EMAIL VERIFICATION──────────────────────────────
class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    token_hash = Column(String, unique=True, index=True, nullable=False)  # Hashed version of token
    is_used = Column(Boolean, default=False, index=True)  # Mark as used after verification
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)  # Typically 24 hours
    used_at = Column(DateTime(timezone=True), nullable=True)  # When token was used for verification
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


# ────KYC──────────────────────────────────────────────────────────
class KycDocType(str, enum.Enum):
    pan = "pan"


class KycStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class KycSubmission(Base):
    __tablename__ = "kyc_submissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)

    doc_type = Column(Enum(KycDocType), nullable=False, default=KycDocType.pan)
    status = Column(Enum(KycStatus), nullable=False, default=KycStatus.pending, index=True)

    s3_bucket = Column(String, nullable=False)
    s3_key = Column(String, nullable=False, unique=True, index=True)
    content_type = Column(String, nullable=True)
    original_filename = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=False, default=0)

    submitted_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    rejection_reason = Column(Text, nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by])


# ────PLATFORM STATISTICS & AGGREGATION──────────────────────────────
class PlatformStats(Base):
    """
    Materialized view / aggregated statistics table for platform-level analytics.
    Updated by trigger events when invoice status changes or periodically via batch jobs.
    """
    __tablename__ = "platform_stats"

    id = Column(Integer, primary_key=True, index=True)
    
    # Time-series aggregation
    period = Column(String, nullable=False, index=True)  # e.g., "2025-03", "2025-Q1", "2025-Y"
    period_type = Column(String, nullable=False, default="monthly")  # "monthly", "quarterly", "yearly"
    
    # Core GMV metrics
    total_funded_volume = Column(Float, default=0.0)  # Sum of ask_price for funded invoices
    total_invoices_created = Column(Integer, default=0)  # Total invoice count for period
    total_invoices_funded = Column(Integer, default=0)  # Count of funded invoices
    
    # Repayment metrics
    total_invoices_repaid = Column(Integer, default=0)  # Successfully repaid
    total_invoices_defaulted = Column(Integer, default=0)  # Marked as defaulted
    repayment_rate = Column(Float, default=0.0)  # Percentage: repaid / funded
    default_rate = Column(Float, default=0.0)  # Percentage: defaulted / funded
    
    # Revenue & yield
    platform_revenue = Column(Float, default=0.0)  # Total fees collected
    average_invoice_yield = Column(Float, default=0.0)  # Avg return on funded invoices
    
    # Risk exposure
    average_composite_score = Column(Float, default=0.0)  # Avg seller risk score
    high_risk_invoices = Column(Integer, default=0)  # Count where score >= 70
    medium_risk_invoices = Column(Integer, default=0)  # Count where 40 <= score < 70
    low_risk_invoices = Column(Integer, default=0)  # Count where score < 40
    
    # Sector concentration (stored as JSON map)
    sector_exposure = Column(JSON, nullable=True)  # e.g., {"manufacturing": 45.2, "retail": 30.1}
    top_sector = Column(String, nullable=True)  # Sector with highest volume
    concentration_ratio = Column(Float, default=0.0)  # % volume from top 3 sectors
    
    # User/seller metrics
    total_active_sellers = Column(Integer, default=0)
    total_active_investors = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())


class RepaymentSnapshot(Base):
    """
    Point-in-time investor repayment and behavior metrics for an invoice.
    Used by portfolio analytics for P&L, XIRR, delay-adjusted cash flows,
    and concentration analysis.
    """

    __tablename__ = "repayment_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), index=True, nullable=False)
    investor_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    seller_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)

    funded_amount = Column(Float, nullable=False, default=0.0)
    repayment_amount = Column(Float, nullable=True)

    funded_at = Column(DateTime(timezone=True), nullable=True)
    repaid_at = Column(DateTime(timezone=True), nullable=True)

    # Dynamic seller signal, expected range 0-100.
    impact_score = Column(Float, nullable=True)
    weighted_average_days_late = Column(Float, nullable=True)

    # Snapshot dimensions for concentration analytics.
    industry_sector = Column(String, nullable=True)
    geography = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class CreditEvent(Base):
    """Settlement event log used for repayment behavior analytics."""

    __tablename__ = "credit_events"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), index=True, nullable=False)
    seller_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    investor_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)

    event_type = Column(String, nullable=False, index=True)  # ON_TIME_PAYMENT, LATE_30, LATE_60, LATE_90
    days_late = Column(Integer, nullable=False, default=0)
    amount = Column(Float, nullable=False, default=0.0)
    notes = Column(Text, nullable=True)
    recorded_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
