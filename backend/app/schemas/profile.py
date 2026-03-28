from typing import Optional

from pydantic import BaseModel, Field

from .auth import UserOut
from .kyc import KycSubmissionOut


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=200)
    company_name: Optional[str] = Field(default=None, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=50)
    wallet_address: Optional[str] = Field(default=None, max_length=80)


class ProfileMeResponse(BaseModel):
    user: UserOut
    kyc: Optional[KycSubmissionOut] = None


class RiskOnboardingStatusResponse(BaseModel):
    required: bool
    completed: bool
    missing_fields: list[str] = []
    seller_id: int


class SellerRiskOnboardingPayload(BaseModel):
    payment_history_score: int = Field(ge=0, le=100)
    client_reputation_score: int = Field(ge=0, le=100)
    seller_track_record: int = Field(ge=0, le=100)
    employment_years: float = Field(ge=0, le=60)
    debt_to_income: float = Field(ge=0, le=3)
    core_enterprise_rating: int = Field(ge=0, le=100)
    transaction_stability: float = Field(ge=0, le=50)
    logistics_consistency: float = Field(ge=0, le=100)
    esg_score: float = Field(ge=0, le=10)


class SellerRiskOnboardingResponse(BaseModel):
    message: str
    seller_id: int
    composite_score: int
    risk_level: str
