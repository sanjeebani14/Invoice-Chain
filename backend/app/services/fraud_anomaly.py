from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sqlalchemy.orm import Session
import xgboost as xgb

from app.models import CreditHistory, Invoice


BENFORD_PROBS: dict[int, float] = {
    d: np.log10(1 + 1 / d) for d in range(1, 10)
}


@dataclass
class InvoiceAnomalyResult:
    should_flag: bool
    severity: str
    model_label: int
    anomaly_score: float
    global_anomaly_score: float | None
    supervised_probability: float | None
    amount_velocity_zscore: float
    benford_deviation: float
    net_delta_abs: float
    reasons: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "should_flag": self.should_flag,
            "severity": self.severity,
            "model_label": self.model_label,
            "anomaly_score": self.anomaly_score,
            "global_anomaly_score": self.global_anomaly_score,
            "supervised_probability": self.supervised_probability,
            "amount_velocity_zscore": self.amount_velocity_zscore,
            "benford_deviation": self.benford_deviation,
            "net_delta_abs": self.net_delta_abs,
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
        self._global_iforest: IsolationForest | None = None
        self._global_xgb: xgb.Booster | None = None
        self._feature_columns: list[str] | None = None
        self._models_loaded = False

    def _load_models_if_needed(self) -> None:
        if self._models_loaded:
            return

        base_dir = Path(__file__).resolve().parents[2]
        ml_dir = base_dir / "ml"

        meta_path = ml_dir / "invoice_iforest_meta.json"
        iforest_path = ml_dir / "invoice_iforest.joblib"
        xgb_path = ml_dir / "invoice_fraud_xgb.json"

        try:
            if meta_path.exists():
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                cols = meta.get("feature_columns")
                if isinstance(cols, list):
                    self._feature_columns = [str(c) for c in cols]
        except Exception:
            self._feature_columns = None

        try:
            if iforest_path.exists():
                loaded_model = joblib.load(iforest_path)
                if isinstance(loaded_model, IsolationForest):
                    self._global_iforest = loaded_model
        except Exception:
            self._global_iforest = None

        try:
            if xgb_path.exists():
                booster = xgb.Booster()
                booster.load_model(str(xgb_path))
                self._global_xgb = booster
        except Exception:
            self._global_xgb = None

        self._models_loaded = True

    def evaluate_invoice(self, db: Session, invoice: Invoice) -> InvoiceAnomalyResult:
        if invoice.seller_id is None:
            return InvoiceAnomalyResult(
                should_flag=False,
                severity="LOW",
                model_label=1,
                anomaly_score=0.0,
                global_anomaly_score=None,
                supervised_probability=None,
                amount_velocity_zscore=0.0,
                benford_deviation=0.0,
                net_delta_abs=0.0,
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
                global_anomaly_score=None,
                supervised_probability=None,
                amount_velocity_zscore=0.0,
                benford_deviation=0.0,
                net_delta_abs=0.0,
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
        seller_anomaly_score = min(iso_score, lof_score)
        model_label = -1 if (iso_label == -1 or lof_label == -1) else 1
        self._load_models_if_needed()

        global_anomaly_score: float | None = None
        if self._global_iforest is not None:
            try:
                global_x = self._align_feature_columns(target_df)
                global_anomaly_score = float(-self._global_iforest.decision_function(global_x)[0])
            except Exception:
                global_anomaly_score = None

        supervised_prob: float | None = None
        if self._global_xgb is not None:
            try:
                global_x = self._align_feature_columns(target_df)
                dmat = xgb.DMatrix(global_x.values, feature_names=list(global_x.columns))
                pred = self._global_xgb.predict(dmat)
                supervised_prob = float(pred[0]) if len(pred) > 0 else None
            except Exception:
                supervised_prob = None

        anomaly_score = seller_anomaly_score
        if global_anomaly_score is not None:
            anomaly_score = min(anomaly_score, -global_anomaly_score)

        severity = self._severity_from_score(anomaly_score, supervised_prob)
        should_flag = model_label == -1
        if supervised_prob is not None and supervised_prob >= 0.75:
            should_flag = True
        if global_anomaly_score is not None and global_anomaly_score >= 0.35:
            should_flag = True

        amount_velocity_zscore = float(target_df.iloc[0]["amount_velocity_zscore"])
        benford_deviation = float(target_df.iloc[0]["benford_deviation"])
        net_delta_abs = float(target_df.iloc[0]["net_delta_abs"])
        reasons = self._build_reasons(
            amount_velocity_zscore=amount_velocity_zscore,
            benford_deviation=benford_deviation,
            issue_hour=float(target_df.iloc[0]["issued_hour"]),
            issue_weekday=float(target_df.iloc[0]["issued_weekday"]),
            net_delta_abs=net_delta_abs,
            invoice_total=float(target_df.iloc[0]["amount"]),
            anomaly_score=anomaly_score,
            global_anomaly_score=global_anomaly_score,
            supervised_probability=supervised_prob,
        )

        return InvoiceAnomalyResult(
            should_flag=should_flag,
            severity=severity,
            model_label=model_label,
            anomaly_score=anomaly_score,
            global_anomaly_score=global_anomaly_score,
            supervised_probability=supervised_prob,
            amount_velocity_zscore=amount_velocity_zscore,
            benford_deviation=benford_deviation,
            net_delta_abs=net_delta_abs,
            reasons=reasons,
        )

    def _build_feature_matrix(self, history: list[Invoice], current: Invoice) -> pd.DataFrame:
        rows = [self._invoice_to_row(inv) for inv in history]
        rows.append(self._invoice_to_row(current))
        df = pd.DataFrame(rows)

        df["amount"] = df["amount"].fillna(df["amount"].median()).clip(lower=0)
        df["log_amount"] = np.log1p(df["amount"])
        df["discount"] = df["discount"].fillna(0).clip(lower=0)
        df["tax"] = df["tax"].fillna(0).clip(lower=0)
        df["balance"] = df["balance"].fillna(0).clip(lower=0)

        df["net_value"] = (df["amount"] - df["discount"] + df["tax"]).clip(lower=0)
        df["net_delta_abs"] = (df["net_value"] - df["amount"]).abs()
        df["discount_ratio"] = (df["discount"] / (df["amount"].replace(0, np.nan))).fillna(0).clip(0, 2)
        df["tax_ratio"] = (df["tax"] / (df["amount"].replace(0, np.nan))).fillna(0).clip(0, 2)
        df["balance_ratio"] = (df["balance"] / (df["amount"].replace(0, np.nan))).fillna(0).clip(0, 3)

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

        df["issued_hour"] = df["issue_dt"].dt.hour.fillna(12).astype(float)
        df["issued_weekday"] = df["issue_dt"].dt.weekday.fillna(0).astype(float)
        df["hour_sin"] = np.sin(2 * np.pi * df["issued_hour"] / 24.0)
        df["hour_cos"] = np.cos(2 * np.pi * df["issued_hour"] / 24.0)
        df["weekday_sin"] = np.sin(2 * np.pi * df["issued_weekday"] / 7.0)
        df["weekday_cos"] = np.cos(2 * np.pi * df["issued_weekday"] / 7.0)

        df["invoice_status_norm"] = df["invoice_status"].map(self._normalize_category)
        df["country_norm"] = df["country"].map(self._normalize_category)
        df["service_norm"] = df["service"].map(self._normalize_category)

        status_dummies = pd.get_dummies(df["invoice_status_norm"], prefix="status", dtype=int)
        country_dummies = pd.get_dummies(df["country_norm"], prefix="country", dtype=int)
        service_dummies = pd.get_dummies(df["service_norm"], prefix="service", dtype=int)
        df = pd.concat([df, status_dummies, country_dummies, service_dummies], axis=1)

        feature_cols = [
            "amount",
            "log_amount",
            "net_value",
            "net_delta_abs",
            "discount_ratio",
            "tax_ratio",
            "balance_ratio",
            "days_to_due",
            "amount_velocity_zscore",
            "benford_deviation",
            "issued_hour",
            "issued_weekday",
            "hour_sin",
            "hour_cos",
            "weekday_sin",
            "weekday_cos",
        ] + list(status_dummies.columns) + list(country_dummies.columns) + list(service_dummies.columns)

        return df[feature_cols].astype(float)

    def _invoice_to_row(self, invoice: Invoice) -> dict[str, Any]:
        issue_dt = self._parse_date(invoice.issue_date) or invoice.created_at or datetime.utcnow()
        due_dt = self._parse_date(invoice.due_date)
        if due_dt is None:
            due_dt = issue_dt

        discount_val = self._extract_meta_numeric(invoice, "discount")
        tax_val = self._extract_meta_numeric(invoice, "tax")
        balance_val = self._extract_meta_numeric(invoice, "balance")

        return {
            "amount": float(invoice.amount or 0.0),
            "discount": float(discount_val),
            "tax": float(tax_val),
            "balance": float(balance_val),
            "invoice_status": self._extract_meta_text(invoice, "invoiceStatus", fallback=invoice.status),
            "country": self._extract_meta_text(invoice, "country"),
            "service": self._extract_meta_text(invoice, "service"),
            "issue_dt": issue_dt,
            "due_dt": due_dt,
        }

    def _extract_meta_numeric(self, invoice: Invoice, key: str) -> float:
        # Backward compatible path: OCR payload may contain structured invoice attributes.
        payload = invoice.ocr_confidence if isinstance(invoice.ocr_confidence, dict) else {}
        raw = payload.get(key)
        if isinstance(raw, dict):
            raw = raw.get("value")
        try:
            return max(0.0, float(raw))
        except (TypeError, ValueError):
            return 0.0

    def _extract_meta_text(self, invoice: Invoice, key: str, fallback: str | None = None) -> str:
        payload = invoice.ocr_confidence if isinstance(invoice.ocr_confidence, dict) else {}
        raw = payload.get(key)
        if isinstance(raw, dict):
            raw = raw.get("value")
        text = str(raw).strip() if raw is not None else ""
        if text:
            return text
        return str(fallback or "unknown").strip() or "unknown"

    def _normalize_category(self, value: Any) -> str:
        if value is None:
            return "unknown"
        text = str(value).strip().lower()
        if not text:
            return "unknown"
        return "_".join(text.split())

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
        if anomaly_score <= -0.30:
            return "HIGH"
        if anomaly_score <= -0.08:
            return "MEDIUM"
        return "LOW"

    def _severity_from_score(
        self,
        anomaly_score: float,
        supervised_probability: float | None,
    ) -> str:
        base = "LOW"
        if anomaly_score <= -0.30:
            base = "HIGH"
        elif anomaly_score <= -0.08:
            base = "MEDIUM"

        if supervised_probability is None:
            return base
        if supervised_probability >= 0.80:
            return "HIGH"
        if supervised_probability >= 0.55 and base == "LOW":
            return "MEDIUM"
        return base

    def _align_feature_columns(self, frame: pd.DataFrame) -> pd.DataFrame:
        if not self._feature_columns:
            return frame.astype(float)
        aligned = frame.reindex(columns=self._feature_columns, fill_value=0.0)
        return aligned.astype(float)

    def _build_reasons(
        self,
        amount_velocity_zscore: float,
        benford_deviation: float,
        issue_hour: float,
        issue_weekday: float,
        net_delta_abs: float,
        invoice_total: float,
        anomaly_score: float,
        global_anomaly_score: float | None,
        supervised_probability: float | None,
    ) -> list[str]:
        reasons: list[str] = [
            f"Isolation/LOF anomaly score: {anomaly_score:.4f} (lower means more anomalous)."
        ]

        if global_anomaly_score is not None:
            reasons.append(
                f"Global IsolationForest anomaly intensity: {global_anomaly_score:.4f} (higher means more anomalous)."
            )

        if supervised_probability is not None:
            reasons.append(
                f"Supervised fraud probability estimate: {supervised_probability:.2%}."
            )

        if abs(amount_velocity_zscore) >= 3.0:
            reasons.append(
                "Invoice amount deviates by more than 3 standard deviations from the seller's 30-invoice rolling baseline."
            )

        if invoice_total > 0 and (net_delta_abs / invoice_total) >= 0.18:
            reasons.append(
                "Net value derived from total/discount/tax deviates materially from expected invoice total."
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
