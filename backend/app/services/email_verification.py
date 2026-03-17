import secrets
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from ..models import User, EmailVerificationToken
from ..auth.hashing import hash_password, verify_password

logger = logging.getLogger(__name__)

# Configuration
TOKEN_LENGTH = 32  # 32 characters for token
TOKEN_EXPIRY_HOURS = 24  # Tokens valid for 24 hours


def generate_verification_token() -> str:
    """
    Generate a cryptographically secure random token for email verification.
    
    Returns:
        A 32-character hexadecimal token string
        Example: "a7f3k9m2q1x8b5c6d9e2f4g7h0j3k6l9"
    """
    return secrets.token_hex(TOKEN_LENGTH // 2)


def hash_verification_token(token: str) -> str:
    """
    Hash a verification token using the same method as passwords (bcrypt).
    
    Args:
        token: Plain verification token
        
    Returns:
        Hashed token string
    """
    return hash_password(token)


def create_verification_token_for_user(db: Session, user_id: int) -> str:
    """
    Generate and store a new verification token for a user.
    
    Args:
        db: Database session
        user_id: User ID to create token for
        
    Returns:
        Plain token string (send this in email)
        
    Raises:
        ValueError: If user not found
    """
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
            user_id=user_id,
            token_hash=token_hash,
            is_used=False,
            expires_at=expires_at
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
        candidates = db.query(EmailVerificationToken).filter(
            EmailVerificationToken.is_used == False,
            EmailVerificationToken.expires_at >= datetime.now(timezone.utc)
        ).all()

        db_token = None
        for cand in candidates:
            if verify_password(token, cand.token_hash):
                db_token = cand
                break

        if not db_token:
            logger.warning("Verification token not found or invalid")
            return None

        if db_token.is_used:
            logger.warning(f"Verification token already used for user {db_token.user_id}")
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
            # Keep auth invariants consistent: verified users are active.
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
    """
    Mark all unused verification tokens for a user as used.
    
    Used when resending verification email to invalidate old tokens.
    
    Args:
        db: Database session
        user_id: User ID
        
    Returns:
        Number of tokens invalidated
    """
    try:
        tokens = db.query(EmailVerificationToken).filter(
            EmailVerificationToken.user_id == user_id,
            EmailVerificationToken.is_used == False
        ).all()
        
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
    """
    Delete all expired verification tokens from database.
    
    Called periodically as maintenance task (e.g., via cron job or background task).
    
    Args:
        db: Database session
        
    Returns:
        Number of tokens deleted
    """
    try:
        # Delete tokens that have expired
        result = db.query(EmailVerificationToken).filter(
            EmailVerificationToken.expires_at < datetime.now(timezone.utc)
        ).delete()
        
        db.commit()
        logger.debug(f"Cleaned up {result} expired verification tokens")
        return result
        
    except Exception as e:
        logger.error(f"Error cleaning up expired tokens: {str(e)}")
        return 0


def get_user_verification_status(db: Session, user_id: int) -> dict:
    """
    Get the verification status of a user.
    
    Args:
        db: Database session
        user_id: User ID
        
    Returns:
        Dictionary with verification status
    """
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        return None
    
    return {
        "email": user.email,
        "email_verified": user.email_verified,
        "verified_at": user.verified_at.isoformat() if user.verified_at else None
    }
