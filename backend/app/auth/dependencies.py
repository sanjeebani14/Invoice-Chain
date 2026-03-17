from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from jose import JWTError, ExpiredSignatureError
from datetime import datetime
from ..models import User, UserRole, RefreshToken, KycSubmission, KycStatus
from .tokens import decode_token
from ..database import get_db


async def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """
    Extract and validate ACCESS TOKEN from access_token cookie.
    Returns the current authenticated user.
    """
    # Get access token from cookie
    access_token = request.cookies.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token not found in cookies"
        )
    
    try:
        # Decode JWT token
        payload = decode_token(access_token)
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired, call /auth/refresh"
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}"
        )
    
    # Verify token type is "access"
    token_type = payload.get("type")
    if token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type"
        )
    
    # Extract user_id from token payload
    user_id = payload.get("user_id")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing 'user_id' claim"
        )
    
    # Look up user in database
    user = db.query(User).filter(User.id == user_id).first()
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive"
        )
    
    return user


async def get_current_active_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Compatibility wrapper for callers expecting active-user dependency."""
    return await get_current_user(request, db)


async def get_current_user_from_refresh_token(
    request: Request, 
    db: Session = Depends(get_db)
) -> User:
    """
    Extract and validate REFRESH TOKEN from refresh_token cookie.
    Checks if token is revoked or expired in the RefreshToken table.
    Returns the current authenticated user.
    """
    # Get refresh token from cookie
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found in cookies"
        )
    
    try:
        # Decode JWT token
        payload = decode_token(refresh_token)
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired"
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate refresh token: {str(e)}"
        )
    
    # Verify token type is "refresh"
    token_type = payload.get("type")
    if token_type != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type"
        )
    
    # Extract user_id from token payload
    user_id = payload.get("user_id")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing 'user_id' claim"
        )
    
    # Look up user in database
    user = db.query(User).filter(User.id == user_id).first()
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive"
        )
    
    return user


def require_sme(current_user: User = Depends(get_current_user)):
    """Require user to have SME role"""
    if current_user.role not in {UserRole.SELLER, UserRole.SME}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only SMEs can access this"
        )
    return current_user


def require_investor(current_user: User = Depends(get_current_user)):
    """Require user to have investor role"""
    if current_user.role != UserRole.INVESTOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only investors can access this"
        )
    return current_user


def require_admin(current_user: User = Depends(get_current_user)):
    """Require user to have admin role"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can access this"
        )
    return current_user


def get_current_admin(current_user: User = Depends(get_current_active_user)):
    """Require the authenticated active user to be an admin."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


def require_kyc_approved(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    latest = (
        db.query(KycSubmission)
        .filter(KycSubmission.user_id == current_user.id)
        .order_by(KycSubmission.submitted_at.desc())
        .first()
    )
    if not latest or latest.status != KycStatus.approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="KYC required",
        )
    return current_user