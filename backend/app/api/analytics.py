from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..auth.dependencies import require_admin, require_investor
from ..database import get_db
from ..models import User
from ..services.portfolio_service import PortfolioAnalyticsService

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])


@router.get("/investor/summary")
def get_investor_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_investor),
):
    service = PortfolioAnalyticsService(db)
    payload = service.get_investor_summary(current_user.id)
    payload["concentration"] = service.get_investor_concentration(current_user.id)
    return payload


@router.get("/investor/cash-flow")
def get_investor_cash_flow(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_investor),
):
    service = PortfolioAnalyticsService(db)
    return service.get_investor_cash_flow(current_user.id)


@router.get("/platform/concentration")
def get_platform_concentration(
    threshold_pct: float = Query(20.0, ge=0.0, le=100.0),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    service = PortfolioAnalyticsService(db)
    return service.get_platform_concentration(threshold_pct=threshold_pct)
