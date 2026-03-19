from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from math import isfinite
from typing import Any, Iterable

from sqlalchemy.orm import Session

from .. import models

try:
    from scipy.optimize import brentq  # type: ignore
except Exception:  # pragma: no cover - fallback path
    brentq = None


ACTIVE_STATUSES = {"active", "funded"}
REPAID_STATUSES = {"repaid", "settled"}


@dataclass
class InvestorRow:
    snapshot: models.RepaymentSnapshot
    invoice: models.Invoice
    credit: models.CreditHistory | None


class PortfolioAnalyticsService:
    def __init__(self, db: Session):
        self.db = db

    def get_investor_summary(self, investor_id: int) -> dict[str, Any]:
        rows = self._investor_rows(investor_id)

        exposure = 0.0
        realized_pnl = 0.0
        unrealized_pnl = 0.0

        cashflows_realized: list[tuple[date, float]] = []
        cashflows_with_projection: list[tuple[date, float]] = []

        today = datetime.now(timezone.utc).date()

        for row in rows:
            status = self._status(row.invoice.status)
            funded_amount = self._funded_amount(row)

            if funded_amount > 0:
                funded_date = self._funded_date(row)
                cashflows_realized.append((funded_date, -funded_amount))
                cashflows_with_projection.append((funded_date, -funded_amount))

            if status in ACTIVE_STATUSES:
                exposure += funded_amount

            if status in REPAID_STATUSES:
                repayment = self._expected_repayment(row)
                realized_pnl += repayment - funded_amount
                repayment_date = self._repaid_date(row)
                cashflows_realized.append((repayment_date, repayment))
                cashflows_with_projection.append((repayment_date, repayment))

            if status == "active":
                due = self._parse_date(row.invoice.due_date)
                if due and due > today:
                    gross_profit = max(self._expected_repayment(row) - funded_amount, 0.0)
                    impact = self._impact_multiplier(row)
                    unrealized_pnl += gross_profit * impact

                    projected_date = self._adjusted_due_date(
                        row.invoice.due_date,
                        row.snapshot.weighted_average_days_late,
                    )
                    projected_inflow = self._expected_repayment(row) * impact
                    cashflows_with_projection.append((projected_date, projected_inflow))

        realized_xirr = self._xirr(cashflows_realized)
        portfolio_xirr = self._xirr(cashflows_with_projection)

        return {
            "investor_id": investor_id,
            "exposure": round(exposure, 2),
            "realized_pnl": round(realized_pnl, 2),
            "unrealized_pnl": round(unrealized_pnl, 2),
            "total_pnl": round(realized_pnl + unrealized_pnl, 2),
            "realized_xirr": realized_xirr,
            "portfolio_xirr": portfolio_xirr,
            "positions": len(rows),
        }

    def get_investor_cash_flow(self, investor_id: int) -> dict[str, Any]:
        rows = self._investor_rows(investor_id)
        today = datetime.now(timezone.utc).date()

        grouped: dict[date, float] = defaultdict(float)
        for row in rows:
            if self._status(row.invoice.status) != "active":
                continue

            projection_date = self._adjusted_due_date(
                row.invoice.due_date,
                row.snapshot.weighted_average_days_late,
            )
            if projection_date < today:
                continue

            grouped[projection_date] += self._expected_repayment(row) * self._impact_multiplier(row)

        timeline = [
            {
                "date": dt.isoformat(),
                "expected_inflow": round(amount, 2),
            }
            for dt, amount in sorted(grouped.items(), key=lambda kv: kv[0])
        ]

        d30 = today + timedelta(days=30)
        d60 = today + timedelta(days=60)
        d90 = today + timedelta(days=90)

        totals = {
            "next_30_days": round(sum(v for k, v in grouped.items() if k <= d30), 2),
            "next_60_days": round(sum(v for k, v in grouped.items() if k <= d60), 2),
            "next_90_days": round(sum(v for k, v in grouped.items() if k <= d90), 2),
        }

        return {
            "investor_id": investor_id,
            "as_of": today.isoformat(),
            "timeline": timeline,
            "totals": totals,
        }

    def get_platform_concentration(self, threshold_pct: float = 20.0) -> dict[str, Any]:
        rows = self._platform_rows()
        return self._compute_concentration(rows, threshold_pct)

    def get_investor_concentration(self, investor_id: int, threshold_pct: float = 20.0) -> dict[str, Any]:
        rows = self._investor_rows(investor_id)
        return self._compute_concentration(rows, threshold_pct)

    def _compute_concentration(self, rows: list[InvestorRow], threshold_pct: float) -> dict[str, Any]:
        by_seller: dict[str, float] = defaultdict(float)
        by_sector: dict[str, float] = defaultdict(float)
        by_geo: dict[str, float] = defaultdict(float)

        total_volume = 0.0
        for row in rows:
            volume = self._funded_amount(row)
            if volume <= 0:
                continue

            total_volume += volume
            seller_key = str(row.snapshot.seller_id or row.invoice.seller_id or "unknown")
            sector_key = row.snapshot.industry_sector or row.invoice.sector or "Unknown"
            geo_key = row.snapshot.geography or "Unknown"

            by_seller[seller_key] += volume
            by_sector[sector_key] += volume
            by_geo[geo_key] += volume

        seller_breakdown = self._to_breakdown(by_seller, total_volume)
        sector_breakdown = self._to_breakdown(by_sector, total_volume)
        geo_breakdown = self._to_breakdown(by_geo, total_volume)

        alerts: list[dict[str, Any]] = []
        if total_volume > 0:
            for seller, vol in by_seller.items():
                pct = (vol / total_volume) * 100
                if pct > threshold_pct:
                    alerts.append({"type": "seller", "key": seller, "percentage": round(pct, 2)})

            for sector, vol in by_sector.items():
                pct = (vol / total_volume) * 100
                if pct > threshold_pct:
                    alerts.append({"type": "sector", "key": sector, "percentage": round(pct, 2)})

        top_5_share = round(sum(item["percentage"] for item in seller_breakdown[:5]), 2)

        return {
            "total_volume": round(total_volume, 2),
            "top_5_seller_share_pct": top_5_share,
            "seller_breakdown": seller_breakdown,
            "sector_breakdown": sector_breakdown,
            "geo_breakdown": geo_breakdown,
            "alerts": alerts,
            "threshold_pct": threshold_pct,
        }

    def _investor_rows(self, investor_id: int) -> list[InvestorRow]:
        rows = (
            self.db.query(models.RepaymentSnapshot, models.Invoice, models.CreditHistory)
            .join(models.Invoice, models.Invoice.id == models.RepaymentSnapshot.invoice_id)
            .outerjoin(models.CreditHistory, models.CreditHistory.seller_id == models.RepaymentSnapshot.seller_id)
            .filter(models.RepaymentSnapshot.investor_id == investor_id)
            .all()
        )
        return [InvestorRow(snapshot=s, invoice=i, credit=c) for s, i, c in rows]

    def _platform_rows(self) -> list[InvestorRow]:
        rows = (
            self.db.query(models.RepaymentSnapshot, models.Invoice, models.CreditHistory)
            .join(models.Invoice, models.Invoice.id == models.RepaymentSnapshot.invoice_id)
            .outerjoin(models.CreditHistory, models.CreditHistory.seller_id == models.RepaymentSnapshot.seller_id)
            .all()
        )
        return [InvestorRow(snapshot=s, invoice=i, credit=c) for s, i, c in rows]

    @staticmethod
    def _status(raw_status: str | None) -> str:
        return (raw_status or "").strip().lower()

    @staticmethod
    def _to_breakdown(bucket: dict[str, float], total: float) -> list[dict[str, Any]]:
        ranked = sorted(bucket.items(), key=lambda kv: kv[1], reverse=True)
        if total <= 0:
            return [{"key": k, "volume": round(v, 2), "percentage": 0.0} for k, v in ranked]
        return [
            {
                "key": key,
                "volume": round(value, 2),
                "percentage": round((value / total) * 100, 2),
            }
            for key, value in ranked
        ]

    @staticmethod
    def _funded_amount(row: InvestorRow) -> float:
        if row.snapshot.funded_amount is not None and row.snapshot.funded_amount > 0:
            return float(row.snapshot.funded_amount)
        if row.invoice.ask_price is not None and row.invoice.ask_price > 0:
            return float(row.invoice.ask_price)
        return float(row.invoice.amount or 0.0)

    @staticmethod
    def _expected_repayment(row: InvestorRow) -> float:
        if row.snapshot.repayment_amount is not None and row.snapshot.repayment_amount > 0:
            return float(row.snapshot.repayment_amount)
        return float(row.invoice.amount or 0.0)

    @staticmethod
    def _impact_multiplier(row: InvestorRow) -> float:
        score = row.snapshot.impact_score
        if score is None and row.credit is not None:
            score = float(row.credit.composite_score or 100)
        if score is None:
            return 1.0
        normalized = max(0.0, min(100.0, float(score))) / 100.0
        return normalized

    @staticmethod
    def _parse_date(raw: str | None) -> date | None:
        if not raw:
            return None

        raw = raw.strip()
        if not raw:
            return None

        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
        except ValueError:
            pass

        formats = ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y"]
        for fmt in formats:
            try:
                return datetime.strptime(raw, fmt).date()
            except ValueError:
                continue
        return None

    @staticmethod
    def _funded_date(row: InvestorRow) -> date:
        if row.snapshot.funded_at is not None:
            return row.snapshot.funded_at.date()
        if row.invoice.created_at is not None:
            return row.invoice.created_at.date()
        return datetime.now(timezone.utc).date()

    @staticmethod
    def _repaid_date(row: InvestorRow) -> date:
        if row.snapshot.repaid_at is not None:
            return row.snapshot.repaid_at.date()
        due = PortfolioAnalyticsService._parse_date(row.invoice.due_date)
        if due is not None:
            return due
        return datetime.now(timezone.utc).date()

    @staticmethod
    def _adjusted_due_date(due_date: str | None, weighted_average_days_late: float | None) -> date:
        parsed = PortfolioAnalyticsService._parse_date(due_date)
        base = parsed or datetime.now(timezone.utc).date()
        shift_days = int(round(weighted_average_days_late or 0.0))
        return base + timedelta(days=shift_days)

    @staticmethod
    def _xirr(flows: Iterable[tuple[date, float]]) -> float | None:
        normalized = [(d, float(v)) for d, v in flows if isfinite(v) and v != 0.0]
        if len(normalized) < 2:
            return None

        has_positive = any(v > 0 for _, v in normalized)
        has_negative = any(v < 0 for _, v in normalized)
        if not (has_positive and has_negative):
            return None

        normalized.sort(key=lambda x: x[0])
        t0 = normalized[0][0]

        def npv(rate: float) -> float:
            total = 0.0
            for d, amount in normalized:
                years = (d - t0).days / 365.0
                total += amount / ((1.0 + rate) ** years)
            return total

        if brentq is not None:
            try:
                root = brentq(npv, -0.9999, 10.0, maxiter=200)
                return round(root * 100.0, 4)
            except Exception:
                pass

        # Fallback bisection solver if scipy is unavailable.
        lo, hi = -0.9999, 10.0
        f_lo = npv(lo)
        f_hi = npv(hi)
        if f_lo == 0:
            return round(lo * 100.0, 4)
        if f_hi == 0:
            return round(hi * 100.0, 4)
        if f_lo * f_hi > 0:
            return None

        for _ in range(200):
            mid = (lo + hi) / 2.0
            f_mid = npv(mid)
            if abs(f_mid) < 1e-7:
                return round(mid * 100.0, 4)
            if f_lo * f_mid < 0:
                hi = mid
                f_hi = f_mid
            else:
                lo = mid
                f_lo = f_mid

        return round(((lo + hi) / 2.0) * 100.0, 4)
