import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user, require_admin
from ..database import get_db
from ..models import KycSubmission, KycStatus, KycDocType, User
from ..schemas.kyc import KycAdminListResponse, KycMeResponse, KycRejectRequest, KycSubmissionOut
from ..services.storage_s3 import upload_kyc_document


router = APIRouter()
admin_router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}
MAX_FILE_SIZE_MB = 10


def _latest_submission_for_user(db: Session, user_id: int) -> Optional[KycSubmission]:
    return (
        db.query(KycSubmission)
        .filter(KycSubmission.user_id == user_id)
        .order_by(KycSubmission.submitted_at.desc())
        .first()
    )


@router.post("/submissions", response_model=KycSubmissionOut)
async def submit_kyc(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_ext = os.path.splitext(file.filename or "")[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{file_ext}'. Allowed: PDF, PNG, JPG",
        )

    file_bytes = await file.read()
    size_mb = len(file_bytes) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large ({size_mb:.1f} MB). Maximum: {MAX_FILE_SIZE_MB} MB",
        )

    upload = upload_kyc_document(
        user_id=current_user.id,
        filename=file.filename or "kyc",
        content_type=file.content_type,
        file_bytes=file_bytes,
    )

    submission = KycSubmission(
        user_id=current_user.id,
        doc_type=KycDocType.pan,
        status=KycStatus.pending,
        s3_bucket=upload["bucket"],
        s3_key=upload["key"],
        content_type=file.content_type,
        original_filename=file.filename,
        size_bytes=len(file_bytes),
    )

    db.add(submission)
    db.commit()
    db.refresh(submission)
    return KycSubmissionOut.from_orm(submission)


@router.get("/me", response_model=KycMeResponse)
def kyc_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    latest = _latest_submission_for_user(db, current_user.id)
    if not latest:
        return {"kyc": None}
    return {"kyc": KycSubmissionOut.from_orm(latest)}


@admin_router.get("/submissions", response_model=KycAdminListResponse)
def admin_list_submissions(
    status_filter: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    q = db.query(KycSubmission)
    if status_filter:
        try:
            status_enum = KycStatus(status_filter)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid status filter")
        q = q.filter(KycSubmission.status == status_enum)

    total = q.count()
    rows = (
        q.order_by(KycSubmission.submitted_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "submissions": [KycSubmissionOut.from_orm(r) for r in rows],
        "total": total,
    }


@admin_router.post("/{submission_id}/approve", response_model=KycSubmissionOut)
def admin_approve(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    sub = db.query(KycSubmission).filter(KycSubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="KYC submission not found")

    sub.status = KycStatus.approved
    sub.reviewed_at = datetime.utcnow()
    sub.reviewed_by = current_user.id
    sub.rejection_reason = None
    db.commit()
    db.refresh(sub)
    return KycSubmissionOut.from_orm(sub)


@admin_router.post("/{submission_id}/reject", response_model=KycSubmissionOut)
def admin_reject(
    submission_id: int,
    payload: KycRejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    sub = db.query(KycSubmission).filter(KycSubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="KYC submission not found")

    sub.status = KycStatus.rejected
    sub.reviewed_at = datetime.utcnow()
    sub.reviewed_by = current_user.id
    sub.rejection_reason = payload.reason
    db.commit()
    db.refresh(sub)
    return KycSubmissionOut.from_orm(sub)

