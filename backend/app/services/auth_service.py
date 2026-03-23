import secrets
import base64
import pyotp
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from jose import jwt

from ..models import User, RefreshToken, PasswordResetToken, UserRole, EmailVerificationToken
from ..auth.hashing import hash_password, verify_password
from ..auth.tokens import create_access_token, create_refresh_token, SECRET_KEY, ALGORITHM

class AuthService:
    def __init__(self, db: Session):
        self.db = db

    # ── Identity & Roles ──────────────────────────────────────────
    def normalize_registration_role(self, raw_role: Optional[str]) -> UserRole:
        role = (raw_role or "seller").strip().lower()
        mapping = {
            "seller": UserRole.SELLER,
            "sme": UserRole.SELLER,
            "admin": UserRole.ADMIN,
            "investor": UserRole.INVESTOR
        }
        return mapping.get(role, UserRole.SELLER)
    
    def authenticate_user(self, email: str, password: str) -> Optional[User]:
        """Verify credentials and return the user if valid."""
        user = self.db.query(User).filter(User.email == email).first()
        if user and verify_password(password, user.password_hash):
            return user
        return None

    def register_user(self, email: str, password: str, role: Optional[str]) -> User:
        """Create a new inactive user record."""
        user = User(
            email=email,
            password_hash=hash_password(password),
            role=self.normalize_registration_role(role),
            is_active=False
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def create_verification_token(self, user_id: int) -> str:
        """Generate and store a hashed email verification token."""
        plain_token = secrets.token_hex(32)
        token_hash = hash_password(plain_token)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

        db_token = EmailVerificationToken(
            user_id=user_id,
            token_hash=token_hash,
            is_used=False,
            expires_at=expires_at
        )
        self.db.add(db_token)
        self.db.commit()
        return plain_token

    # ── Session Maintenance ───────────────────────────────────────
    def refresh_session(self, refresh_token: str) -> Optional[str]:
        """Validates a refresh token and returns a fresh access token."""
        try:
            # We decode to get the user_id for the DB lookup
            payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("user_id")
            if not user_id:
                return None
            
            # Use the hash to find the specific token in the DB
            token_hash = hash_password(refresh_token)
            db_token = self.db.query(RefreshToken).filter(
                RefreshToken.user_id == user_id,
                RefreshToken.token_hash == token_hash,
                RefreshToken.is_revoked == False,
                RefreshToken.expires_at >= datetime.now(timezone.utc)
            ).first()

            if not db_token:
                return None

            # Update usage metadata
            db_token.last_used_at = datetime.now(timezone.utc)
            self.db.commit()

            return create_access_token(user_id)
        except Exception:
            return None

    def logout_user(self, refresh_token: str):
        """Revokes a specific refresh token to end a session."""
        token_hash = hash_password(refresh_token)
        self.db.query(RefreshToken).filter(
            RefreshToken.token_hash == token_hash
        ).update({"is_revoked": True}, synchronize_session=False)
        self.db.commit()

    def create_and_store_refresh_token(self, user_id: int) -> str:
        refresh_token = create_refresh_token(user_id)
        token_hash = hash_password(refresh_token)
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        
        db_token = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at
        )
        self.db.add(db_token)
        self.db.commit()
        return refresh_token
    
    def validate_verification_token(self, plain_token: str) -> Optional[User]:
        """Finds a user associated with a valid, unexpired email token."""
        candidates = self.db.query(EmailVerificationToken).filter(
            EmailVerificationToken.is_used == False,
            EmailVerificationToken.expires_at >= datetime.now(timezone.utc)
        ).all()

        for token_row in candidates:
            if verify_password(plain_token, token_row.token_hash):
                token_row.is_used = True
                token_row.used_at = datetime.now(timezone.utc)

                user = self.db.query(User).get(token_row.user_id)
                if user and not user.email_verified:
                    user.email_verified = True
                    user.verified_at = datetime.now(timezone.utc)
                    # Optionally activate legacy accounts
                    user.is_active = True
                self.db.commit()
                return user
        
        return None

    def create_login_session(self, user: User) -> Tuple[str, str]:
        """Helper to update user metadata and return access/refresh token pair."""
        now = datetime.now(timezone.utc)
        user.last_login = now
        user.last_refresh_token_issued_at = now
        
        access_token = create_access_token(user.id)
        refresh_token = self.create_and_store_refresh_token(user.id)
        
        self.db.commit()
        return access_token, refresh_token
    
    
    # ── Security & 2FA ────────────────────────────────────────────
    def verify_totp_code(self, user: User, code: str) -> bool:
        if not user.two_factor_secret:
            return False
        
        # Internal helper for base32 padding
        stripped = (user.two_factor_secret).strip().replace(" ", "")
        padding = (-len(stripped)) % 8
        normalized = stripped + ("=" * padding)
        
        totp = pyotp.TOTP(normalized)
        return bool(totp.verify(code.strip(), valid_window=1))

    def create_2fa_challenge_token(self, user_id: int) -> str:
        now = datetime.now(timezone.utc)
        payload = {
            "user_id": user_id,
            "type": "two_factor_pending",
            "jti": secrets.token_hex(8),
            "exp": now + timedelta(minutes=10),
            "iat": now,
        }
        return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    def generate_2fa_secret(self, user: User) -> str:
        """Generates a new TOTP secret and stores it (initially disabled)."""
        raw = secrets.token_bytes(20)
        secret = base64.b32encode(raw).decode("ascii").rstrip("=")
        
        user.two_factor_secret = secret
        user.two_factor_enabled = False # Must verify a code before enabling
        self.db.commit()
        
        return secret
    

    # ── Recovery & Resets ─────────────────────────────────────────
    def reset_password(self, user_id: int, new_password: str):
        """Updates the user password and invalidates all existing sessions."""
        user = self.db.query(User).get(user_id)
        if user:
            user.password_hash = hash_password(new_password)
            
            # Security measure: Revoke all refresh tokens on password change
            self.db.query(RefreshToken).filter(
                RefreshToken.user_id == user_id
            ).update({"is_revoked": True}, synchronize_session=False)
            
            self.db.commit()

    def initiate_password_reset(self, user_id: int) -> str:
        plain_token = secrets.token_hex(16)
        
        # Invalidate old tokens
        self.db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user_id,
            PasswordResetToken.is_used == False,
        ).update(
            {
                PasswordResetToken.is_used: True, 
                PasswordResetToken.used_at: datetime.now(timezone.utc)
            },
            synchronize_session=False,
        )

        db_reset = PasswordResetToken(
            user_id=user_id,
            token_hash=hash_password(plain_token),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1)
        )
        self.db.add(db_reset)
        self.db.commit()
        return plain_token

    def validate_password_reset_token(self, plain_token: str) -> Optional[PasswordResetToken]:
        candidates = self.db.query(PasswordResetToken).filter(
            PasswordResetToken.is_used == False,
            PasswordResetToken.expires_at >= datetime.now(timezone.utc),
        ).all()

        for token_row in candidates:
            if verify_password(plain_token, token_row.token_hash):
                return token_row
        return None
    
    # ── Verification Maintenance ──────────────────────────────────

    def invalidate_verification_tokens(self, user_id: int):
        """Invalidates all outstanding email verification tokens for a user."""
        self.db.query(EmailVerificationToken).filter(
            EmailVerificationToken.user_id == user_id,
            EmailVerificationToken.is_used == False
        ).update({"is_used": True}, synchronize_session=False)
        self.db.commit()

    def get_verification_status(self, user_id: int) -> dict:
        """Returns the current verification state for a user."""
        user = self.db.query(User).get(user_id)
        if not user:
            return {"verified": False, "exists": False}
        
        return {
            "verified": user.email_verified,
            "verified_at": user.verified_at,
            "is_active": user.is_active,
            "exists": True
        }

    def heal_user_status(self, user: User):
        """Ensures verified users are marked as active (Legacy account fix)."""
        if user.email_verified and not user.is_active:
            user.is_active = True
            self.db.commit()

