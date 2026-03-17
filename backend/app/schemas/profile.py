from typing import Optional

from pydantic import BaseModel, Field

from .auth import UserOut
from .kyc import KycSubmissionOut


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=50)


class ProfileMeResponse(BaseModel):
    user: UserOut
    kyc: Optional[KycSubmissionOut] = None

