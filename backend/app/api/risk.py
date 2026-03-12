from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models
from app.services.risk_scoring.risk_service import RiskScoringEngine

router = APIRouter()
# Initialize the engine once
risk_engine = RiskScoringEngine()


def _to_risk_level(score: int) -> str:
    if score > 70:
        return "HIGH"
    if score > 40:
        return "MEDIUM"
    return "LOW"


def _to_iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None

@router.get("/score/{seller_id}")
def get_score(seller_id: int, db: Session = Depends(get_db)):
    # 1. Get the seller record
    seller = db.query(models.CreditHistory).filter(models.CreditHistory.seller_id == seller_id).first()
    
    if not seller:
        raise HTTPException(status_code=404, detail="Seller ID not found in database.")

    # 2. Call the engine (with dummy invoice data)
    dummy_invoice_data = {
        'annual_income': 50000,
        'loan_amount': 10000,
        'credit_score': 650,
        'employment_years': 5,
        'debt_to_income': 0.3
    }
    result = risk_engine.calculate_score(db, seller_id, dummy_invoice_data)
    
    # 3. Save the result to the DB
    seller.composite_score = result["composite_score"]
    db.commit()

    return {
        "seller_id": seller_id,
        "composite_score": result["composite_score"],
        "risk_level": _to_risk_level(result["composite_score"]),
        "credit_score": seller.payment_history_score,
        "annual_income": None,
        "loan_amount": None,
        "debt_to_income": None,
        "employment_years": None,
        "last_updated": _to_iso(seller.last_updated),
    }


@router.get("/sellers")
def get_sellers(db: Session = Depends(get_db)):
    sellers = (
        db.query(models.CreditHistory)
        .order_by(models.CreditHistory.seller_id.asc())
        .all()
    )

    return [
        {
            "seller_id": s.seller_id,
            "composite_score": s.composite_score or 0,
            "risk_level": _to_risk_level(s.composite_score or 0),
            "credit_score": s.payment_history_score,
            "annual_income": None,
            "loan_amount": None,
            "debt_to_income": None,
            "employment_years": None,
            "last_updated": _to_iso(s.last_updated),
        }
        for s in sellers
    ]


@router.get("/admin/risk-metrics")
def get_risk_metrics(db: Session = Depends(get_db)):
    sellers = db.query(models.CreditHistory).all()
    scores = [s.composite_score or 0 for s in sellers]

    total_sellers = len(scores)
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
def get_fraud_queue(db: Session = Depends(get_db)):
    try:
        flags = (
            db.query(models.FraudFlag)
            .order_by(models.FraudFlag.created_at.desc())
            .all()
        )
    except Exception:
        flags = []

    return [
        {
            "id": f.id,
            "seller_id": f.seller_id,
            "risk_score": 90 if f.severity == "HIGH" else 65 if f.severity == "MEDIUM" else 35,
            "fraud_reason": f.reason,
            "created_at": _to_iso(f.created_at),
            "status": "Resolved" if f.is_resolved else "Pending",
        }
        for f in flags
    ]


@router.post("/admin/fraud-review/{flag_id}")
def review_fraud_item(flag_id: int, db: Session = Depends(get_db)):
    flag = db.query(models.FraudFlag).filter(models.FraudFlag.id == flag_id).first()
    if not flag:
        raise HTTPException(status_code=404, detail="Fraud flag not found")

    flag.is_resolved = True
    db.commit()

    return {"ok": True, "id": flag_id, "status": "Resolved"}