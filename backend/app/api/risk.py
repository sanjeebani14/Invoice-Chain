from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from app.database import engine, get_db
from app import models
from app.services.risk_scoring.risk_service import RiskScoringEngine
from app.services.fraud_anomaly import InvoiceAnomalyService
from pydantic import BaseModel

router = APIRouter()
# Initialize the engine once
risk_engine = RiskScoringEngine()
anomaly_explainer = InvoiceAnomalyService()


def _ensure_credit_history_schema_compatibility() -> None:
    """Add newly introduced credit_history columns to existing DBs without migrations."""
    inspector = inspect(engine)
    if "credit_history" not in inspector.get_table_names():
        return

    existing = {c["name"] for c in inspector.get_columns("credit_history")}
    statements: list[str] = []

    if "employment_years" not in existing:
        statements.append("ALTER TABLE credit_history ADD COLUMN employment_years DOUBLE PRECISION")
    if "debt_to_income" not in existing:
        statements.append("ALTER TABLE credit_history ADD COLUMN debt_to_income DOUBLE PRECISION")
    if "core_enterprise_rating" not in existing:
        statements.append("ALTER TABLE credit_history ADD COLUMN core_enterprise_rating INTEGER")
    if "transaction_stability" not in existing:
        statements.append("ALTER TABLE credit_history ADD COLUMN transaction_stability DOUBLE PRECISION")
    if "logistics_consistency" not in existing:
        statements.append("ALTER TABLE credit_history ADD COLUMN logistics_consistency DOUBLE PRECISION")
    if "esg_score" not in existing:
        statements.append("ALTER TABLE credit_history ADD COLUMN esg_score DOUBLE PRECISION")
    if "risk_contributors" not in existing:
        statements.append("ALTER TABLE credit_history ADD COLUMN risk_contributors JSON")

    if not statements:
        return

    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


_ensure_credit_history_schema_compatibility()


def _ensure_fraud_flags_schema_compatibility() -> None:
    """Add newly introduced columns to existing DBs without migrations."""
    inspector = inspect(engine)
    if "fraud_flags" not in inspector.get_table_names():
        return

    existing = {c["name"] for c in inspector.get_columns("fraud_flags")}
    statements: list[str] = []

    if "seller_id" not in existing:
        statements.append("ALTER TABLE fraud_flags ADD COLUMN seller_id INTEGER")
    if "resolved_by" not in existing:
        statements.append("ALTER TABLE fraud_flags ADD COLUMN resolved_by INTEGER")

    if not statements:
        return

    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


_ensure_fraud_flags_schema_compatibility()


def _ensure_fraud_queue_suppressions_schema() -> None:
    """Create a table that remembers sellers removed from auto-queue."""
    create_stmt = """
    CREATE TABLE IF NOT EXISTS fraud_queue_suppressions (
        seller_id INTEGER PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )
    """
    with engine.begin() as conn:
        conn.execute(text(create_stmt))


_ensure_fraud_queue_suppressions_schema()


def _to_risk_level(score: int) -> str:
    if score > 70:
        return "HIGH"
    if score > 40:
        return "MEDIUM"
    return "LOW"


def _severity_from_score(score: int) -> str:
    if score > 70:
        return "HIGH"
    if score > 40:
        return "MEDIUM"
    return "LOW"


def _canonical_credit_history_by_seller(
    db: Session,
    seller_ids: set[int] | None = None,
) -> dict[int, models.CreditHistory]:
    query = db.query(models.CreditHistory).order_by(
        models.CreditHistory.seller_id.asc(),
        models.CreditHistory.id.asc(),
    )
    if seller_ids:
        query = query.filter(models.CreditHistory.seller_id.in_(seller_ids))

    records = query.all()
    canonical: dict[int, models.CreditHistory] = {}
    for rec in records:
        if rec.seller_id is None:
            continue
        sid = int(rec.seller_id)
        if sid not in canonical:
            canonical[sid] = rec
    return canonical


def _get_suppressed_seller_ids(db: Session) -> set[int]:
    rows = db.execute(text("SELECT seller_id FROM fraud_queue_suppressions"))
    return {int(row[0]) for row in rows if row[0] is not None}


def _to_iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None

