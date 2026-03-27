import logging
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from ..database import SessionLocal
from ..models import Invoice, User, EscrowRecord
from ..auth.dependencies import get_current_user
from ..services.escrow_service import get_escrow_service
from ..services.blockchain import get_blockchain_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/settlements", tags=["settlements"])

escrow_service = get_escrow_service()
blockchain_service = get_blockchain_service()


# Schemas

class ConfirmPaymentRequest(BaseModel):
    """Confirm invoice payment received."""
    invoice_id: int
    escrow_id: int
    notes: Optional[str] = None


class SettlementResponse(BaseModel):
    id: int
    invoice_id: int
    escrow_id: Optional[int]
    amount: float
    status: str
    released_at: Optional[str]
    tx_hash: Optional[str]

    class Config:
        from_attributes = True


# Endpoints

@router.post("/confirm-payment", status_code=200)
async def confirm_payment(
    payload: ConfirmPaymentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(lambda: SessionLocal()),
):
    """
    Confirm invoice payment received.
    - Marks invoice as settled in DB
    - Burns invoice shares (partial or full)
    - Releases escrowed funds to seller
    """
    # invoice
    invoice = db.query(Invoice).filter(Invoice.id == payload.invoice_id).first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only seller can confirm payment")

    # escrow
    escrow = db.query(EscrowRecord).filter(EscrowRecord.id == payload.escrow_id).first()

    if not escrow:
        raise HTTPException(status_code=404, detail="Escrow not found")

    if escrow.invoice_id != invoice.id:
        raise HTTPException(status_code=400, detail="Escrow mismatch")

    if escrow.status != "held":
        raise HTTPException(status_code=400, detail="Escrow not in held status")

    try:
        # Mark invoice as settled
        invoice.status = "settled"
        invoice.escrow_status = "released"
        invoice.escrow_released_at = datetime.utcnow()

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

        db.commit()

        logger.info(
            f"Payment confirmed for invoice {invoice.id} by seller {current_user.id}. "
            f"Escrow {escrow.id} released."
        )

        return {
            "success": True,
            "invoice_id": invoice.id,
            "escrow_id": escrow.id,
            "tx_hash": escrow.tx_hash,
            "message": "Payment confirmed."}