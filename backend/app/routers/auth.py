import os
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request, Cookie
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, EmailVerificationToken, PasswordResetToken
from ..schemas.auth import (
    UserCreate,
    UserLogin,
    TokenResponse,
    UserOut,
    LoginResponse,
    TwoFactorLoginRequest,
    RefreshTokenResponse,
    EmailVerificationRequest,
    EmailVerificationResponse,
    ResendVerificationEmailRequest,
    ResendVerificationEmailResponse,
    VerificationStatusResponse,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    TwoFactorSetupResponse,
    TwoFactorEnableRequest,
    TwoFactorDisableRequest,
)
from ..services.auth_service import AuthService
from ..services import email as email_service
from ..auth.tokens import (
    decode_token,
)
from ..models import (
    CreditHistory,
    EmailVerificationToken,
    PasswordResetToken,
    User,
    RefreshToken,
    UserRole,
)
from ..services import email_verification, email as email_service
from ..services.rate_limit import enforce_rate_limit
from ..auth.utils import set_auth_cookies, clear_auth_cookies
from ..auth.tokens import decode_token

router = APIRouter(tags=["Authentication"])


def _get_user_from_cookie(access_token: str | None, db: Session) -> User:
    """Helper to extract user from the access token cookie."""
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    try:
        payload = decode_token(access_token)
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type"
            )
        user_id = payload.get("user_id")
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
            )
        return user
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )


# Registration & Verification


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate, request: Request, db: Session = Depends(get_db)
):
    enforce_rate_limit(key=f"reg:{request.client.host}", limit=10, window_seconds=600)
    service = AuthService(db)

    if db.query(User).filter_by(email=user_data.email).first():
        raise HTTPException(400, "Email already registered")

    user = service.register_user(user_data.email, user_data.password, user_data.role)
    token = service.create_verification_token(user.id)

    email_service.send_verification_email(user.email, token)
    return {"message": "Registration successful. Check your email."}


@router.post("/verify-email", response_model=EmailVerificationResponse)
async def verify_email(
    req: EmailVerificationRequest, response: Response, db: Session = Depends(get_db)
):
    service = AuthService(db)
    user = service.validate_verification_token(req.token)
    if not user:
        raise HTTPException(400, "Invalid or expired token")
    return {"message": "Email verified successfully", "user": UserOut.from_orm(user)}


@router.get("/verify-email")
def verify_email_link(token: str, db: Session = Depends(get_db)):
    """Handles the direct link click from the email."""
    try:
        service = AuthService(db)

        # Validate the token
        user = service.validate_verification_token(token)
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

        # If token is invalid or expired
        if not user:
            print(f"DEBUG: Verification failed for token: {token}")
            return RedirectResponse(url=f"{frontend_url}/verify-email?status=error")

        # Update user status and redirect to verification result page.
        service.heal_user_status(user)
        response = RedirectResponse(url=f"{frontend_url}/verify-email?status=success")
        print(f"DEBUG: Verification successful for user: {user.email}")
        return response

    except Exception as e:
        print(f"CRITICAL ERROR in verify_email_link: {str(e)}")
        raise HTTPException(
            status_code=500, detail="Internal Server Error during verification"
        )


@router.post(
    "/resend-verification-email", response_model=ResendVerificationEmailResponse
)
async def resend_verification(
    req: ResendVerificationEmailRequest, db: Session = Depends(get_db)
):
    service = AuthService(db)
    user, token = service.prepare_resend_verification(req.email)

    if not user:
        return {
            "message": "If registered, a verification link has been sent.",
            "email": req.email,
        }

    if not token:
        return {"message": "This email is already verified.", "email": req.email}

    if email_service.send_verification_email(user.email, token):
        return {
            "message": "Verification email sent. Check your inbox.",
            "email": req.email,
        }

    raise HTTPException(500, "Failed to send email")


@router.get("/verification-status", response_model=VerificationStatusResponse)
def get_verification_status(email: str, db: Session = Depends(get_db)):
    status_data = AuthService(db).get_verification_status(email)
    if not status_data:
        raise HTTPException(404, "User not found")
    return status_data


