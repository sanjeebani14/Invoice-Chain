import logging
import os
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import json

from ..models import User, KYCVerification

logger = logging.getLogger(__name__)


class KYCService:
    """
    KYC (Know Your Customer) verification service.
    Handles document upload, verification, and approval.
    """

    # KYC status levels
    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_REVIEW = "review"
    STATUS_EXPIRED = "expired"

    # Document types
    DOC_TYPE_ID = "government_id"
    DOC_TYPE_PROOF_ADDRESS = "proof_of_address"
    DOC_TYPE_BUSINESS_LICENSE = "business_license"
    DOC_TYPE_TAX_ID = "tax_identification"

    # KYC valid for 1 year
    KYC_VALIDITY_DAYS = 365

    def __init__(self):
        self.s3_client = None  # Initialize S3 if using cloud storage
        self.verification_rules = self._load_verification_rules()

    def _load_verification_rules(self) -> Dict[str, Any]:
        """Load KYC verification rules from config."""
        return {
            "seller": {
                "required_docs": [
                    self.DOC_TYPE_ID,
                    self.DOC_TYPE_PROOF_ADDRESS,
                    self.DOC_TYPE_BUSINESS_LICENSE,
                    self.DOC_TYPE_TAX_ID,
                ],
                "age_min": 18,
                "business_verification": True,
            },
            "investor": {
                "required_docs": [
                    self.DOC_TYPE_ID,
                    self.DOC_TYPE_PROOF_ADDRESS,
                ],
                "age_min": 18,
                "business_verification": False,
            },
        }

    def initiate_kyc(
        self,
        db: Session,
        user_id: int,
        user_role: str,
    ) -> Dict[str, Any]:
        """
        Initiate KYC process for a user.
        Returns required documents list.
        """
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                return {"success": False, "error": "User not found"}

            # Check if KYC already exists
            existing_kyc = db.query(KYCVerification).filter(
                KYCVerification.user_id == user_id,
                KYCVerification.status == self.STATUS_APPROVED,
            ).first()

            if existing_kyc:
                # Check if expired
                if existing_kyc.approved_at + timedelta(days=self.KYC_VALIDITY_DAYS) > datetime.utcnow():
                    return {
                        "success": True,
                        "message": "KYC already approved",
                        "kyc_id": existing_kyc.id,
                        "status": self.STATUS_APPROVED,
                        "expires_at": (existing_kyc.approved_at + timedelta(days=self.KYC_VALIDITY_DAYS)).isoformat(),
                    }
                else:
                    existing_kyc.status = self.STATUS_EXPIRED
                    db.commit()

            # Create new KYC record
            rules = self.verification_rules.get(user_role, {})
            required_docs = rules.get("required_docs", [])

            kyc = KYCVerification(
                user_id=user_id,
                status=self.STATUS_PENDING,
                required_documents=json.dumps(required_docs),
                submitted_documents=json.dumps([]),
                verification_notes="KYC process initiated",
            )

            db.add(kyc)
            db.commit()
            db.refresh(kyc)

            logger.info(f"KYC initiated for user {user_id}: {kyc.id}")

            return {
                "success": True,
                "kyc_id": kyc.id,
                "status": self.STATUS_PENDING,
                "required_documents": required_docs,
                "message": "Please upload required documents",
            }

        except Exception as e:
            logger.error(f"Error initiating KYC: {e}", exc_info=True)
            db.rollback()
            return {"success": False, "error": str(e)}

    def submit_document(
        self,
        db: Session,
        kyc_id: int,
        user_id: int,
        doc_type: str,
        doc_url: str,  # S3 URL or local path
        file_name: str,
    ) -> Dict[str, Any]:
        """
        Submit a KYC document.
        """
        try:
            kyc = db.query(KYCVerification).filter(
                KYCVerification.id == kyc_id,
                KYCVerification.user_id == user_id,
            ).first()

            if not kyc:
                return {"success": False, "error": "KYC record not found"}

            if kyc.status != self.STATUS_PENDING:
                return {"success": False, "error": "KYC already processed"}

            # Add document to submitted list
            submitted = json.loads(kyc.submitted_documents or "[]")
            submitted.append({
                "type": doc_type,
                "url": doc_url,
                "file_name": file_name,
                "submitted_at": datetime.utcnow().isoformat(),
            })

            kyc.submitted_documents = json.dumps(submitted)

            # Check if all required docs submitted
            required = json.loads(kyc.required_documents or "[]")
            submitted_types = {d["type"] for d in submitted}
            required_types = set(required)

            if required_types.issubset(submitted_types):
                kyc.status = self.STATUS_REVIEW
                kyc.verification_notes = "All documents submitted, awaiting review"

            db.commit()

            logger.info(f"Document {doc_type} submitted for KYC {kyc_id}")

            return {
                "success": True,
                "kyc_id": kyc_id,
                "status": kyc.status,
                "documents_submitted": len(submitted),
                "documents_required": len(required),
                "all_submitted": required_types.issubset(submitted_types),
            }

        except Exception as e:
            logger.error(f"Error submitting document: {e}", exc_info=True)
            db.rollback()
            return {"success": False, "error": str(e)}

    def verify_kyc(
        self,
        db: Session,
        kyc_id: int,
        approved: bool,
        admin_notes: str = "",
    ) -> Dict[str, Any]:
        """
        Verify/approve or reject KYC (admin operation).
        """
        try:
            kyc = db.query(KYCVerification).filter(KYCVerification.id == kyc_id).first()

            if not kyc:
                return {"success": False, "error": "KYC record not found"}

            if kyc.status not in [self.STATUS_PENDING, self.STATUS_REVIEW]:
                return {"success": False, "error": "KYC not in verifiable status"}

            if approved:
                kyc.status = self.STATUS_APPROVED
                kyc.approved_at = datetime.utcnow()
                kyc.verification_notes = admin_notes

                # Update user
                user = db.query(User).filter(User.id == kyc.user_id).first()
                if user:
                    user.kyc_verified = True
                    user.kyc_verified_at = datetime.utcnow()

                logger.info(f"KYC {kyc_id} approved for user {kyc.user_id}")
            else:
                kyc.status = self.STATUS_REJECTED
                kyc.verification_notes = admin_notes

                logger.info(f"KYC {kyc_id} rejected for user {kyc.user_id}: {admin_notes}")

            db.commit()

            return {
                "success": True,
                "kyc_id": kyc_id,
                "status": kyc.status,
                "verified": approved,
                "message": f"KYC {'approved' if approved else 'rejected'}",
            }

        except Exception as e:
            logger.error(f"Error verifying KYC: {e}", exc_info=True)
            db.rollback()
            return {"success": False, "error": str(e)}

    def is_user_kyc_verified(self, db: Session, user_id: int) -> bool:
        """Check if user has valid KYC approval."""
        kyc = db.query(KYCVerification).filter(
            KYCVerification.user_id == user_id,
            KYCVerification.status == self.STATUS_APPROVED,
        ).order_by(KYCVerification.approved_at.desc()).first()

        if not kyc:
            return False

        # Check if expired
        if kyc.approved_at + timedelta(days=self.KYC_VALIDITY_DAYS) < datetime.utcnow():
            return False

        return True

    def get_kyc_status(self, db: Session, user_id: int) -> Dict[str, Any]:
        """Get KYC status for user."""
        kyc = db.query(KYCVerification).filter(
            KYCVerification.user_id == user_id
        ).order_by(KYCVerification.created_at.desc()).first()

        if not kyc:
            return {"status": "not_initiated", "verified": False}

        is_verified = self.is_user_kyc_verified(db, user_id)

        return {
            "kyc_id": kyc.id,
            "status": kyc.status,
            "verified": is_verified,
            "approved_at": kyc.approved_at.isoformat() if kyc.approved_at else None,
            "expires_at": (
                (kyc.approved_at + timedelta(days=self.KYC_VALIDITY_DAYS)).isoformat()
                if kyc.approved_at else None
            ),
            "documents_submitted": len(json.loads(kyc.submitted_documents or "[]")),
            "documents_required": len(json.loads(kyc.required_documents or "[]")),
        }


_kyc_service: Optional[KYCService] = None


def get_kyc_service() -> KYCService:
    """Get or initialize KYC service."""
    global _kyc_service
    if _kyc_service is None:
        _kyc_service = KYCService()
    return _kyc_service