from pydantic import BaseModel, EmailStr, Field
from typing import Optional


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")
    role: str = Field(default="sme", description="User role: sme, investor or admin")
    
    class Config:
        example = {
            "email": "user@example.com",
            "password": "secure_password_123",
            "role": "sme"
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
    access_token: str
    token_type: str = "bearer"
    
    class Config:
        example = {
            "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            "token_type": "bearer"
        }


class UserOut(BaseModel):
    id: int
    email: str
    role: str
    
    class Config:
        from_attributes = True  # Support ORM mode for automatic conversion from DB models
        example = {
            "id": 1,
            "email": "user@example.com",
            "role": "sme"
        }
