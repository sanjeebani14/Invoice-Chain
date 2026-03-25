import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..database import get_db
from ..models import CreditHistory, KycSubmission, User, UserRole
from ..schemas.kyc import KycSubmissionOut
from ..schemas.profile import (
    ProfileMeResponse,
    RiskOnboardingStatusResponse,
    SellerRiskOnboardingPayload,
    SellerRiskOnboardingResponse,
    UserProfileUpdate,
)
from ..schemas.auth import UserOut
from ..services.risk_scoring.risk_service import RiskScoringEngine


router = APIRouter()
WALLET_REGEX = re.compile(r"^0x[a-fA-F0-9]{40}$")
risk_engine = RiskScoringEngine()

REQUIRED_RISK_FIELDS = [
    "payment_history_score",
    "client_reputation_score",
    "seller_track_record",
    "employment_years",
    "debt_to_income",
    "core_enterprise_rating",
    "transaction_stability",
    "logistics_consistency",
    "esg_score",
]


def _latest_submission_for_user(db: Session, user_id: int) -> KycSubmission | None:
    return (
        db.query(KycSubmission)
        .filter(KycSubmission.user_id == user_id)
        .order_by(KycSubmission.submitted_at.desc())
        .first()
    )


def _get_or_create_credit_history(db: Session, seller_id: int) -> CreditHistory:
    record = (
        db.query(CreditHistory)
        .filter(CreditHistory.seller_id == seller_id)
        .order_by(CreditHistory.id.asc())
        .first()
    )
    if record:
        return record

    record = CreditHistory(seller_id=seller_id, composite_score=0)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def _missing_risk_fields(record: CreditHistory | None) -> list[str]:
    if record is None:
        return REQUIRED_RISK_FIELDS.copy()

    missing: list[str] = []
    for field_name in REQUIRED_RISK_FIELDS:
        value = getattr(record, field_name, None)
        if value is None:
            missing.append(field_name)
    return missing


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
    if payload.company_name is not None:
        current_user.company_name = payload.company_name.strip() or None
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


@router.get("/risk-onboarding/status", response_model=RiskOnboardingStatusResponse)
def risk_onboarding_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {UserRole.SELLER, UserRole.SME}:
        return {
            "required": False,
            "completed": True,
            "missing_fields": [],
            "seller_id": current_user.id,
        }

    record = (
        db.query(CreditHistory)
        .filter(CreditHistory.seller_id == current_user.id)
        .order_by(CreditHistory.id.asc())
        .first()
    )
    missing = _missing_risk_fields(record)

    return {
        "required": len(missing) > 0,
        "completed": len(missing) == 0,
        "missing_fields": missing,
        "seller_id": current_user.id,
    }


@router.put("/risk-onboarding", response_model=SellerRiskOnboardingResponse)
def upsert_risk_onboarding(
    payload: SellerRiskOnboardingPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {UserRole.SELLER, UserRole.SME}:
        raise HTTPException(status_code=403, detail="Only sellers/SMEs can submit risk profile")

    record = _get_or_create_credit_history(db, current_user.id)
    record.payment_history_score = payload.payment_history_score
    record.client_reputation_score = payload.client_reputation_score
    record.seller_track_record = payload.seller_track_record
    record.employment_years = payload.employment_years
    record.debt_to_income = payload.debt_to_income
    record.core_enterprise_rating = payload.core_enterprise_rating
    record.transaction_stability = payload.transaction_stability
    record.logistics_consistency = payload.logistics_consistency
    record.esg_score = payload.esg_score

    
    record.risk_input_signature = None
    db.add(record)
    db.commit()
    db.refresh(record)

    score = risk_engine.calculate_score(db=db, seller_id=current_user.id)

    return {
        "message": "Risk profile saved",
        "seller_id": current_user.id,
        "composite_score": int(score.get("composite_score", 0)),
        "risk_level": str(score.get("risk_level", "Medium")),
    }