@router.get("/score/{seller_id}")
def get_score(seller_id: int, db: Session = Depends(get_db)):
    # 1. Get the seller record
    seller = (
        db.query(models.CreditHistory)
        .filter(models.CreditHistory.seller_id == seller_id)
        .first()
    )

    if not seller:
        raise HTTPException(status_code=404, detail="Seller ID not found in database.")

    # 2. Use the persisted composite_score so the value on the
    # seller list and the detail page stays consistent.
    composite_score = int(seller.composite_score or 0)
    risk_level = _to_risk_level(composite_score)

    breakdown = {
        "financial_risk": int(seller.payment_history_score or 0),
        "relationship_stability": float(seller.transaction_stability or 0.0),
        "buyer_quality": int(seller.core_enterprise_rating or 0),
        "logistics_quality": float(seller.logistics_consistency or 0.0),
        "esg_score": float(seller.esg_score or 0.0),
    }

    return {
        "seller_id": seller_id,
        "composite_score": composite_score,
        "risk_level": risk_level,
        "credit_score": seller.payment_history_score,
        "debt_to_income": seller.debt_to_income,
        "employment_years": seller.employment_years,
        # Simple interpretable breakdown derived from CreditHistory.
        "insights": [],
        "breakdown": breakdown,
        "risk_contributors": seller.risk_contributors,
        "last_updated": _to_iso(seller.last_updated),
    }


@router.get("/sellers")
def get_sellers(db: Session = Depends(get_db)):
    # Deduplicate on seller_id in case historical data has multiple
    # CreditHistory rows per seller.
    records = (
        db.query(models.CreditHistory)
        .order_by(models.CreditHistory.seller_id.asc(), models.CreditHistory.id.asc())
        .all()
    )

    seen: dict[int, models.CreditHistory] = {}
    for rec in records:
        if rec.seller_id is None:
            continue
        # Keep the first record per seller_id (or adjust rule as needed)
        if rec.seller_id not in seen:
            seen[rec.seller_id] = rec

    sellers = list(seen.values())

    return [
        {
            "seller_id": s.seller_id,
            "composite_score": s.composite_score or 0,
            "risk_level": _to_risk_level(s.composite_score or 0),
            "credit_score": s.payment_history_score,
            "annual_income": None,
            "loan_amount": None,
            "debt_to_income": s.debt_to_income,
            "employment_years": s.employment_years,
            "last_updated": _to_iso(s.last_updated),
        }
        for s in sellers
    ]


