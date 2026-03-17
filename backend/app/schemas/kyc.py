from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class KycSubmissionOut(BaseModel):
    id: int
    doc_type: str
    status: str
    original_filename: Optional[str] = None
    size_bytes: int
    submitted_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[int] = None
    rejection_reason: Optional[str] = None

    class Config:
        from_attributes = True


class KycMeResponse(BaseModel):
    kyc: Optional[KycSubmissionOut] = None


class KycAdminListResponse(BaseModel):
    submissions: list[KycSubmissionOut]
    total: int


class KycRejectRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=2000)
