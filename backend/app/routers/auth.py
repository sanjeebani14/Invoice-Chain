from fastapi import APIRouter, HTTPException, status, Depends, Response, Request, Cookie
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import os

from ..database import get_db
from ..schemas.auth import (
    UserCreate, UserLogin, TokenResponse, UserOut,
    RefreshTokenRequest, RefreshTokenResponse,
    EmailVerificationRequest, EmailVerificationResponse,
    ResendVerificationEmailRequest, ResendVerificationEmailResponse,
    VerificationStatusResponse
)
from ..auth.hashing import hash_password, verify_password
from ..auth.tokens import create_access_token, create_refresh_token, decode_token
from ..models import CreditHistory, EmailVerificationToken, User, RefreshToken, UserRole
from ..services import email_verification, email as email_service
from jose import JWTError

router = APIRouter(tags=["Authentication"])

# Cookie settings
ACCESS_TOKEN_COOKIE_MAX_AGE = 900  # 15 minutes
REFRESH_TOKEN_COOKIE_MAX_AGE = 604800  # 7 days
SECURE_COOKIES = os.getenv("ENVIRONMENT", "development") == "production"  # False for localhost
ALLOW_DEV_EMAIL_BYPASS = os.getenv("ALLOW_DEV_EMAIL_BYPASS", "true").strip().lower() == "true"


def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    """Helper function to set authentication cookies"""
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=ACCESS_TOKEN_COOKIE_MAX_AGE,
        httponly=True,
        secure=SECURE_COOKIES,
        samesite="lax"
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=REFRESH_TOKEN_COOKIE_MAX_AGE,
        httponly=True,
        secure=SECURE_COOKIES,
        samesite="lax"
    )


def clear_auth_cookies(response: Response):
    """Helper function to clear authentication cookies"""
    response.delete_cookie(key="access_token", httponly=True, secure=SECURE_COOKIES, samesite="strict")
    response.delete_cookie(key="refresh_token", httponly=True, secure=SECURE_COOKIES, samesite="strict")


def _create_and_store_refresh_token(db: Session, user_id: int) -> str:
    """Create and store a refresh token in database"""
    refresh_token = create_refresh_token(user_id)
    token_hash = hash_password(refresh_token)
    expires_at = datetime.utcnow() + timedelta(days=7)
    
    db_refresh_token = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at
    )
    db.add(db_refresh_token)
    db.commit()
    
    return refresh_token


def _normalize_registration_role(raw_role: str | None) -> UserRole:
    role = (raw_role or "seller").strip().lower()
    if role == "sme":
        return UserRole.SELLER
    if role == "admin":
        return UserRole.ADMIN
    if role == "investor":
        return UserRole.INVESTOR
    if role == "seller":
        return UserRole.SELLER
    return UserRole.SELLER


