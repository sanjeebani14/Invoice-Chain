"""
Admin Statistics Router

Provides platform-level analytics and statistics endpoints.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from datetime import datetime, date
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import Optional, List

from ..database import get_db
from ..models import (
    User,
    UserRole,
    Invoice,
    KycSubmission,
    FraudFlag,
    CreditHistory,
    BlockchainSyncState,
)
from ..auth.dependencies import get_current_admin
from ..services.platform_stats import PlatformStatsService

router = APIRouter()


def _parse_due_date(raw: str | None) -> date | None:
    if not raw:
        return None
    value = raw.strip()
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        pass
    for fmt in ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y"]:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


@router.get("/overview")
def get_admin_overview(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    _ = current_admin
    pending_invoices = (
        db.query(func.count(Invoice.id))
        .filter(Invoice.status.in_(["pending", "pending_review", "flagged"]))
        .scalar()
        or 0
    )
    funded_live = db.query(func.count(Invoice.id)).filter(Invoice.status.in_(["funded", "active"])).scalar() or 0
    settled_count = db.query(func.count(Invoice.id)).filter(Invoice.status == "settled").scalar() or 0
    pending_kyc = db.query(func.count(KycSubmission.id)).filter(KycSubmission.status == "pending").scalar() or 0
    unresolved_fraud = db.query(func.count(FraudFlag.id)).filter(FraudFlag.is_resolved == False).scalar() or 0

    investors_count = db.query(func.count(User.id)).filter(User.role == "investor").scalar() or 0

    # Keep this aligned with Seller Explorer and ensure rows map to real seller users.
    sellers_count = (
        db.query(func.count(func.distinct(CreditHistory.seller_id)))
        .join(User, User.id == CreditHistory.seller_id)
        .filter(CreditHistory.seller_id.isnot(None))
        .filter(User.role.in_([UserRole.SELLER, UserRole.SME]))
        .scalar()
        or 0
    )

    live_invoices = db.query(Invoice).filter(Invoice.status.in_(["funded", "active"])).all()
    today = datetime.utcnow().date()
    overdue_live = 0
    due_today = 0
    for inv in live_invoices:
        due = _parse_due_date(inv.due_date)
        if not due:
            continue
        if due < today:
            overdue_live += 1
        elif due == today:
            due_today += 1

    actionable_insights: List[dict] = []
    if pending_invoices > 0:
        actionable_insights.append(
            {
                "type": "operations",
                "priority": "high",
                "title": "Pending invoice approvals",
                "description": f"{pending_invoices} invoices are waiting for review before marketplace listing.",
                "cta_path": "/admin/pending-invoices",
            }
        )
    if pending_kyc > 0:
        actionable_insights.append(
            {
                "type": "operations",
                "priority": "medium",
                "title": "KYC backlog",
                "description": f"{pending_kyc} KYC submissions need verification.",
                "cta_path": "/admin/kyc",
            }
        )
    if overdue_live > 0:
        actionable_insights.append(
            {
                "type": "settlement",
                "priority": "high",
                "title": "Overdue settlements",
                "description": f"{overdue_live} funded invoices are past due and still unsettled.",
                "cta_path": "/admin/settlement-tracker",
            }
        )
    if unresolved_fraud > 0:
        actionable_insights.append(
            {
                "type": "risk",
                "priority": "high",
                "title": "Fraud queue requires attention",
                "description": f"{unresolved_fraud} unresolved fraud alerts are in review queue.",
                "cta_path": "/admin/fraud-queue",
            }
        )

    return {
        "kpis": {
            "pending_invoices": int(pending_invoices),
            "funded_live": int(funded_live),
            "settled_count": int(settled_count),
            "pending_kyc": int(pending_kyc),
            "unresolved_fraud": int(unresolved_fraud),
            "overdue_live": int(overdue_live),
            "due_today": int(due_today),
            "investors_count": int(investors_count),
            "sellers_count": int(sellers_count),
        },
        "actionable_insights": actionable_insights,
    }


@router.get("/summary")
def get_platform_summary(
    period: Optional[str] = Query(None, description="Period in format YYYY-MM or YYYY-Q1 or YYYY"),
    period_type: Optional[str] = Query("monthly", description="monthly, quarterly, or yearly"),
    use_cache: bool = Query(True, description="Use cached results if available"),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """
    Get aggregated platform statistics for a specific period.
    
    Returns:
    - total_funded_volume: Sum of ask_price for funded invoices (GMV)
    - repayment_metrics: Repayment rate, default rate, counts
    - platform_revenue: Total fees collected
    - average_invoice_yield: Average return on invested amount
    - risk_distribution: High/medium/low risk invoice counts
    - sector_exposure: Volume breakdown by sector
    - user_metrics: Active sellers and investors count
    """
    try:
        stats = PlatformStatsService.aggregate_stats(
            db, period=period, period_type=period_type, use_cache=use_cache
        )
        return stats
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error calculating statistics: {str(e)}"
        )


@router.get("/timeseries")
def get_platform_timeseries(
    months: int = Query(12, ge=1, le=60, description="Number of months to retrieve"),
    use_cache: bool = Query(True, description="Use cached results if available"),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """
    Get time-series statistics for the last N months.
    
    Returns a list of monthly aggregations showing:
    - Growth trends in funded volume
    - Repayment rate trends
    - Revenue trends
    - Risk distribution changes
    """
    try:
        timeseries = PlatformStatsService.get_time_series(
            db, months=months, use_cache=use_cache
        )
        return {"months": months, "data": timeseries}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error calculating time series: {str(e)}"
        )


@router.post("/refresh")
def refresh_platform_stats(
    period: Optional[str] = Query(None, description="Specific period to refresh or None for current month"),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """
    Manually refresh platform statistics.
    Recalculates and persists stats to the database.
    
    Useful after bulk data imports or for forcing recalculation.
    """
    try:
        PlatformStatsService.persist_stats_to_db(db, period=period)
        return {
            "status": "success",
            "message": f"Platform statistics refreshed for period: {period or 'current'}",
            "period": period
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error refreshing statistics: {str(e)}"
        )


@router.get("/health-metrics")
def get_health_metrics(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """
    Get real-time platform health metrics for dashboard display.
    
    Key metrics:
    - GMV: Total funded volume
    - Repayment Rate: % of invoices successfully repaid
    - Default Rate: % of invoices defaulted
    - Active Users: Sellers and investors
    - Avg Risk Score: Average seller credit rating
    """
    try:
        stats = PlatformStatsService.aggregate_stats(db, use_cache=False)
        
        # Curate for dashboard display
        health_metrics = {
            "gmv": stats["total_funded_volume"],
            "repayment_rate": stats["repayment_metrics"]["repayment_rate"],
            "default_rate": stats["repayment_metrics"]["default_rate"],
            "platform_revenue": stats["platform_revenue"],
            "active_sellers": stats["user_metrics"]["active_sellers"],
            "active_investors": stats["user_metrics"]["active_investors"],
            "avg_risk_score": stats["risk_distribution"]["avg_score"],
            "avg_invoice_yield": stats["average_invoice_yield"],
            "high_risk_invoices": stats["risk_distribution"]["high"],
            "top_sector": stats["sector_exposure"]["top_sector"],
            "sector_concentration": stats["sector_exposure"]["concentration_ratio"],
        }
        
        return health_metrics
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving health metrics: {str(e)}"
        )


@router.get("/blockchain-sync")
def get_blockchain_sync_status(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    _ = current_admin
    states = (
        db.query(BlockchainSyncState)
        .order_by(BlockchainSyncState.updated_at.desc())
        .all()
    )
    return {
        "count": len(states),
        "items": [
            {
                "contract_address": item.contract_address,
                "last_synced_block": int(item.last_synced_block or 0),
                "last_synced_at": item.last_synced_at.isoformat() if item.last_synced_at else None,
                "last_error": item.last_error,
                "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            }
            for item in states
        ],
    }


@router.get("/risk-heatmap")
def get_risk_heatmap(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """
    Get portfolio risk heatmap data.
    
    Shows:
    - Exposure by sector and default rate per sector
    - Concentration risk (top sectors)
    - Risk distribution across portfolio
    """
    try:
        stats = PlatformStatsService.aggregate_stats(db, use_cache=True)
        sector_exp = stats["sector_exposure"]
        risk_dist = stats["risk_distribution"]
        
        heatmap_data = {
            "sector_exposure": sector_exp["sectors"],
            "top_sector": sector_exp["top_sector"],
            "concentration_ratio": sector_exp["concentration_ratio"],
            "risk_levels": {
                "high": risk_dist["high"],
                "medium": risk_dist["medium"],
                "low": risk_dist["low"],
            },
            "avg_score": risk_dist["avg_score"],
        }
        
        return heatmap_data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating risk heatmap: {str(e)}"
        )
