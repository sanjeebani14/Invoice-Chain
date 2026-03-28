from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import require_sme
from app.database import get_db
from app.models import CreditHistory, Invoice, User
from app.services.risk_scoring.risk_service import RiskScoringEngine

router = APIRouter(prefix="/sme/dashboard", tags=["SME Dashboard"])
risk_engine = RiskScoringEngine()


def _baseline_discount_rate(risk_level: str) -> float:
    level = (risk_level or "").upper()
    if level == "LOW":
        return 2.5
    if level == "MEDIUM":
        return 3.4
    return 5.2


def _compute_credit_limit(total_capital_raised: float, composite_score: int) -> float:
    raised = max(0.0, float(total_capital_raised))
    score_factor = max(0.35, 1.0 - (float(composite_score) / 110.0))
    base = 300000.0
    dynamic = raised * 0.35
    return round((base + dynamic) * score_factor, 0)


def _status_to_message(invoice: Invoice) -> tuple[str, str]:
    invoice_no = invoice.invoice_number or f"#{invoice.id}"
    status = (invoice.status or "").lower()

    if status in {"funded", "active"}:
        return (f"Invoice {invoice_no} funded by investor.", "success")
    if status == "repayment_processing":
        return (f"Repayment submitted for invoice {invoice_no}. Awaiting admin confirmation.", "warning")
    if status == "minted":
        return (f"Invoice {invoice_no} minted as NFT.", "success")
    if status == "flagged":
        return (f"Invoice {invoice_no} requires manual correction.", "warning")
    if status == "listed":
        return (f"Invoice {invoice_no} listed on marketplace.", "neutral")
    if status == "settled":
        return (f"Invoice {invoice_no} marked as settled.", "success")
    return (
        f"Invoice {invoice_no} moved to {invoice.status or 'processing'}.",
        "neutral",
    )


@router.get("/summary")
def get_sme_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sme),
):
    invoices = (
        db.query(Invoice)
        .filter(Invoice.seller_id == current_user.id)
        .order_by(Invoice.created_at.desc())
        .all()
    )

    if (
        db.query(CreditHistory)
        .filter(CreditHistory.seller_id == current_user.id)
        .first()
        is None
    ):
        db.add(CreditHistory(seller_id=current_user.id, composite_score=0))
        db.commit()

    score_payload = risk_engine.calculate_score(db=db, seller_id=current_user.id)
    composite_score = int(score_payload.get("composite_score", 0))
    risk_level = str(score_payload.get("risk_level", "Medium")).upper()

    total_capital_raised = sum(
        float(inv.ask_price or inv.amount or 0.0)
        for inv in invoices
        if (inv.status or "").lower()
        in {"funded", "active", "repayment_processing", "settled"}
    )
    pending_approvals = sum(
        1
        for inv in invoices
        if (inv.status or "").lower() in {"pending", "pending_review", "flagged"}
    )
    outstanding_invoices = sum(
        1
        for inv in invoices
        if (inv.status or "").lower() not in {"settled", "rejected"}
    )

    available_credit_limit = _compute_credit_limit(
        total_capital_raised=total_capital_raised,
        composite_score=composite_score,
    )

    return {
        "metrics": {
            "total_capital_raised": round(total_capital_raised, 2),
            "pending_approvals": pending_approvals,
            "outstanding_invoices": outstanding_invoices,
            "available_credit_limit": available_credit_limit,
        },
        "trust": {
            "risk_tier": risk_level,
            "composite_score": composite_score,
            "baseline_discount_rate": _baseline_discount_rate(risk_level),
        },
        "as_of": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/activity")
def get_sme_dashboard_activity(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sme),
):
    invoices = (
        db.query(Invoice)
        .filter(Invoice.seller_id == current_user.id)
        .order_by(Invoice.created_at.desc())
        .limit(limit)
        .all()
    )

    items = []
    for inv in invoices:
        message, tone = _status_to_message(inv)
        items.append(
            {
                "id": f"inv-{inv.id}-{inv.status}",
                "invoice_id": inv.id,
                "message": message,
                "tone": tone,
                "at": (
                    (inv.updated_at or inv.created_at).isoformat()
                    if (inv.updated_at or inv.created_at)
                    else None
                ),
                "status": inv.status,
            }
        )

    return {"items": items}