def _ensure_credit_history_row(db: Session, user: User) -> None:
    if user.role not in {UserRole.SELLER, UserRole.SME}:
        return

    existing = (
        db.query(CreditHistory)
        .filter(CreditHistory.seller_id == user.id)
        .order_by(CreditHistory.id.asc())
        .first()
    )
    if existing:
        return

    db.add(CreditHistory(seller_id=user.id, composite_score=0))
    db.commit()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user and send verification email.
    User cannot login until email is verified.
    """
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Hash the password
    hashed_password = hash_password(user_data.password)
    
    # Create new user (inactive until email is verified)
    new_user = User(
        email=user_data.email,
        password_hash=hashed_password,
        role=_normalize_registration_role(user_data.role),
        is_active=False  # User must verify email first
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    try:
        # Generate plain token (in memory) and send email first
        plain_token = email_verification.generate_verification_token()
        email_sent = email_service.send_verification_email(new_user.email, plain_token)

        if not email_sent:
            # Local dev fallback: allow onboarding when SMTP isn't configured.
            if os.getenv("ENVIRONMENT", "development") == "development" and ALLOW_DEV_EMAIL_BYPASS:
                new_user.email_verified = True
                new_user.is_active = True
                new_user.verified_at = datetime.utcnow()
                db.commit()
                return {
                    "message": "Registration successful (development mode). Email auto-verified because SMTP is not configured."
                }

            db.delete(new_user)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send verification email. Please try again later."
            )

        # Persist the hashed token only after send succeeds
        token_hash = email_verification.hash_verification_token(plain_token)
        expires_at = datetime.utcnow() + timedelta(hours=email_verification.TOKEN_EXPIRY_HOURS)

        db_token = EmailVerificationToken(
            user_id=new_user.id,
            token_hash=token_hash,
            is_used=False,
            expires_at=expires_at
        )
        db.add(db_token)
        db.commit()
        db.refresh(db_token)

        return {"message": "Registration successful. Please check your email to verify your account."}

    except Exception:
        db.rollback()
        try:
            # remove any verification tokens for this user (if any)
            db.query(EmailVerificationToken).filter(
                EmailVerificationToken.user_id == new_user.id
            ).delete(synchronize_session=False)

            # delete user by PK (avoids confirm_deleted_rows warning)
            db.query(User).filter(User.id == new_user.id).delete(synchronize_session=False)

            db.commit()
        except Exception:
            db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete registration. Please try again."
        )

@router.post("/verify-email", response_model=EmailVerificationResponse)
async def verify_email(
    req: EmailVerificationRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Verify user's email with token from verification link.
    After verification, user can login.
    """
    # Validate token
    user = email_verification.validate_verification_token(db, req.token)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token"
        )
    
    # Activate user and create tokens
    user.is_active = True
    db.commit()
    
    # Create tokens
    access_token = create_access_token(user.id)
    refresh_token = _create_and_store_refresh_token(db, user.id)
    
    # Update token issued timestamp
    user.last_refresh_token_issued_at = datetime.utcnow()
    db.commit()
    
    # Set cookies
    set_auth_cookies(response, access_token, refresh_token)
    
    return {
        "message": "Email verified successfully",
        "user": UserOut.from_orm(user)
    }



@router.get("/verify-email")
def verify_email_get(token: str, db: Session = Depends(get_db)):
    """
    Verify email via GET (used for email links). Sets auth cookies and redirects to frontend.
    """
    user = email_verification.validate_verification_token(db, token)
    if not user:
        # Redirect back to frontend with error param
        frontend = os.getenv("FRONTEND_URL", "http://localhost:3000")
        return RedirectResponse(f"{frontend}/verify-email?status=error")

    # Activate user (registration sets inactive until verified)
    user.is_active = True
    db.commit()

    # Create tokens and set cookies via redirect response
    access_token = create_access_token(user.id)
    refresh_token = _create_and_store_refresh_token(db, user.id)
    frontend = os.getenv("FRONTEND_URL", "http://localhost:3000")
    redirect = RedirectResponse(f"{frontend}/verify-email?status=success")
    set_auth_cookies(redirect, access_token, refresh_token)
    return redirect


@router.post("/resend-verification-email", response_model=ResendVerificationEmailResponse)
async def resend_verification_email(
    req: ResendVerificationEmailRequest,
    db: Session = Depends(get_db)
):
    """
    Resend verification email to user.
    For security, doesn't reveal if email exists.
    """
    # Find user by email
    user = db.query(User).filter(User.email == req.email).first()
    
    # Security: Don't reveal if email exists
    if not user:
        return {
            "message": "If this email is registered, a verification link has been sent.",
            "email": req.email
        }
    
    # If already verified, return success without sending
    if user.email_verified:
        # Heal legacy accounts where email_verified=True but is_active=False
        if not user.is_active:
            user.is_active = True
            db.commit()
        return {
            "message": "This email is already verified.",
            "email": req.email
        }
    
    try:
        # Generate token in memory and send email first
        plain_token = email_verification.generate_verification_token()
        email_sent = email_service.send_verification_email(user.email, plain_token)
        
        if not email_sent:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send verification email. Please try again later."
            )

        # Invalidate old tokens only after send succeeds
        email_verification.invalidate_previous_tokens(db, user.id)

        # Persist the hashed token
        token_hash = email_verification.hash_verification_token(plain_token)
        expires_at = datetime.utcnow() + timedelta(hours=email_verification.TOKEN_EXPIRY_HOURS)
        db_token = EmailVerificationToken(
            user_id=user.id,
            token_hash=token_hash,
            is_used=False,
            expires_at=expires_at,
        )
        db.add(db_token)
        db.commit()
        
        return {
            "message": "Verification email sent. Please check your inbox.",
            "email": req.email
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to resend verification email. Please try again."
        )


