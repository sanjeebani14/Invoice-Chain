"""
Platform Statistics Aggregation Service

Handles calculation of platform-level metrics with Redis caching.
Provides time-series aggregation for financial analytics.
"""

import json
import redis
from datetime import datetime, timedelta
from typing import Dict, Optional, List
from sqlalchemy import func, and_
from sqlalchemy.orm import Session

from ..models import Invoice, PlatformStats, User, UserRole, CreditHistory, FraudFlag

# Redis configuration
REDIS_HOST = "localhost"
REDIS_PORT = 6379
REDIS_DB = 0
CACHE_TTL = 3600  # 1 hour cache

try:
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        decode_responses=True,
        socket_connect_timeout=5
    )
    redis_client.ping()
except (redis.ConnectionError, Exception) as e:
    print(f"Warning: Redis connection failed: {e}. Caching will be disabled.")
    redis_client = None


class PlatformStatsService:
    """Service for aggregating platform-level statistics."""

    @staticmethod
    def _get_cache_key(cache_type: str, period: Optional[str] = None) -> str:
        """Generate Redis cache key."""
        if period:
            return f"platform_stats:{cache_type}:{period}"
        return f"platform_stats:{cache_type}"

    @staticmethod
    def _cache_set(key: str, value: Dict, ttl: int = CACHE_TTL) -> None:
        """Store data in Redis cache."""
        if not redis_client:
            return
        try:
            redis_client.setex(key, ttl, json.dumps(value))
        except Exception as e:
            print(f"Cache set error: {e}")

    @staticmethod
    def _cache_get(key: str) -> Optional[Dict]:
        """Retrieve data from Redis cache."""
        if not redis_client:
            return None
        try:
            data = redis_client.get(key)
            return json.loads(data) if data else None
        except Exception as e:
            print(f"Cache get error: {e}")
            return None

    @staticmethod
    def _get_period_string(date_obj: datetime, period_type: str = "monthly") -> str:
        """Generate period string for aggregation."""
        if period_type == "monthly":
            return date_obj.strftime("%Y-%m")
        elif period_type == "quarterly":
            q = (date_obj.month - 1) // 3 + 1
            return f"{date_obj.year}-Q{q}"
        elif period_type == "yearly":
            return str(date_obj.year)
        return "all-time"

    @staticmethod
    def calculate_total_funded_volume(db: Session) -> float:
        """Calculate the sum of ask_price for all funded invoices (GMV)."""
        result = db.query(func.sum(Invoice.ask_price)).filter(
            Invoice.status.in_(["funded", "active"])
        ).scalar()
        return float(result or 0.0)

    @staticmethod
    def calculate_repayment_metrics(
        db: Session, period_start: Optional[datetime] = None
    ) -> Dict[str, float]:
        """
        Calculate repayment and default rates.
        Returns dict with repayment_rate, default_rate, and counts.
        """
        query = db.query(Invoice).filter(Invoice.status.in_(["funded", "active", "settled", "defaulted"]))
        
        if period_start:
            query = query.filter(Invoice.created_at >= period_start)
        
        invoices = query.all()
        
        if not invoices:
            return {
                "total_funded": 0,
                "total_repaid": 0,
                "total_defaulted": 0,
                "repayment_rate": 0.0,
                "default_rate": 0.0,
            }
        
        # Count invoices by status
        funded_count = sum(1 for inv in invoices if inv.status in ["funded", "active"])
        repaid_count = sum(1 for inv in invoices if inv.status == "settled")
        defaulted_count = sum(1 for inv in invoices if inv.status == "defaulted")
        
        # Calculate rates
        repayment_rate = (repaid_count / funded_count * 100) if funded_count > 0 else 0.0
        default_rate = (defaulted_count / funded_count * 100) if funded_count > 0 else 0.0
        
        return {
            "total_funded": funded_count,
            "total_repaid": repaid_count,
            "total_defaulted": defaulted_count,
            "repayment_rate": round(repayment_rate, 2),
            "default_rate": round(default_rate, 2),
        }

    @staticmethod
    def calculate_platform_revenue(
        db: Session, fee_rate: float = 0.02, period_start: Optional[datetime] = None
    ) -> float:
        """
        Calculate total platform revenue from fees.
        Default: 2% of share_price for all transactions.
        """
        query = db.query(func.sum(Invoice.share_price)).filter(
            Invoice.status.in_(["funded", "active", "settled"])
        )
        
        if period_start:
            query = query.filter(Invoice.created_at >= period_start)
        
        total_share_price = query.scalar() or 0.0
        revenue = float(total_share_price) * fee_rate
        return round(revenue, 2)

    @staticmethod
    def calculate_average_yield(
        db: Session, period_start: Optional[datetime] = None
    ) -> float:
        """
        Calculate average invoice yield based on ask_price vs repayment amount.
        For settled invoices, yield = (amount - ask_price) / ask_price.
        """
        query = db.query(Invoice).filter(Invoice.status == "settled")
        
        if period_start:
            query = query.filter(Invoice.created_at >= period_start)
        
        settled_invoices = query.all()
        
        if not settled_invoices:
            return 0.0
        
        total_yield = 0.0
        for inv in settled_invoices:
            if inv.ask_price and inv.amount:
                yield_pct = ((inv.amount - inv.ask_price) / inv.ask_price) * 100
                total_yield += yield_pct
        
        avg_yield = total_yield / len(settled_invoices)
        return round(avg_yield, 2)

    @staticmethod
    def calculate_risk_distribution(db: Session, period_start: Optional[datetime] = None) -> Dict:
        """Calculate risk score distribution for invoices in the period."""
        query = db.query(Invoice).filter(Invoice.seller_id.isnot(None))
        
        if period_start:
            query = query.filter(Invoice.created_at >= period_start)
        
        invoices = query.all()
        seller_ids = [inv.seller_id for inv in invoices if inv.seller_id]
        
        if not seller_ids:
            return {"high": 0, "medium": 0, "low": 0, "avg_score": 0.0}
        
        # Get credit history for these sellers
        credit_histories = db.query(CreditHistory).filter(
            CreditHistory.seller_id.in_(seller_ids)
        ).all()
        
        scores = [ch.composite_score for ch in credit_histories]
        
        if not scores:
            return {"high": 0, "medium": 0, "low": 0, "avg_score": 0.0}
        
        high_risk = sum(1 for s in scores if s >= 70)
        medium_risk = sum(1 for s in scores if 40 <= s < 70)
        low_risk = sum(1 for s in scores if s < 40)
        avg_score = sum(scores) / len(scores)
        
        return {
            "high": high_risk,
            "medium": medium_risk,
            "low": low_risk,
            "avg_score": round(avg_score, 2),
        }

    @staticmethod
    def calculate_sector_exposure(db: Session, period_start: Optional[datetime] = None) -> Dict:
        """Calculate sector exposure and concentration."""
        query = db.query(Invoice).filter(
            Invoice.sector.isnot(None),
            Invoice.ask_price.isnot(None),
            Invoice.status.in_(["funded", "active"])
        )
        
        if period_start:
            query = query.filter(Invoice.created_at >= period_start)
        
        invoices = query.all()
        
        if not invoices:
            return {"sectors": {}, "top_sector": None, "concentration_ratio": 0.0}
        
        total_volume = sum(inv.ask_price for inv in invoices)
        sector_volumes = {}
        
        for inv in invoices:
            sector = inv.sector or "Unknown"
            sector_volumes[sector] = sector_volumes.get(sector, 0) + inv.ask_price
        
        # Calculate percentages
        sector_percentages = {
            sector: round((volume / total_volume) * 100, 2)
            for sector, volume in sorted(sector_volumes.items(), key=lambda x: x[1], reverse=True)
        }
        
        # Calculate concentration (top 3 sectors)
        top_3_volume = sum(list(sector_volumes.values())[:3])
        concentration_ratio = round((top_3_volume / total_volume) * 100, 2)
        
        top_sector = max(sector_volumes, key=sector_volumes.get) if sector_volumes else None
        
        return {
            "sectors": sector_percentages,
            "top_sector": top_sector,
            "concentration_ratio": concentration_ratio,
        }

    @staticmethod
    def calculate_user_metrics(db: Session) -> Dict[int, int]:
        """Calculate active sellers and investors count."""
        active_sellers = db.query(func.count(User.id)).filter(
            User.role.in_([UserRole.SELLER, UserRole.SME]),
            User.is_active == True,
            User.email_verified == True
        ).scalar() or 0
        
        active_investors = db.query(func.count(User.id)).filter(
            User.role == UserRole.INVESTOR,
            User.is_active == True,
            User.email_verified == True
        ).scalar() or 0
        
        return {"sellers": active_sellers, "investors": active_investors}

    @staticmethod
    def aggregate_stats(
        db: Session,
        period: Optional[str] = None,
        period_type: str = "monthly",
        use_cache: bool = True
    ) -> Dict:
        """
        Aggregate all platform statistics for a given period.
        If period is None, returns all-time stats.
        """
        cache_key = PlatformStatsService._get_cache_key("summary", period)
        
        # Check cache first
        if use_cache:
            cached_data = PlatformStatsService._cache_get(cache_key)
            if cached_data:
                return cached_data
        
        # Determine period start for time-series
        period_start = None
        if period and period_type == "monthly":
            period_start = datetime.strptime(period, "%Y-%m").replace(day=1)
        elif period and period_type == "quarterly":
            year, q = period.split("-Q")
            month = (int(q) - 1) * 3 + 1
            period_start = datetime(int(year), month, 1)
        elif period and period_type == "yearly":
            period_start = datetime(int(period), 1, 1)
        
        # Calculate all metrics
        funded_volume = PlatformStatsService.calculate_total_funded_volume(db)
        repayment = PlatformStatsService.calculate_repayment_metrics(db, period_start)
        revenue = PlatformStatsService.calculate_platform_revenue(db, period_start=period_start)
        avg_yield = PlatformStatsService.calculate_average_yield(db, period_start=period_start)
        risk_dist = PlatformStatsService.calculate_risk_distribution(db, period_start=period_start)
        sector_exp = PlatformStatsService.calculate_sector_exposure(db, period_start=period_start)
        user_metrics = PlatformStatsService.calculate_user_metrics(db)
        
        # Compile response
        result = {
            "period": period or "all-time",
            "period_type": period_type,
            "total_funded_volume": funded_volume,
            "total_invoices_created": db.query(func.count(Invoice.id)).filter(
                Invoice.created_at >= period_start if period_start else True
            ).scalar() or 0,
            "total_invoices_funded": repayment["total_funded"],
            "repayment_metrics": {
                "total_repaid": repayment["total_repaid"],
                "total_defaulted": repayment["total_defaulted"],
                "repayment_rate": repayment["repayment_rate"],
                "default_rate": repayment["default_rate"],
            },
            "platform_revenue": revenue,
            "average_invoice_yield": avg_yield,
            "risk_distribution": risk_dist,
            "sector_exposure": sector_exp,
            "user_metrics": {
                "active_sellers": user_metrics["sellers"],
                "active_investors": user_metrics["investors"],
            },
        }
        
        # Cache result
        PlatformStatsService._cache_set(cache_key, result)
        
        return result

    @staticmethod
    def get_time_series(
        db: Session,
        months: int = 12,
        use_cache: bool = True
    ) -> List[Dict]:
        """
        Get time-series stats for the last N months.
        Returns list of monthly aggregations.
        """
        cache_key = PlatformStatsService._get_cache_key("timeseries", f"last_{months}m")
        
        if use_cache:
            cached_data = PlatformStatsService._cache_get(cache_key)
            if cached_data:
                return cached_data
        
        result = []
        now = datetime.now()
        
        for i in range(months):
            month_dt = now - timedelta(days=30 * i)
            period_str = PlatformStatsService._get_period_string(month_dt, "monthly")
            
            stats = PlatformStatsService.aggregate_stats(
                db, period=period_str, period_type="monthly", use_cache=False
            )
            result.insert(0, stats)  # Insert at beginning to maintain chronological order
        
        PlatformStatsService._cache_set(cache_key, result)
        return result

    @staticmethod
    def persist_stats_to_db(db: Session, period: Optional[str] = None) -> None:
        """
        Persist aggregated stats to the PlatformStats table.
        Called periodically or after significant events.
        """
        stats = PlatformStatsService.aggregate_stats(db, period=period, use_cache=False)
        
        period_str = stats["period"]
        period_type = stats["period_type"]
        
        # Check if record already exists
        existing = db.query(PlatformStats).filter(
            and_(
                PlatformStats.period == period_str,
                PlatformStats.period_type == period_type
            )
        ).first()
        
        if existing:
            # Update existing record
            existing.total_funded_volume = stats["total_funded_volume"]
            existing.total_invoices_created = stats["total_invoices_created"]
            existing.total_invoices_funded = stats["total_invoices_funded"]
            existing.total_invoices_repaid = stats["repayment_metrics"]["total_repaid"]
            existing.total_invoices_defaulted = stats["repayment_metrics"]["total_defaulted"]
            existing.repayment_rate = stats["repayment_metrics"]["repayment_rate"]
            existing.default_rate = stats["repayment_metrics"]["default_rate"]
            existing.platform_revenue = stats["platform_revenue"]
            existing.average_invoice_yield = stats["average_invoice_yield"]
            existing.average_composite_score = stats["risk_distribution"]["avg_score"]
            existing.high_risk_invoices = stats["risk_distribution"]["high"]
            existing.medium_risk_invoices = stats["risk_distribution"]["medium"]
            existing.low_risk_invoices = stats["risk_distribution"]["low"]
            existing.sector_exposure = stats["sector_exposure"]["sectors"]
            existing.top_sector = stats["sector_exposure"]["top_sector"]
            existing.concentration_ratio = stats["sector_exposure"]["concentration_ratio"]
            existing.total_active_sellers = stats["user_metrics"]["active_sellers"]
            existing.total_active_investors = stats["user_metrics"]["active_investors"]
        else:
            # Create new record
            new_record = PlatformStats(
                period=period_str,
                period_type=period_type,
                total_funded_volume=stats["total_funded_volume"],
                total_invoices_created=stats["total_invoices_created"],
                total_invoices_funded=stats["total_invoices_funded"],
                total_invoices_repaid=stats["repayment_metrics"]["total_repaid"],
                total_invoices_defaulted=stats["repayment_metrics"]["total_defaulted"],
                repayment_rate=stats["repayment_metrics"]["repayment_rate"],
                default_rate=stats["repayment_metrics"]["default_rate"],
                platform_revenue=stats["platform_revenue"],
                average_invoice_yield=stats["average_invoice_yield"],
                average_composite_score=stats["risk_distribution"]["avg_score"],
                high_risk_invoices=stats["risk_distribution"]["high"],
                medium_risk_invoices=stats["risk_distribution"]["medium"],
                low_risk_invoices=stats["risk_distribution"]["low"],
                sector_exposure=stats["sector_exposure"]["sectors"],
                top_sector=stats["sector_exposure"]["top_sector"],
                concentration_ratio=stats["sector_exposure"]["concentration_ratio"],
                total_active_sellers=stats["user_metrics"]["active_sellers"],
                total_active_investors=stats["user_metrics"]["active_investors"],
            )
            db.add(new_record)
        
        db.commit()
