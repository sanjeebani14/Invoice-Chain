from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sqlalchemy.orm import Session

from app.models import Invoice
from app.services.risk_scoring.risk_service import RiskScoringEngine


BENFORD_PROBS: dict[int, float] = {
    d: np.log10(1 + 1 / d) for d in range(1, 10)
}


@dataclass
class InvoiceAnomalyResult:
    should_flag: bool
    severity: str
    model_label: int
    anomaly_score: float
    amount_velocity_zscore: float
    benford_deviation: float
    reasons: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "should_flag": self.should_flag,
            "severity": self.severity,
            "model_label": self.model_label,
            "anomaly_score": self.anomaly_score,
            "amount_velocity_zscore": self.amount_velocity_zscore,
            "benford_deviation": self.benford_deviation,
            "reasons": self.reasons,
        }


class InvoiceAnomalyService:
    """
    Seller-context anomaly detector using Isolation Forest + LOF.

    The service is intentionally stateless and trains on the seller's recent
    invoice history each time it is called. This keeps behavior adaptive as new
    billing patterns emerge.
    """

    def __init__(
        self,
        contamination: float = 0.08,
        min_history: int = 20,
        history_days: int = 180,
        random_state: int = 42,
    ) -> None:
        self.contamination = contamination
        self.min_history = min_history
        self.history_days = history_days
        self.random_state = random_state
        # Optional supervised overlay – will be a lazily-loaded XGBoost model
        # trained on resolved fraud flags using the same feature space.
        self._supervised_engine: RiskScoringEngine | None = None

    def _load_supervised_engine(self) -> None:
        """
        Lazily initialise a RiskScoringEngine-style wrapper for the supervised
        fraud classifier, if one has been trained and saved.
        """
        if self._supervised_engine is not None:
            return
        try:
            # Reuse RiskScoringEngine’s XGBoost + SHAP machinery by pointing
            # it at the fraud classifier model path.
            self._supervised_engine = RiskScoringEngine(model_path="app/ml/invoice_fraud_xgb.json")
        except Exception:
            self._supervised_engine = None

    def evaluate_invoice(self, db: Session, invoice: Invoice) -> InvoiceAnomalyResult:
        if invoice.seller_id is None:
            return InvoiceAnomalyResult(
                should_flag=False,
                severity="LOW",
                model_label=1,
                anomaly_score=0.0,
                amount_velocity_zscore=0.0,
                benford_deviation=0.0,
                reasons=["Invoice has no seller context, anomaly model skipped."],
            )

        cutoff = datetime.utcnow() - timedelta(days=self.history_days)
        history = (
            db.query(Invoice)
            .filter(Invoice.seller_id == invoice.seller_id)
            .filter(Invoice.id != invoice.id)
            .filter(Invoice.created_at >= cutoff)
            .order_by(Invoice.created_at.asc())
            .all()
        )

        if len(history) < self.min_history:
            return InvoiceAnomalyResult(
                should_flag=False,
                severity="LOW",
                model_label=1,
                anomaly_score=0.0,
                amount_velocity_zscore=0.0,
                benford_deviation=0.0,
                reasons=[
                    (
                        "Insufficient seller history for anomaly scoring "
                        f"(need {self.min_history}, found {len(history)})."
                    )
                ],
            )

        feature_df = self._build_feature_matrix(history, invoice)
        train_df = feature_df.iloc[:-1]
        target_df = feature_df.iloc[[-1]]

        iso_forest = IsolationForest(
            n_estimators=250,
            contamination=self.contamination,
            random_state=self.random_state,
        )
        iso_forest.fit(train_df)
        iso_label = int(iso_forest.predict(target_df)[0])
        iso_score = float(iso_forest.decision_function(target_df)[0])

        # LOF with novelty=True allows scoring a new invoice against seller history.
        neighbors = min(20, max(5, len(train_df) - 1))
        lof = LocalOutlierFactor(
            n_neighbors=neighbors,
            contamination=self.contamination,
            novelty=True,
        )
        lof.fit(train_df)
        lof_label = int(lof.predict(target_df)[0])
        lof_score = float(lof.decision_function(target_df)[0])

        # Lower decision_function means more anomalous for both models.
        anomaly_score = min(iso_score, lof_score)
        model_label = -1 if (iso_label == -1 or lof_label == -1) else 1
        severity = self._severity_from_score(anomaly_score)

        # Optionally blend in a supervised fraud probability if model is available.
        supervised_prob: float | None = None
        self._load_supervised_engine()
        if self._supervised_engine and self._supervised_engine.model is not None:
            # RiskScoringEngine exposes probability-of-default style outputs
            # via its `calculate_score` pipeline. We pass invoice-level
            # features only and interpret high PD as higher fraud suspicion.
            features_for_supervised = target_df.iloc[0].to_dict()
            try:
                prob_result = self._supervised_engine._score_with_model(
                    pd.DataFrame([features_for_supervised])
                )
                # _score_with_model returns (score, shap_summary, shap_vector)
                score_val = prob_result[0]
                supervised_prob = float(score_val / 100.0)
                if supervised_prob >= 0.7:
                    severity = "HIGH"
                elif supervised_prob >= 0.4 and severity == "LOW":
                    severity = "MEDIUM"
            except Exception:
                supervised_prob = None

        amount_velocity_zscore = float(target_df.iloc[0]["amount_velocity_zscore"])
        benford_deviation = float(target_df.iloc[0]["benford_deviation"])
        reasons = self._build_reasons(
            amount_velocity_zscore=amount_velocity_zscore,
            benford_deviation=benford_deviation,
            issue_hour=float(target_df.iloc[0]["issue_hour"]),
            issue_weekday=float(target_df.iloc[0]["issue_weekday"]),
            anomaly_score=anomaly_score,
        )

        return InvoiceAnomalyResult(
            should_flag=(model_label == -1),
            severity=severity,
            model_label=model_label,
            anomaly_score=anomaly_score,
            amount_velocity_zscore=amount_velocity_zscore,
            benford_deviation=benford_deviation,
            reasons=reasons,
        )

    def _build_feature_matrix(self, history: list[Invoice], current: Invoice) -> pd.DataFrame:
        rows = [self._invoice_to_row(inv) for inv in history]
        rows.append(self._invoice_to_row(current))
        df = pd.DataFrame(rows)

        df["amount"] = df["amount"].fillna(df["amount"].median()).clip(lower=0)
        df["log_amount"] = np.log1p(df["amount"])

        rolling_mean = df["amount"].rolling(window=30, min_periods=3).mean().shift(1)
        rolling_std = df["amount"].rolling(window=30, min_periods=3).std().shift(1)
        rolling_std = rolling_std.replace(0, np.nan)
        zscore = (df["amount"] - rolling_mean) / rolling_std
        df["amount_velocity_zscore"] = zscore.fillna(0.0)

        first_digits = df["amount"].apply(self._first_digit)
        observed_freq = first_digits.value_counts(normalize=True).to_dict()
        df["benford_expected"] = first_digits.map(BENFORD_PROBS).fillna(0.0)
        df["benford_observed"] = first_digits.map(observed_freq).fillna(0.0)
        df["benford_deviation"] = (df["benford_observed"] - df["benford_expected"]).abs()

        df["days_to_due"] = (
            (df["due_dt"] - df["issue_dt"]).dt.total_seconds() / 86400.0
        ).clip(lower=0, upper=365).fillna(30.0)

        df["issue_hour"] = df["issue_dt"].dt.hour.fillna(12).astype(float)
        df["issue_weekday"] = df["issue_dt"].dt.weekday.fillna(0).astype(float)
        df["issue_hour_sin"] = np.sin(2 * np.pi * df["issue_hour"] / 24.0)
        df["issue_hour_cos"] = np.cos(2 * np.pi * df["issue_hour"] / 24.0)
        df["issue_weekday_sin"] = np.sin(2 * np.pi * df["issue_weekday"] / 7.0)
        df["issue_weekday_cos"] = np.cos(2 * np.pi * df["issue_weekday"] / 7.0)

        return df[
            [
                "amount",
                "log_amount",
                "days_to_due",
                "amount_velocity_zscore",
                "benford_deviation",
                "issue_hour",
                "issue_weekday",
                "issue_hour_sin",
                "issue_hour_cos",
                "issue_weekday_sin",
                "issue_weekday_cos",
            ]
        ].astype(float)

    def _invoice_to_row(self, invoice: Invoice) -> dict[str, Any]:
        issue_dt = self._parse_date(invoice.issue_date) or invoice.created_at or datetime.utcnow()
        due_dt = self._parse_date(invoice.due_date)
        if due_dt is None:
            due_dt = issue_dt

        return {
            "amount": float(invoice.amount or 0.0),
            "issue_dt": issue_dt,
            "due_dt": due_dt,
        }

    def _parse_date(self, value: str | None) -> datetime | None:
        if not value:
            return None

        dt = pd.to_datetime(value, errors="coerce")
        if pd.isna(dt):
            return None
        if isinstance(dt, pd.Timestamp):
            return dt.to_pydatetime()
        return dt

    def _first_digit(self, amount: float) -> int:
        if amount <= 0:
            return 1
        text = str(int(abs(amount)))
        for ch in text:
            if ch.isdigit() and ch != "0":
                return int(ch)
        return 1

    def _severity_from_score(self, anomaly_score: float) -> str:
        if anomaly_score <= -0.25:
            return "HIGH"
        if anomaly_score <= -0.05:
            return "MEDIUM"
        return "LOW"

    def _build_reasons(
        self,
        amount_velocity_zscore: float,
        benford_deviation: float,
        issue_hour: float,
        issue_weekday: float,
        anomaly_score: float,
    ) -> list[str]:
        reasons: list[str] = [
            f"Isolation/LOF anomaly score: {anomaly_score:.4f} (lower means more anomalous)."
        ]

        if abs(amount_velocity_zscore) >= 3.0:
            reasons.append(
                "Invoice amount deviates by more than 3 standard deviations from the seller's 30-invoice rolling baseline."
            )

        if benford_deviation >= 0.20:
            reasons.append(
                "Amount first-digit distribution deviates materially from Benford's Law expectation."
            )

        weekend = int(issue_weekday) in (5, 6)
        off_hours = int(issue_hour) >= 22 or int(issue_hour) <= 5
        if weekend and off_hours:
            reasons.append(
                "Issued during weekend off-hours, outside typical commercial billing windows."
            )

        if len(reasons) == 1:
            reasons.append("No strong single-driver indicator; flagged by multivariate behavior pattern.")

        return reasons
