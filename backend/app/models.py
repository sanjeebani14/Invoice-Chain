import enum
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, JSON, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
from web3 import Web3


# Enums 

class UserRole(str, enum.Enum): 
    ADMIN = "admin"
    INVESTOR = "investor"
    SELLER = "seller"
    SME = "seller"  


# User & Authentication
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

    # State and Security
    email_verified = Column(Boolean, nullable=False, default=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)  # When email was verified
    is_active = Column(Boolean, nullable=False, default=True)
    last_login = Column(DateTime(timezone=True), nullable=True)
    last_refresh_token_issued_at = Column(DateTime(timezone=True), nullable=True)
    two_factor_enabled = Column(Boolean, nullable=False, default=False)
    two_factor_secret = Column(String, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    # Relationships
    connected_wallets = relationship("LinkedWallet", back_populates="user", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="seller", foreign_keys="Invoice.seller_id")
    credit_history = relationship("CreditHistory", back_populates="seller", foreign_keys="CreditHistory.seller_id", uselist=False)

# Wallet Models (Metamask integration)
class LinkedWallet(Base):
    __tablename__ = "linked_wallets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    
    # Wallet Data
    wallet_address = Column(String, index=True, nullable=False)
    wallet_label = Column(String, nullable=True)
    balance_wei = Column(String, nullable=True)
    balance_checked_at = Column(DateTime(timezone=True), nullable=True)

    # Network Metadata(Default:Base Sepolia)
    chain_id = Column(Integer, nullable=False, default=84532)
    network_name = Column(String, nullable=False, default="base_sepolia")

    # Status Flags
    is_primary = Column(Boolean, default=False, server_default="false", nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="connected_wallets")

    # Constraints
    __table_args__ = (UniqueConstraint('wallet_address', 'user_id', name='_wallet_user_uc'),)
    
class WalletNonce(Base):
    __tablename__ = "wallet_nonces"

    id = Column(Integer, primary_key=True, index=True)
    wallet_address = Column(String, index=True, nullable=False)
    nonce = Column(String, unique=True, index=True, nullable=False)
    
    is_used = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# Invoice Processing 

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)

    # File info
    original_filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)         

    # Extracted fields from OCR
    invoice_number = Column(String, index=True)
    seller_name = Column(String)
    client_name = Column(String)
    amount = Column(Float)
    currency = Column(String, default="INR")
    issue_date = Column(String)                        
    due_date = Column(String)

    # Marketplace Selling Strategy
    sector = Column(String, nullable=True)
    financing_type = Column(String, default="fixed") 
    ask_price = Column(Float, nullable=True)
    share_price = Column(Float, nullable=True)
    min_bid_increment = Column(Float, nullable=True)

    # Fractional Minting Support
    supply = Column(Integer, default=1)  # 1 for whole invoice, N for N fractional shares
    token_id = Column(String, nullable=True, index=True)  # ERC1155 token ID from smart contract

    # OCR confidence scores (0.0 - 1.0 per field)
    ocr_confidence = Column(JSON)                       

    # Fraud / duplicate detection
    canonical_hash = Column(String, unique=True, index=True)   # keccak256 hash
    is_duplicate = Column(Boolean, default=False)

    # Lifecycle status: pending_review → approved → minted → listed → sold
    status = Column(String, default="pending_review", index=True)

    # Escrow tracking
    escrow_status = Column(String, nullable=False, default="not_applicable", index=True)
    escrow_reference = Column(String, nullable=True)
    escrow_held_at = Column(DateTime(timezone=True), nullable=True)
    escrow_released_at = Column(DateTime(timezone=True), nullable=True)

    # Seller 
    seller_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    seller = relationship("User", foreign_keys=[seller_id], back_populates="invoices")


# Risk and Credit Models
class CreditHistory(Base):
    __tablename__ = "credit_history"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, ForeignKey("users.id"), unique=True, index=True)
    payment_history_score = Column(Integer)  
    client_reputation_score = Column(Integer)  
    seller_track_record = Column(Integer)  

    # Multi-entity indicators
    employment_years = Column(Float, nullable=True) 
    debt_to_income = Column(Float, nullable=True)  
    core_enterprise_rating = Column(Integer, nullable=True)  
    transaction_stability = Column(Float, nullable=True)  
    logistics_consistency = Column(Float, nullable=True)  
    esg_score = Column(Float, nullable=True)  

    # Outputs
    risk_contributors = Column(JSON, nullable=True)  
    risk_input_signature = Column(String, nullable=True)  

    composite_score = Column(Integer, default=0)  #Final Risk Score
    last_updated = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    seller = relationship("User", foreign_keys=[seller_id], back_populates="credit_history")

class FraudFlag(Base):
    __tablename__ = "fraud_flags"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, index=True)
    seller_id = Column(Integer, index=True) 
    reason = Column(Text)
    severity = Column(String) # "HIGH","MEDIUM","LOW"
    anomaly_metadata = Column(JSON, nullable=True)
    is_resolved = Column(Boolean, default=False)
    resolution_action = Column(String, nullable=True)  # Clear or Confirm_fraud
    resolved_by = Column(Integer, nullable=True)       
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# Token and Session Management for Authentication
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", name="fk_refresh_tokens_user_id"), index=True, nullable=False)
    token_hash = Column(String, nullable=False)  
    fingerprint = Column(String, nullable=True) 
    is_revoked = Column(Boolean, default=False, index=True)
    issued_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


