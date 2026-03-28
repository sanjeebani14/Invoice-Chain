import logging
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from ..database import SessionLocal
from ..models import Invoice, User, EscrowRecord, SettlementRecord, models
from ..auth.dependencies import get_current_user, require_seller, require_admin
from ..services.escrow_service import get_escrow_service
from ..services.blockchain import get_blockchain_service
# Import your existing risk scoring engine
from ..services.risk_scoring.risk_service import RiskScoringEngine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/settlements", tags=["settlements"])

escrow_service = get_escrow_service()
blockchain_service = get_blockchain_service()
risk_engine = RiskScoringEngine()  # Use your XGBoost model


# Schemas

class ConfirmPaymentRequest(BaseModel):
    """Confirm invoice payment received."""
    invoice_id: int
    escrow_id: int
    payment_date: Optional[str] = None
    payment_amount: Optional[float] = None
    notes: Optional[str] = None


class SettlementStatus(BaseModel):
    """Settlement status response."""
    invoice_id: int
    status: str
    escrow_id: Optional[int]
    escrow_status: Optional[str]
    escrow_amount: Optional[float]
    escrow_release_date: Optional[str]
    payment_confirmed: bool
    payment_confirmed_at: Optional[str]
    released_to_seller: bool
    released_at: Optional[str]
    tx_hash: Optional[str]
    risk_score: Optional[int]  #Include risk score


# Endpoints

@router.post("/confirm-payment", status_code=200)
async def confirm_payment(
    payload: ConfirmPaymentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(lambda: SessionLocal()),
):
    """
    Confirm invoice payment received.
    Triggers risk scoring update after settlement
    """
    # Get invoice
    invoice = db.query(Invoice).filter(Invoice.id == payload.invoice_id).first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only seller can confirm payment")

    # Get escrow
    escrow = db.query(EscrowRecord).filter(
        EscrowRecord.id == payload.escrow_id,
        EscrowRecord.invoice_id == invoice.id,
    ).first()

    if not escrow:
        raise HTTPException(status_code=404, detail="Escrow not found")

    if escrow.status != "held":
        raise HTTPException(status_code=400, detail="Escrow not in held status")

    try:
        # Mark invoice as settled
        invoice.status = "settled"
        invoice.settlement_confirmed_at = datetime.utcnow()
        invoice.settlement_notes = payload.notes

        # Release escrow (burns shares + transfers funds on-chain)
        if escrow.blockchain_escrow_id:
            result = escrow_service.release_escrow_on_settlement(
                db=db,
                escrow_id=escrow.id,
                blockchain_escrow_id=int(escrow.blockchain_escrow_id),
            )

            if not result["success"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"Settlement failed: {result.get('error', 'Unknown error')}",
                )

            escrow.tx_hash = result["tx_hash"]
            escrow.released_at = datetime.utcnow()

        # Create settlement record
        settlement = SettlementRecord(
            invoice_id=invoice.id,
            investor_id=None,
            seller_id=invoice.seller_id,
            amount=escrow.amount,
            status="confirmed",
            escrow_reference=escrow.blockchain_escrow_id,
            confirmed_by=current_user.id,
            confirmed_at=datetime.utcnow(),
            notes=payload.notes,
        )

        db.add(settlement)

        # Update seller risk score after settlement (on-time payment)
        logger.info(f"Recomputing risk score for seller {invoice.seller_id} after settlement")
        risk_result = risk_engine.calculate_score(db=db, seller_id=invoice.seller_id)
        risk_score = risk_result.get("composite_score", 50)

        db.commit()

        logger.info(
            f"Payment confirmed for invoice {invoice.id} by seller {current_user.id}. "
            f"Escrow {escrow.id} released. Risk score updated: {risk_score}"
        )

        return {
            "success": True,
            "message": "Payment confirmed and funds released",
            "invoice_id": invoice.id,
            "settlement_id": settlement.id,
            "escrow_id": escrow.id,
            "tx_hash": escrow.tx_hash,
            "risk_score_updated": risk_score,
        }

    except Exception as e:
        logger.error(f"Error confirming payment: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Settlement error: {str(e)}")


@router.get("/{invoice_id}/status", response_model=SettlementStatus)
async def get_settlement_status(
    invoice_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(lambda: SessionLocal()),
):
    """Get settlement status for an invoice with risk score."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Get escrow if exists
    escrow = db.query(EscrowRecord).filter(
        EscrowRecord.invoice_id == invoice.id
    ).first()

    # Get seller's current risk score
    risk_score = None
    if invoice.seller_id:
        risk_result = risk_engine.calculate_score(db=db, seller_id=invoice.seller_id)
        risk_score = risk_result.get("composite_score")

    return SettlementStatus(
        invoice_id=invoice.id,
        status=invoice.status,
        escrow_id=escrow.id if escrow else None,
        escrow_status=escrow.status if escrow else None,
        escrow_amount=escrow.amount if escrow else None,
        escrow_release_date=escrow.released_at.isoformat() if escrow and escrow.released_at else None,
        payment_confirmed=invoice.settlement_confirmed_at is not None,
        payment_confirmed_at=invoice.settlement_confirmed_at.isoformat() if invoice.settlement_confirmed_at else None,
        released_to_seller=escrow.status == "released" if escrow else False,
        released_at=escrow.released_at.isoformat() if escrow and escrow.released_at else None,
        tx_hash=escrow.tx_hash if escrow else None,
        risk_score=risk_score,  # Include in response
    )


@router.get("/seller/{seller_id}/risk-update")
async def get_seller_risk_after_settlement(
    seller_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(lambda: SessionLocal()),
):
    """
    Get seller's updated risk score after settlement.
    Demonstrates XGBoost model integration
    """
    # Recalculate risk score
    risk_result = risk_engine.calculate_score(db=db, seller_id=seller_id)

    return {
        "seller_id": seller_id,
        "composite_score": risk_result.get("composite_score"),
        "risk_level": risk_result.get("risk_level"),
        "scoring_method": risk_result.get("scoring_method"),
        "model_used": risk_result.get("model_used"),
        "fallback_used": risk_result.get("fallback_used"),
        "breakdown": risk_result.get("breakdown"),
        "insights": risk_result.get("insights"),
    }