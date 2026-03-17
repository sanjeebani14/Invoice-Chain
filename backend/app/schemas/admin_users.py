from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from ..models import UserRole


class AdminUserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: UserRole
    is_active: bool
    email_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AdminUserUpdate(BaseModel):
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class AdminUserListResponse(BaseModel):
    users: list[AdminUserOut]


class AdminUserCreate(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None
    role: UserRole = UserRole.SELLER
    is_active: bool = True
    email_verified: bool = True
