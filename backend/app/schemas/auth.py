from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(
        ..., min_length=8, description="Password must be at least 8 characters"
    )
    role: str = Field(
        default="seller", description="User role: seller, investor or admin"
    )

    class Config:
        example = {
            "email": "user@example.com",
            "password": "secure_password_123",
            "role": "seller",
        }


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    two_factor_code: Optional[str] = None

    class Config:
        example = {
            "email": "user@example.com",
            "password": "secure_password_123",
            "two_factor_code": "123456",
        }


class LoginResponse(BaseModel):
    message: str = "Login successful"
    requires_two_factor: bool = False
    two_factor_token: Optional[str] = None


class TwoFactorLoginRequest(BaseModel):
    two_factor_token: str = Field(..., min_length=16)
    code: str = Field(..., min_length=6, max_length=10)


class TokenResponse(BaseModel):
    message: str = "Login successful"

    class Config:
        example = {"message": "Login successful"}


class RefreshTokenRequest(BaseModel):

    pass

    class Config:
        example = {}


class RefreshTokenResponse(BaseModel):
    message: str = "Token refreshed"

    class Config:
        example = {"message": "Token refreshed"}


class UserOut(BaseModel):
    id: int
    email: str
    role: str
    is_active: bool
    full_name: Optional[str] = None
    company_name: Optional[str] = None
    phone: Optional[str] = None
    two_factor_enabled: bool = False
    email_verified: bool
    verified_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        example = {
            "id": 1,
            "email": "user@example.com",
            "role": "seller",
            "is_active": True,
            "full_name": "Jane Doe",
            "company_name": "Acme Pvt Ltd",
            "phone": "+91-9876543210",
            "two_factor_enabled": False,
            "email_verified": True,
            "verified_at": "2026-03-14T10:30:00+00:00",
        }


# Email Verification Schemas


class EmailVerificationRequest(BaseModel):
    token: str = Field(..., description="One-time verification token from email link")

    class Config:
        example = {"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}


class EmailVerificationResponse(BaseModel):
    message: str = "Email verified successfully"
    user: UserOut

    class Config:
        example = {
            "message": "Email verified successfully",
            "user": {"id": 1, "email": "user@example.com", "role": "seller"},
        }


class ResendVerificationEmailRequest(BaseModel):
    email: EmailStr = Field(..., description="User's email address")

    class Config:
        example = {"email": "user@example.com"}


class ResendVerificationEmailResponse(BaseModel):
    message: str = "Verification email sent"
    email: str

    class Config:
        example = {"message": "Verification email sent", "email": "user@example.com"}


class VerificationStatusResponse(BaseModel):
    email_verified: bool
    email: str
    verified_at: Optional[str] = None

    class Config:
        from_attributes = True
        example = {
            "email_verified": True,
            "email": "user@example.com",
            "verified_at": "2026-03-14T10:30:00+00:00",
        }


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., description="User's registered email address")

    class Config:
        example = {"email": "user@example.com"}


class ForgotPasswordResponse(BaseModel):
    message: str = "If this email is registered, a password reset link has been sent."

    class Config:
        example = {
            "message": "If this email is registered, a password reset link has been sent."
        }


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=8, description="Password reset token from email")
    new_password: str = Field(
        ..., min_length=8, description="New password (minimum 8 chars)"
    )

    class Config:
        example = {
            "token": "f4f7ca5f0d32a8bfb1f4d6e2f0d845a1",
            "new_password": "new_secure_password_123",
        }


class ResetPasswordResponse(BaseModel):
    message: str = "Password reset successful"

    class Config:
        example = {"message": "Password reset successful"}


class TwoFactorSetupResponse(BaseModel):
    message: str
    secret: str
    otpauth_url: str


class TwoFactorEnableRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=10)


class TwoFactorDisableRequest(BaseModel):
    code: Optional[str] = None
