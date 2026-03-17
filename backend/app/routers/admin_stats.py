"""
Admin Statistics Router

Provides platform-level analytics and statistics endpoints.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, List

from ..database import get_db
from ..models import User
from ..auth.dependencies import get_current_admin
from ..services.platform_stats import PlatformStatsService

router = APIRouter(prefix="/api/v1/admin/stats", tags=["Admin - Statistics"])


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
        stats = PlatformStatsService.aggregate_stats(db, use_cache=True)
        
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