@router.get("/verification-status", response_model=VerificationStatusResponse)
def verification_status(email: str, db: Session = Depends(get_db)):
    """
    Check whether an email is verified.
    Returns minimal info and does not expose user existence beyond the given email.
    """
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    data = email_verification.get_user_verification_status(db, user.id)
    if not data:
        raise HTTPException(status_code=404, detail="User not found")
    return data


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, response: Response, db: Session = Depends(get_db)):
    """Login user with email and password. Email must be verified first."""
    # Look up user by email
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    # Verify password
    if not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    # Check if email is verified
    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before logging in. Call /auth/resend-verification-email to resend the verification link."
        )

    # Heal legacy accounts where email_verified=True but is_active=False
    if not user.is_active:
        user.is_active = True
        db.commit()

    _ensure_credit_history_row(db, user)
    
    # Create tokens
    access_token = create_access_token(user.id)
    refresh_token = _create_and_store_refresh_token(db, user.id)
    
    # Update last login and token issued time
    user.last_login = datetime.utcnow()
    user.last_refresh_token_issued_at = datetime.utcnow()
    db.commit()
    
    # Set cookies
    set_auth_cookies(response, access_token, refresh_token)
    
    return {"message": "Login successful"}


@router.post("/refresh", response_model=RefreshTokenResponse)
async def refresh(response: Response, request: Request, db: Session = Depends(get_db)):
    """Refresh access token using refresh token from cookie"""
    # Get refresh token from cookies
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found"
        )
    
    try:
        # Decode refresh token
        payload = decode_token(refresh_token)
        user_id = payload.get("user_id")
        token_type = payload.get("type")
        
        # Verify token type
        if token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )
        
        # Check if user exists and is active
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )
        
        # Check if refresh token is revoked
        token_hash = hash_password(refresh_token)
        db_token = db.query(RefreshToken).filter(
            RefreshToken.user_id == user_id,
            RefreshToken.token_hash == token_hash
        ).first()
        
        if not db_token or db_token.is_revoked:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has been revoked"
            )
        
        # Create new access token
        new_access_token = create_access_token(user_id)
        
        # Update token usage
        db_token.last_used_at = datetime.utcnow()
        db.commit()
        
        # Set new access token cookie
        response.set_cookie(
            key="access_token",
            value=new_access_token,
            max_age=ACCESS_TOKEN_COOKIE_MAX_AGE,
            httponly=True,
            secure=SECURE_COOKIES,
            samesite="strict"
        )
        
        return {"message": "Token refreshed"}
    
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )


@router.post("/logout", response_model=TokenResponse)
async def logout(response: Response, request: Request, db: Session = Depends(get_db)):
    """Logout user and revoke refresh token"""
    # Get refresh token from cookies
    refresh_token = request.cookies.get("refresh_token")
    
    if refresh_token:
        try:
            # Decode token to get user_id
            payload = decode_token(refresh_token)
            user_id = payload.get("user_id")
            
            if user_id:
                # Mark refresh token as revoked
                token_hash = hash_password(refresh_token)
                db_token = db.query(RefreshToken).filter(
                    RefreshToken.user_id == user_id,
                    RefreshToken.token_hash == token_hash
                ).first()
                
                if db_token:
                    db_token.is_revoked = True
                    db.commit()
        except JWTError:
            pass  # Token already invalid, just clear cookies
    
    # Clear cookies
    clear_auth_cookies(response)
    
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserOut)
def me(access_token: str | None = Cookie(default=None), db: Session = Depends(get_db)):
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(access_token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user_id = payload.get("user_id")
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return UserOut.from_orm(user)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")