from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text
from sqlalchemy.sql import func
from .database import Base

class CreditHistory(Base):
    __tablename__ = "credit_history"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, index=True) 
    payment_history_score = Column(Integer)
    client_reputation_score = Column(Integer)
    seller_track_record = Column(Integer)
    composite_score = Column(Integer, default=0) # Risk Score (0-100)
    last_updated = Column(DateTime(timezone=True), onupdate=func.now())

class FraudFlag(Base):
    __tablename__ = "fraud_flags"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, index=True)
    reason = Column(Text) # e.g., "Rapid submission detection"
    severity = Column(String) # High, Medium, Low
    is_resolved = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())