# Login & Session


@router.post("/login", response_model=LoginResponse)
async def login(
    credentials: UserLogin,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
):
    enforce_rate_limit(key=f"login:{request.client.host}", limit=20, window_seconds=600)
    service = AuthService(db)

    user = service.authenticate_user(credentials.email, credentials.password)
    if not user:
        raise HTTPException(401, "Invalid email or password")

    if not user.email_verified:
        raise HTTPException(403, "Please verify your email first")

    service.heal_user_status(user)

    if user.two_factor_enabled and not credentials.two_factor_code:
        return {
            "message": "Two-factor authentication required",
            "requires_two_factor": True,
            "two_factor_token": service.create_2fa_challenge_token(user.id),
        }

    access, refresh = service.create_login_session(user)
    set_auth_cookies(response, access, refresh)
    return {"message": "Login successful", "requires_two_factor": False}


@router.post("/login/2fa", response_model=TokenResponse)
async def login_2fa(
    payload: TwoFactorLoginRequest, response: Response, db: Session = Depends(get_db)
):
    service = AuthService(db)
    user = service.verify_2fa_challenge(payload.two_factor_token, payload.code)

    if not user:
        raise HTTPException(401, "Invalid code or expired challenge")

    access, refresh = service.create_login_session(user)
    set_auth_cookies(response, access, refresh)
    return {"message": "Login successful"}


@router.post("/refresh", response_model=RefreshTokenResponse)
async def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "Missing refresh token")

    service = AuthService(db)
    new_access = service.refresh_session(token)
    if not new_access:
        raise HTTPException(401, "Invalid session or expired refresh token")

    set_auth_cookies(response, new_access, token)
    return {"message": "Token refreshed"}


@router.post("/logout")
async def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get("refresh_token")
    if token:
        AuthService(db).logout_user(token)
    clear_auth_cookies(response)
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserOut)
def me(access_token: str | None = Cookie(default=None), db: Session = Depends(get_db)):
    user = _get_user_from_cookie(access_token, db)
    return UserOut.from_orm(user)


# Password Recovery


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    service = AuthService(db)
    user = db.query(User).filter_by(email=req.email).first()
    if user:
        token = service.initiate_password_reset(user.id)
        email_service.send_password_reset_email(user.email, token)
    return {
        "message": "If this email is registered, a password reset link has been sent."
    }


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    service = AuthService(db)
    token_row = service.validate_password_reset_token(req.token)
    if not token_row:
        raise HTTPException(400, "Invalid or expired reset token")

    service.reset_password(token_row.user_id, req.new_password)
    return {"message": "Password reset successful"}


# 2FA Management


@router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
def setup_2fa(
    access_token: str | None = Cookie(default=None), db: Session = Depends(get_db)
):
    user = _get_user_from_cookie(access_token, db)
    secret = AuthService(db).generate_2fa_secret(user)
    return {
        "message": "2FA setup secret generated",
        "secret": secret,
        "otpauth_url": f"otpauth://totp/InvoiceChain:{user.email}?secret={secret}&issuer=InvoiceChain",
    }


@router.post("/2fa/enable")
def enable_2fa(
    payload: TwoFactorEnableRequest,
    access_token: str | None = Cookie(None),
    db: Session = Depends(get_db),
):
    user = _get_user_from_cookie(access_token, db)
    if not AuthService(db).toggle_2fa(user.id, enable=True, code=payload.code):
        raise HTTPException(400, "Invalid 2FA code")
    return {"message": "2FA enabled"}


@router.post("/2fa/disable")
def disable_2fa(
    payload: TwoFactorDisableRequest,
    access_token: str | None = Cookie(None),
    db: Session = Depends(get_db),
):
    user = _get_user_from_cookie(access_token, db)
    if not AuthService(db).toggle_2fa(user.id, enable=False, code=payload.code):
        raise HTTPException(400, "Valid 2FA code required to disable")
    return {"message": "2FA disabled"}
