import secrets
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from ..models import User, EmailVerificationToken
from ..auth.hashing import hash_password, verify_password

logger = logging.getLogger(__name__)

# Configuration
TOKEN_LENGTH = 32
TOKEN_EXPIRY_HOURS = 24


def generate_verification_token() -> str:
    return secrets.token_hex(TOKEN_LENGTH // 2)


def hash_verification_token(token: str) -> str:
    return hash_password(token)


def create_verification_token_for_user(db: Session, user_id: int) -> str:
    # Verify user exists
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    # Generate token
    plain_token = generate_verification_token()
    token_hash = hash_verification_token(plain_token)

    # Calculate expiration
    expires_at = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRY_HOURS)

    try:
        # Create database record
        db_token = EmailVerificationToken(
            user_id=user_id, token_hash=token_hash, is_used=False, expires_at=expires_at
        )
        db.add(db_token)
        db.commit()
        db.refresh(db_token)

        logger.info(f"Verification token created for user {user_id}")
        return plain_token

    except IntegrityError as e:
        db.rollback()
        logger.error(f"Error creating verification token for user {user_id}: {str(e)}")
        raise


def validate_verification_token(db: Session, token: str) -> User | None:
    try:
        # Only consider unused, unexpired tokens
        candidates = (
            db.query(EmailVerificationToken)
            .filter(
                EmailVerificationToken.is_used == False,
                EmailVerificationToken.expires_at >= datetime.now(timezone.utc),
            )
            .all()
        )

        db_token = None
        for cand in candidates:
            if verify_password(token, cand.token_hash):
                db_token = cand
                break

        if not db_token:
            logger.warning("Verification token not found or invalid")
            return None

        if db_token.is_used:
            logger.warning(
                f"Verification token already used for user {db_token.user_id}"
            )
            return None

        if datetime.now(timezone.utc) > db_token.expires_at:
            logger.warning(f"Verification token expired for user {db_token.user_id}")
            return None

        # Mark token used and verify user
        db_token.is_used = True
        db_token.used_at = datetime.now(timezone.utc)

        user = db.query(User).filter(User.id == db_token.user_id).first()
        if user:
            user.email_verified = True
            user.verified_at = datetime.now(timezone.utc)
            user.is_active = True
            db.commit()
            logger.info(f"Email verified for user {user.id} ({user.email})")
            return user
        else:
            logger.error(f"User {db_token.user_id} not found during token validation")
            db.rollback()
            return None

    except Exception as e:
        logger.error(f"Error validating verification token: {str(e)}")
        return None


def invalidate_previous_tokens(db: Session, user_id: int) -> int:
    try:
        tokens = (
            db.query(EmailVerificationToken)
            .filter(
                EmailVerificationToken.user_id == user_id,
                EmailVerificationToken.is_used == False,
            )
            .all()
        )

        count = 0
        for token in tokens:
            token.is_used = True
            count += 1

        db.commit()
        logger.info(f"Invalidated {count} previous tokens for user {user_id}")
        return count

    except Exception as e:
        logger.error(f"Error invalidating previous tokens for user {user_id}: {str(e)}")
        return 0


def cleanup_expired_tokens(db: Session) -> int:
    try:
        # Delete tokens that have expired
        result = (
            db.query(EmailVerificationToken)
            .filter(EmailVerificationToken.expires_at < datetime.now(timezone.utc))
            .delete()
        )

        db.commit()
        logger.debug(f"Cleaned up {result} expired verification tokens")
        return result

    except Exception as e:
        logger.error(f"Error cleaning up expired tokens: {str(e)}")
        return 0


def get_user_verification_status(db: Session, user_id: int) -> dict:

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        return None

    return {
        "email": user.email,
        "email_verified": user.email_verified,
        "verified_at": user.verified_at.isoformat() if user.verified_at else None,
    }
