from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")
    role: str = Field(default="seller", description="User role: seller, investor or admin")
    
    class Config:
        example = {
            "email": "user@example.com",
            "password": "secure_password_123",
            "role": "seller"
        }


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    
    class Config:
        example = {
            "email": "user@example.com",
            "password": "secure_password_123"
        }


class TokenResponse(BaseModel):
    message: str = "Login successful"
    
    class Config:
        example = {
            "message": "Login successful"
        }


class RefreshTokenRequest(BaseModel):
    """Request body for refresh token endpoint (can be empty)"""
    pass
    
    class Config:
        example = {}


class RefreshTokenResponse(BaseModel):
    message: str = "Token refreshed"
    
    class Config:
        example = {
            "message": "Token refreshed"
        }


class UserOut(BaseModel):
    id: int
    email: str
    role: str
    is_active: bool
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email_verified: bool
    verified_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True  # Support ORM mode for automatic conversion from DB models
        example = {
            "id": 1,
            "email": "user@example.com",
            "role": "seller",
            "is_active": True,
            "full_name": "Jane Doe",
            "phone": "+91-9876543210",
            "email_verified": True,
            "verified_at": "2026-03-14T10:30:00+00:00",
        }


# ── Email Verification Schemas ─────────────────────────────────

class EmailVerificationRequest(BaseModel):
    token: str = Field(..., description="One-time verification token from email link")
    
    class Config:
        example = {
            "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
        }


class EmailVerificationResponse(BaseModel):
    message: str = "Email verified successfully"
    user: UserOut
    
    class Config:
        example = {
            "message": "Email verified successfully",
            "user": {
                "id": 1,
                "email": "user@example.com",
                "role": "seller"
            }
        }


class ResendVerificationEmailRequest(BaseModel):
    email: EmailStr = Field(..., description="User's email address")
    
    class Config:
        example = {
            "email": "user@example.com"
        }


class ResendVerificationEmailResponse(BaseModel):
    message: str = "Verification email sent"
    email: str
    
    class Config:
        example = {
            "message": "Verification email sent",
            "email": "user@example.com"
        }


class VerificationStatusResponse(BaseModel):
    email_verified: bool
    email: str
    verified_at: Optional[str] = None  # ISO 8601 datetime string
    
    class Config:
        from_attributes = True
        example = {
            "email_verified": True,
            "email": "user@example.com",
            "verified_at": "2026-03-14T10:30:00+00:00"
        }