# Email verification
class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    token_hash = Column(String, unique=True, index=True, nullable=False)  
    is_used = Column(Boolean, default=False, index=True)  
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)  
    used_at = Column(DateTime(timezone=True), nullable=True) 
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    token_hash = Column(String, unique=True, index=True, nullable=False)
    is_used = Column(Boolean, default=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


# KYC Models
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


# Platform Analytics and Marketplace Models
class PlatformStats(Base):

    __tablename__ = "platform_stats"

    id = Column(Integer, primary_key=True, index=True)
    
    # Time-series aggregation
    period = Column(String, nullable=False, index=True)  
    period_type = Column(String, nullable=False, default="monthly")  

    # Core metrics
    total_funded_volume = Column(Float, default=0.0) 
    total_invoices_created = Column(Integer, default=0) 
    total_invoices_funded = Column(Integer, default=0)  
    
    # Repayment metrics
    total_invoices_repaid = Column(Integer, default=0)  
    total_invoices_defaulted = Column(Integer, default=0)  
    repayment_rate = Column(Float, default=0.0)  
    default_rate = Column(Float, default=0.0)  
    
    # Revenue
    platform_revenue = Column(Float, default=0.0)  
    average_invoice_yield = Column(Float, default=0.0)  

    # Risk exposure
    average_composite_score = Column(Float, default=0.0)  # Avg seller risk score
    high_risk_invoices = Column(Integer, default=0)  # Score >= 70
    medium_risk_invoices = Column(Integer, default=0)  # 40 <= Score < 70
    low_risk_invoices = Column(Integer, default=0)  # Score < 40
    
    # Sector concentration 
    sector_exposure = Column(JSON, nullable=True)  
    top_sector = Column(String, nullable=True)  
    concentration_ratio = Column(Float, default=0.0)  
    
    # User/seller metrics
    total_active_sellers = Column(Integer, default=0)
    total_active_investors = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())


class RepaymentSnapshot(Base):

    __tablename__ = "repayment_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), index=True, nullable=False)
    investor_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    seller_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)

    funded_amount = Column(Float, nullable=False, default=0.0)
    repayment_amount = Column(Float, nullable=True)

    funded_at = Column(DateTime(timezone=True), nullable=True)
    repaid_at = Column(DateTime(timezone=True), nullable=True)

    # Seller signals for risk analytics.
    impact_score = Column(Float, nullable=True)
    weighted_average_days_late = Column(Float, nullable=True)

    # For concentration analytics.
    industry_sector = Column(String, nullable=True)
    geography = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class CreditEvent(Base):

    __tablename__ = "credit_events"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), index=True, nullable=False)
    seller_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    investor_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)

    event_type = Column(String, nullable=False, index=True)  #ON_TIME_PAYMENT,LATE_30,LATE_60,LATE_90
    days_late = Column(Integer, nullable=False, default=0)
    amount = Column(Float, nullable=False, default=0.0)
    notes = Column(Text, nullable=True)
    recorded_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)


class AuctionBid(Base):
    __tablename__ = "auction_bids"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), index=True, nullable=False)
    bidder_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    amount = Column(Float, nullable=False)
    status = Column(String, nullable=False, default="active", index=True)  # active,canceled,winning,outbid
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    canceled_at = Column(DateTime(timezone=True), nullable=True)


class MarketplaceListing(Base):
    __tablename__ = "marketplace_listings"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), index=True, nullable=False)
    seller_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    listing_type = Column(String, nullable=False, default="fixed", index=True)  # fixed,auction,fractional
    status = Column(String, nullable=False, default="active", index=True)  # active,paused,sold,canceled
    ask_price = Column(Float, nullable=True)
    share_price = Column(Float, nullable=True)
    total_shares = Column(Integer, nullable=True)
    available_shares = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class MarketplaceAuction(Base):
    __tablename__ = "marketplace_auctions"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), index=True, nullable=False)
    listing_id = Column(Integer, ForeignKey("marketplace_listings.id"), index=True, nullable=True)
    seller_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    status = Column(String, nullable=False, default="open", index=True)  # open,closed,canceled
    start_price = Column(Float, nullable=False, default=0.0)
    min_increment = Column(Float, nullable=False, default=100.0)
    winning_bid_id = Column(Integer, ForeignKey("auction_bids.id"), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)


class MarketplaceTransaction(Base):
    __tablename__ = "marketplace_transactions"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), index=True, nullable=False)
    listing_id = Column(Integer, ForeignKey("marketplace_listings.id"), index=True, nullable=True)
    buyer_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    seller_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    tx_type = Column(String, nullable=False, index=True)  # fund,bid,buy,settle,refund
    amount = Column(Float, nullable=False, default=0.0)
    status = Column(String, nullable=False, default="completed", index=True)  # pending,completed,failed
    reference = Column(String, nullable=True, index=True)
    tx_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)


class SettlementRecord(Base):
    __tablename__ = "settlement_records"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), index=True, nullable=False)
    investor_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    seller_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    amount = Column(Float, nullable=False, default=0.0)
    status = Column(String, nullable=False, default="pending", index=True)  # pending,confirmed,failed
    escrow_reference = Column(String, nullable=True, index=True)
    confirmed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)


class BlockchainSyncState(Base):
    __tablename__ = "blockchain_sync_state"

    id = Column(Integer, primary_key=True, index=True)
    contract_address = Column(String, nullable=False, unique=True, index=True)
    last_synced_block = Column(Integer, nullable=False, default=0)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