@router.get("/admin/risk-metrics")
def get_risk_metrics(db: Session = Depends(get_db)):
    # Use one record per seller_id to keep counts consistent with /sellers
    records = (
        db.query(models.CreditHistory)
        .order_by(models.CreditHistory.seller_id.asc(), models.CreditHistory.id.asc())
        .all()
    )

    seen: dict[int, models.CreditHistory] = {}
    for rec in records:
        if rec.seller_id is None:
            continue
        if rec.seller_id not in seen:
            seen[rec.seller_id] = rec

    sellers = list(seen.values())
    scores = [s.composite_score or 0 for s in sellers]

    total_sellers = len(sellers)
    high_risk = sum(1 for s in scores if s > 70)
    medium_risk = sum(1 for s in scores if 40 < s <= 70)
    low_risk = sum(1 for s in scores if s <= 40)
    avg_composite_score = round(sum(scores) / total_sellers, 1) if total_sellers else 0.0

    bins = [0] * 10
    for score in scores:
        idx = min(score // 10, 9)
        bins[idx] += 1
    risk_distribution = [
        {"score_range": f"{i * 10}-{i * 10 + 9 if i < 9 else 100}", "count": bins[i]}
        for i in range(10)
    ]

    top_high_risk_sellers = [
        {"seller_id": s.seller_id, "score": s.composite_score or 0}
        for s in sorted(sellers, key=lambda item: item.composite_score or 0, reverse=True)[:10]
    ]

    risk_level_breakdown = [
        {"level": "LOW", "count": low_risk},
        {"level": "MEDIUM", "count": medium_risk},
        {"level": "HIGH", "count": high_risk},
    ]

    today = datetime.now(timezone.utc).date()
    try:
        flags = db.query(models.FraudFlag).all()
    except Exception:
        flags = []
    alerts_by_day = defaultdict(int)
    for f in flags:
        created_at = getattr(f, "created_at", None)
        if created_at and hasattr(created_at, "date"):
            alerts_by_day[created_at.date()] += 1
    fraud_alerts_over_time = [
        {
            "date": (today - timedelta(days=days_back)).isoformat(),
            "alerts": alerts_by_day.get(today - timedelta(days=days_back), 0),
        }
        for days_back in range(13, -1, -1)
    ]

    seller_risk_trends = []
    for months_back in range(5, -1, -1):
        month_date = (today.replace(day=1) - timedelta(days=months_back * 30))
        label = month_date.strftime("%b")
        seller_risk_trends.append(
            {
                "month": label,
                "high": high_risk,
                "medium": medium_risk,
                "low": low_risk,
            }
        )

    return {
        "total_sellers": total_sellers,
        "high_risk": high_risk,
        "medium_risk": medium_risk,
        "low_risk": low_risk,
        "avg_composite_score": avg_composite_score,
        "risk_distribution": risk_distribution,
        "fraud_alerts_over_time": fraud_alerts_over_time,
        "seller_risk_trends": seller_risk_trends,
        "top_high_risk_sellers": top_high_risk_sellers,
        "risk_level_breakdown": risk_level_breakdown,
    }


@router.get("/admin/fraud-queue")
def get_fraud_queue(seller_id: int | None = None, db: Session = Depends(get_db)):
    # Keep fraud queue in sync with current risk model: every unresolved HIGH-risk
    # seller should have at least one queue item.
    try:
        canonical = _canonical_credit_history_by_seller(db)
        suppressed_ids = _get_suppressed_seller_ids(db)
        high_risk_ids = {
            sid
            for sid, rec in canonical.items()
            if int(rec.composite_score or 0) > 70 and sid not in suppressed_ids
        }

        existing_open_ids = {
            int(flag.seller_id)
            for flag in db.query(models.FraudFlag)
            .filter(models.FraudFlag.is_resolved.is_(False))
            .all()
            if flag.seller_id is not None
        }

        reviewed_ids = {
            int(flag.seller_id)
            for flag in db.query(models.FraudFlag)
            .filter(models.FraudFlag.is_resolved.is_(True))
            .all()
            if flag.seller_id is not None
        }

        # Do not auto-requeue sellers already reviewed by admin.
        missing_ids = high_risk_ids - existing_open_ids - reviewed_ids
        if missing_ids:
            for sid in missing_ids:
                score = int(canonical[sid].composite_score or 0)
                db.add(
                    models.FraudFlag(
                        invoice_id=None,
                        seller_id=sid,
                        reason=f"Auto-queued: HIGH risk seller (composite score {score}).",
                        severity=_severity_from_score(score),
                        is_resolved=False,
                    )
                )
            db.commit()

        # If a seller already has a resolved flag, close any newer pending
        # auto-queued duplicates to avoid immediate reappearance after approval.
        resolved_by_seller = {
            int(flag.seller_id)
            for flag in db.query(models.FraudFlag)
            .filter(models.FraudFlag.is_resolved.is_(True))
            .all()
            if flag.seller_id is not None
        }
        duplicate_updated = False
        if resolved_by_seller:
            duplicate_pending = (
                db.query(models.FraudFlag)
                .filter(models.FraudFlag.is_resolved.is_(False))
                .filter(models.FraudFlag.reason.ilike("Auto-queued:%"))
                .filter(models.FraudFlag.seller_id.in_(resolved_by_seller))
                .all()
            )
            for flag in duplicate_pending:
                flag.is_resolved = True
                duplicate_updated = True
        if duplicate_updated:
            db.commit()

        # Resolve stale auto-queued flags if seller is no longer high risk.
        stale_auto_flags = (
            db.query(models.FraudFlag)
            .filter(models.FraudFlag.is_resolved.is_(False))
            .filter(models.FraudFlag.reason.ilike("Auto-queued:%"))
            .all()
        )
        stale_updated = False
        for flag in stale_auto_flags:
            sid = int(flag.seller_id) if flag.seller_id is not None else None
            if sid is None:
                continue
            if sid not in high_risk_ids:
                flag.is_resolved = True
                stale_updated = True
        if stale_updated:
            db.commit()

        query = db.query(models.FraudFlag)
        if seller_id is not None:
            query = query.filter(models.FraudFlag.seller_id == seller_id)
        flags = query.order_by(models.FraudFlag.created_at.desc()).all()
    except Exception:
        db.rollback()
        flags = []

    seller_ids = {f.seller_id for f in flags if f.seller_id is not None}
    score_by_seller: dict[int, int] = {}
    if seller_ids:
        canonical = _canonical_credit_history_by_seller(
            db,
            {int(sid) for sid in seller_ids if sid is not None},
        )
        score_by_seller = {
            sid: int(rec.composite_score or 0)
            for sid, rec in canonical.items()
        }

    result = []
    for f in flags:
        score = score_by_seller.get(
            int(f.seller_id) if f.seller_id is not None else -1,
            90 if f.severity == "HIGH" else 65 if f.severity == "MEDIUM" else 35,
        )
        result.append(
            {
                "id": f.id,
                "invoice_id": f.invoice_id,
                "seller_id": f.seller_id,
                "risk_score": score,
                # Keep queue severity consistent with the score shown in queue.
                "severity": _severity_from_score(score),
                "fraud_reason": f.reason,
                "created_at": _to_iso(f.created_at),
                "status": "Resolved" if f.is_resolved else "Pending",
            }
        )

    return result


class ManualFraudFlagRequest(BaseModel):
    seller_id: int
    invoice_id: int | None = None
    reason: str
    severity: str = "HIGH"  # "HIGH", "MEDIUM", "LOW"


@router.post("/admin/manual-fraud-flag")
def manual_fraud_flag(
    payload: ManualFraudFlagRequest,
    db: Session = Depends(get_db),
):
    cleaned_reason = payload.reason.strip()
    if not cleaned_reason:
        raise HTTPException(status_code=400, detail="Reason is required")

    flag = models.FraudFlag(
        invoice_id=payload.invoice_id,
        seller_id=payload.seller_id,
        reason=cleaned_reason,
        severity=payload.severity,
        is_resolved=False,
    )
    db.add(flag)
    db.commit()
    db.refresh(flag)

    return {
        "id": flag.id,
        "invoice_id": flag.invoice_id,
        "seller_id": flag.seller_id,
        "reason": flag.reason,
        "severity": flag.severity,
        "status": "Resolved" if flag.is_resolved else "Pending",
        "created_at": _to_iso(flag.created_at),
    }


@router.get("/admin/invoice-anomaly-explain/{invoice_id}")
def explain_invoice_anomaly(invoice_id: int, db: Session = Depends(get_db)):
    """
    Return a structured explanation for why a given invoice was or would be
    flagged as anomalous, including engineered feature values and reason text.
    """
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    result = anomaly_explainer.evaluate_invoice(db, invoice)
    return {
        "invoice_id": invoice_id,
        "seller_id": invoice.seller_id,
        "status": invoice.status,
        "anomaly": result.to_dict(),
    }


@router.post("/admin/fraud-review/{flag_id}")
def review_fraud_item(flag_id: int, db: Session = Depends(get_db)):
    flag = db.query(models.FraudFlag).filter(models.FraudFlag.id == flag_id).first()
    if not flag:
        raise HTTPException(status_code=404, detail="Fraud flag not found")

    flag.is_resolved = True

    if flag.seller_id is not None:
        db.execute(
            text(
                """
                INSERT INTO fraud_queue_suppressions (seller_id)
                VALUES (:seller_id)
                ON CONFLICT (seller_id) DO NOTHING
                """
            ),
            {"seller_id": int(flag.seller_id)},
        )

    db.commit()

    return {"ok": True, "id": flag_id, "status": "Resolved"}


@router.delete("/admin/fraud-queue/{flag_id}")
def delete_fraud_item(flag_id: int, db: Session = Depends(get_db)):
    flag = db.query(models.FraudFlag).filter(models.FraudFlag.id == flag_id).first()
    if not flag:
        raise HTTPException(status_code=404, detail="Fraud flag not found")

    if not flag.is_resolved:
        raise HTTPException(
            status_code=400,
            detail="Only resolved fraud flags can be deleted",
        )

    db.delete(flag)
    db.commit()

    return {"ok": True, "id": flag_id, "deleted": True}