import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..database import get_db
from ..models import KycSubmission, User
from ..schemas.kyc import KycSubmissionOut
from ..schemas.profile import ProfileMeResponse, UserProfileUpdate
from ..schemas.auth import UserOut


router = APIRouter(prefix="/api/v1/profile", tags=["Profile"])
WALLET_REGEX = re.compile(r"^0x[a-fA-F0-9]{40}$")


def _latest_submission_for_user(db: Session, user_id: int) -> KycSubmission | None:
    return (
        db.query(KycSubmission)
        .filter(KycSubmission.user_id == user_id)
        .order_by(KycSubmission.submitted_at.desc())
        .first()
    )


@router.get("/me", response_model=ProfileMeResponse)
def profile_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    latest = _latest_submission_for_user(db, current_user.id)
    return {
        "user": UserOut.from_orm(current_user),
        "kyc": KycSubmissionOut.from_orm(latest) if latest else None,
    }


@router.patch("/me", response_model=UserOut)
def update_profile_me(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (
        payload.full_name is None
        and payload.phone is None
        and payload.wallet_address is None
    ):
        raise HTTPException(status_code=400, detail="No changes provided")

    if payload.full_name is not None:
        current_user.full_name = payload.full_name.strip() or None
    if payload.phone is not None:
        current_user.phone = payload.phone.strip() or None
    if payload.wallet_address is not None:
        candidate = payload.wallet_address.strip()
        if not candidate:
            current_user.wallet_address = None
        elif not WALLET_REGEX.match(candidate):
            raise HTTPException(status_code=400, detail="Invalid wallet address")
        else:
            existing_wallet_owner = (
                db.query(User)
                .filter(User.wallet_address == candidate, User.id != current_user.id)
                .first()
            )
            if existing_wallet_owner:
                raise HTTPException(status_code=400, detail="Wallet is already linked to another account")
            current_user.wallet_address = candidate

    db.commit()
    db.refresh(current_user)
    return UserOut.from_orm(current_user)