# ── Verification & Status ─────────────────────────────────────

    def get_verification_status(self, email: str) -> dict:
        user = self.db.query(User).filter(User.email == email).first()
        if not user:
            return None
        return {
            "email": user.email,
            "verified": user.email_verified,
            "verified_at": user.verified_at,
            "is_active": user.is_active
        }

    def prepare_resend_verification(self, email: str) -> Optional[Tuple[User, str]]:
        user = self.db.query(User).filter(User.email == email).first()
        if not user or user.email_verified:
            return user, None
            
        plain_token = secrets.token_hex(32)
        self.invalidate_verification_tokens(user.id)
        
        db_token = EmailVerificationToken(
            user_id=user.id,
            token_hash=hash_password(plain_token),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24)
        )
        self.db.add(db_token)
        self.db.commit()
        return user, plain_token

    # ── Advanced 2FA Logic ────────────────────────────────────────

    def verify_2fa_challenge(self, challenge_token: str, code: str) -> Optional[User]:
        try:
            payload = jwt.decode(challenge_token, SECRET_KEY, algorithms=[ALGORITHM])
            if payload.get("type") != "two_factor_pending":
                return None
            
            user_id = payload.get("user_id")
            user = self.db.query(User).get(int(user_id))
            
            if user and self.verify_totp_code(user, code):
                return user
            return None
        except Exception:
            return None

    def toggle_2fa(self, user_id: int, enable: bool, code: str = None) -> bool:
        user = self.db.query(User).get(user_id)
        if enable:
            if not user.two_factor_secret or not self.verify_totp_code(user, code):
                return False
            user.two_factor_enabled = True
        else:
            if user.two_factor_enabled and (not code or not self.verify_totp_code(user, code)):
                return False
            user.two_factor_enabled = False
            user.two_factor_secret = None
        
        self.db.commit()
        return True