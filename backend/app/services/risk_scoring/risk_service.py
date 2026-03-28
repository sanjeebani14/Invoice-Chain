from __future__ import annotations

import hashlib
import json
import logging
import os
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
import xgboost as xgb
from sqlalchemy.orm import Session

from app import models

logger = logging.getLogger(__name__)


# ML risk engine built around XGBoost with z-score-based explanations
class RiskScoringEngine:

    def __init__(self, model_path: str | None = None) -> None:
        self.model: Optional[xgb.Booster] = None
        base_dir = os.path.dirname(__file__)
        default_model_path = os.path.join(base_dir, "model.json")

        self.model_path = model_path or default_model_path
        self._try_load_model()

    def _try_load_model(self) -> None:
        try:
            booster = xgb.Booster()
            booster.load_model(self.model_path)
            self.model = booster
        except FileNotFoundError as e:
            logger.warning(f"Will fall back to z-score scoring. Error: {e}")
            self.model = None
        except Exception as e:
            logger.error(
                f"Will fall back to z-score scoring. Error: {type(e).__name__}: {e}"
            )
            self.model = None

    def calculate_score(
        self,
        db: Session,
        seller_id: int,
        invoice_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        seller_query = (
            db.query(models.CreditHistory)
            .filter(models.CreditHistory.seller_id == seller_id)
            .order_by(models.CreditHistory.id.asc())
        )
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            seller_query = seller_query.with_for_update()

        seller = seller_query.first()

        if not seller:
            return {
                "composite_score": 50,
                "risk_level": "NEUTRAL",
                "insights": ["No credit history found for this seller."],
                "breakdown": {},
            }

        features_df = self._build_feature_vector(seller, invoice_data)
        current_signature = self._build_signature_from_features(features_df)

        # If inputs are unchanged,reuse stored score.
        if (
            seller.composite_score is not None
            and getattr(seller, "risk_input_signature", None) == current_signature
        ):
            score_int = int(seller.composite_score or 0)
            risk_level = (
                "High" if score_int > 70 else "Medium" if score_int > 40 else "Low"
            )
            return {
                "composite_score": score_int,
                "risk_level": risk_level,
                "insights": [],
                "scoring_method": "cached",
                "model_used": False,
                "fallback_used": False,
                "breakdown": self._build_breakdown(
                    seller, features_df.iloc[0].to_dict()
                ),
            }

        if self.model is not None:
            logger.debug(f"Using XGBoost model for seller_id={seller_id}")
            try:
                score, insights, contributors = self._score_with_model(features_df)
                scoring_method = "xgboost"
                model_used = True
                fallback_used = False
            except Exception as e:
                logger.error(
                    f"XGBoost inference failed for seller_id={seller_id}. "
                    f"Falling back to z-score scoring. Error: {type(e).__name__}: {e}"
                )
                score, insights, contributors = self._fallback_score(features_df)
                scoring_method = "zscore_fallback"
                model_used = False
                fallback_used = True
        else:
            logger.warning(
                f"Using fallback z-score for seller_id={seller_id} "
                f"(model unavailable at {self.model_path})"
            )
            score, insights, contributors = self._fallback_score(features_df)
            scoring_method = "zscore_fallback"
            model_used = False
            fallback_used = True

        bounded_score = float(max(0.0, min(100.0, score)))
        score_int = int(round(bounded_score))
        if model_used and score_int == 0 and bounded_score > 0.0:
            score_int = 1
        risk_level = "High" if score_int > 70 else "Medium" if score_int > 40 else "Low"

        logger.info(
            "Risk scoring completed | seller_id=%s model_used=%s fallback_used=%s scoring_method=%s raw_score=%.4f score=%s",
            seller_id,
            model_used,
            fallback_used,
            scoring_method,
            bounded_score,
            score_int,
        )

        seller.risk_contributors = contributors
        seller.composite_score = score_int
        seller.risk_input_signature = current_signature

        # High risk sellers get automatically flagged for manual review if not already flagged.
        if score_int > 70:
            existing_flag = (
                db.query(models.FraudFlag)
                .filter(
                    models.FraudFlag.seller_id == seller_id,
                    models.FraudFlag.is_resolved.is_(False),
                )
                .first()
            )
            if not existing_flag:
                auto_flag = models.FraudFlag(
                    invoice_id=None,
                    seller_id=seller_id,
                    reason=f"Auto-queued: HIGH risk seller (composite score {score_int}).",
                    severity="HIGH",
                    anomaly_metadata={
                        "source": "risk_engine_auto_flag",
                        "reasons": [
                            f"Seller composite risk score is {score_int}, above the HIGH-risk threshold.",
                            "This is a seller-level flag,invoice-level anomaly details may be unavailable until an invoice is evaluated.",
                        ],
                    },
                    is_resolved=False,
                )
                db.add(auto_flag)

        db.add(seller)
        db.commit()

        return {
            "composite_score": score_int,
            "risk_level": risk_level,
            "insights": insights,
            "scoring_method": scoring_method,
            "model_used": model_used,
            "fallback_used": fallback_used,
            "breakdown": self._build_breakdown(seller, features_df.iloc[0].to_dict()),
        }

    def should_recompute(
        self,
        seller: models.CreditHistory,
        invoice_data: Optional[Dict[str, Any]] = None,
    ) -> bool:

        if seller.composite_score is None:
            return True

        stored_signature = getattr(seller, "risk_input_signature", None)
        if not stored_signature:
            return True

        current_signature = self.compute_input_signature(seller, invoice_data)
        return current_signature != stored_signature

    def compute_input_signature(
        self,
        seller: models.CreditHistory,
        invoice_data: Optional[Dict[str, Any]] = None,
    ) -> str:
        features_df = self._build_feature_vector(seller, invoice_data)
        return self._build_signature_from_features(features_df)

    def _build_signature_from_features(self, features: pd.DataFrame) -> str:
        row = features.iloc[0].to_dict()
        normalised: Dict[str, Any] = {}
        for key, value in row.items():
            if pd.isna(value):
                normalised[key] = None
            elif isinstance(value, np.generic):
                normalised[key] = float(value)
            elif isinstance(value, (int, float)):
                normalised[key] = float(value)
            else:
                normalised[key] = str(value)

        payload = json.dumps(
            normalised,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    # Feature engineering
    def _extract_numeric(
        self,
        payload: Dict[str, Any],
        keys: List[str],
        default: float,
    ) -> float:
        for key in keys:
            if key in payload and payload[key] is not None:
                value = payload[key]
                if isinstance(value, (int, float)):
                    return float(value)
                if isinstance(value, str):
                    try:
                        return float(value.strip())
                    except ValueError:
                        continue
        return float(default)

    def _extract_category(
        self,
        payload: Dict[str, Any],
        keys: List[str],
        default: str,
    ) -> str:
        for key in keys:
            if key in payload and payload[key] is not None:
                value = str(payload[key]).strip()
                if value:
                    return value
        return default

    def _normalise_feature_name(self, key: str) -> str:
        out = key.strip().replace("-", "_").replace(" ", "_")
        buf: List[str] = []
        for idx, ch in enumerate(out):
            if ch.isupper() and idx > 0 and out[idx - 1] != "_":
                buf.append("_")
            buf.append(ch.lower())
        return "".join(buf)

    def _build_feature_vector(
        self,
        seller: models.CreditHistory,
        invoice_data: Optional[Dict[str, Any]] = None,
    ) -> pd.DataFrame:

        # Constructs the feature vector
        invoice_data = invoice_data or {}
        normalised_invoice_data: Dict[str, Any] = {}
        for k, v in invoice_data.items():
            if isinstance(k, str):
                normalised_invoice_data[self._normalise_feature_name(k)] = v

        expected = (
            list(getattr(self.model, "feature_names", None) or [])
            if self.model is not None
            else []
        )
        if expected:
            years_employed = self._extract_numeric(
                normalised_invoice_data,
                ["years_employed", "employment_years"],
                float(getattr(seller, "employment_years", 3.0) or 3.0),
            )
            debt_to_income = self._extract_numeric(
                normalised_invoice_data,
                ["debt_to_income_ratio", "debt_to_income", "dti"],
                float(getattr(seller, "debt_to_income", 0.35) or 0.35),
            )
            debt_to_income = max(0.0, min(2.0, debt_to_income))

            annual_income = self._extract_numeric(
                normalised_invoice_data,
                ["annual_income", "income", "yearly_income"],
                0.0,
            )
            if annual_income <= 0.0:
                annual_income = max(15000.0, 18000.0 + years_employed * 9000.0)

            loan_amount = self._extract_numeric(
                normalised_invoice_data,
                ["loan_amount", "amount", "invoice_amount", "ask_price"],
                0.0,
            )
            if loan_amount <= 0.0:
                loan_amount = max(1500.0, annual_income * 0.18)

            current_debt = self._extract_numeric(
                normalised_invoice_data,
                ["current_debt", "debt", "total_debt"],
                annual_income * debt_to_income,
            )
            savings_assets = self._extract_numeric(
                normalised_invoice_data,
                ["savings_assets", "savings", "assets"],
                annual_income * 0.2,
            )

            mapped: Dict[str, float] = {
                "age": self._extract_numeric(
                    normalised_invoice_data,
                    ["age"],
                    max(18.0, min(75.0, 22.0 + years_employed)),
                ),
                "years_employed": years_employed,
                "annual_income": annual_income,
                "credit_score": self._extract_numeric(
                    normalised_invoice_data,
                    ["credit_score", "payment_history_score"],
                    float(getattr(seller, "payment_history_score", 60.0) or 60.0),
                ),
                "credit_history_years": self._extract_numeric(
                    normalised_invoice_data,
                    ["credit_history_years", "history_years"],
                    max(1.0, years_employed + 1.0),
                ),
                "savings_assets": savings_assets,
                "current_debt": current_debt,
                "defaults_on_file": self._extract_numeric(
                    normalised_invoice_data,
                    ["defaults_on_file", "defaults"],
                    0.0,
                ),
                "delinquencies_last_2yrs": self._extract_numeric(
                    normalised_invoice_data,
                    ["delinquencies_last_2yrs", "delinquencies"],
                    0.0,
                ),
                "derogatory_marks": self._extract_numeric(
                    normalised_invoice_data,
                    ["derogatory_marks"],
                    0.0,
                ),
                "loan_amount": loan_amount,
                "interest_rate": self._extract_numeric(
                    normalised_invoice_data,
                    ["interest_rate", "apr"],
                    11.5,
                ),
                "debt_to_income_ratio": debt_to_income,
                "loan_to_income_ratio": self._extract_numeric(
                    normalised_invoice_data,
                    ["loan_to_income_ratio", "lti"],
                    (loan_amount / annual_income) if annual_income > 0 else 0.0,
                ),
                "payment_to_income_ratio": self._extract_numeric(
                    normalised_invoice_data,
                    ["payment_to_income_ratio", "pti"],
                    (
                        ((loan_amount / 12.0) / annual_income)
                        if annual_income > 0
                        else 0.0
                    ),
                ),
            }

            occupation_status = self._extract_category(
                normalised_invoice_data,
                ["occupation_status", "employment_type"],
                "Employed",
            )
            product_type = self._extract_category(
                normalised_invoice_data,
                ["product_type", "loan_product_type"],
                "Personal Loan",
            )
            loan_intent = self._extract_category(
                normalised_invoice_data,
                ["loan_intent", "purpose", "loan_purpose"],
                "Business",
            )

            for name in expected:
                if name.startswith("occupation_status_"):
                    mapped[name] = (
                        1.0
                        if occupation_status == name.split("occupation_status_", 1)[1]
                        else 0.0
                    )
                elif name.startswith("product_type_"):
                    mapped[name] = (
                        1.0
                        if product_type == name.split("product_type_", 1)[1]
                        else 0.0
                    )
                elif name.startswith("loan_intent_"):
                    mapped[name] = (
                        1.0 if loan_intent == name.split("loan_intent_", 1)[1] else 0.0
                    )

            row = {k: float(mapped.get(k, 0.0)) for k in expected}
            return pd.DataFrame([row], columns=expected)

        core_rating = seller.core_enterprise_rating or 70
        relationship_years = float(seller.transaction_stability or 1.0)
        logistics_score = float(seller.logistics_consistency or 80.0)
        esg_score = float(seller.esg_score or 5.5)  # above 4.73 = safer

        base_features: Dict[str, Any] = {
            "payment_history": seller.payment_history_score or 0,
            "client_reputation": seller.client_reputation_score or 0,
            "seller_track_record": seller.seller_track_record or 0,
            "core_enterprise_rating": core_rating,
            "relationship_years": relationship_years,
            "logistics_consistency": logistics_score,
            "esg_score": esg_score,
        }

        if normalised_invoice_data:
            for k, v in normalised_invoice_data.items():
                if isinstance(v, (int, float)):
                    base_features[f"invoice_{k}"] = v

        return pd.DataFrame([base_features])

    # XGBoost scoring
    def _align_features_for_model(self, features: pd.DataFrame) -> pd.DataFrame:

        if self.model is None:
            return features

        expected = list(getattr(self.model, "feature_names", None) or [])
        if not expected:
            return features

        aligned = features.reindex(columns=expected, fill_value=0.0)

        missing = [c for c in expected if c not in features.columns]
        extra = [c for c in features.columns if c not in expected]
        if missing or extra:
            logger.warning(
                f"Missing filled with 0: {len(missing)}; Extra dropped: {len(extra)}"
            )

        return aligned

    def _score_with_model(
        self,
        features: pd.DataFrame,
    ) -> tuple[float, List[str], Dict[str, float]]:
        aligned_features = self._align_features_for_model(features)
        dmat = xgb.DMatrix(aligned_features)

        prob_default = float(self.model.predict(dmat)[0])

        score = prob_default * 100.0
        _, contributors = self._zscore_algorithm(aligned_features.iloc[0].to_dict())

        summary = self._summarise_contributors(prob_default, contributors)
        return score, summary, contributors

    # Fallback z-score scoring(Initial risk scoring method we used).
    def _fallback_score(
        self,
        features: pd.DataFrame,
    ) -> tuple[float, List[str], Dict[str, float]]:
        score, contributors = self._zscore_algorithm(features.iloc[0].to_dict())
        insights = self._summarise_contributors(None, contributors)
        return score, insights, contributors

    def _zscore_algorithm(self, row: Dict[str, Any]) -> tuple[float, Dict[str, float]]:
        profile: Dict[str, tuple[float, float, float]] = {
            # Feature: (mean, std, direction) where direction=+1 means higher value => higher risk.
            "payment_history": (70.0, 15.0, -1.0),
            "client_reputation": (70.0, 15.0, -1.0),
            "seller_track_record": (70.0, 15.0, -1.0),
            "core_enterprise_rating": (75.0, 12.0, -1.0),
            "relationship_years": (3.0, 2.0, -1.0),
            "logistics_consistency": (85.0, 10.0, -1.0),
            "esg_score": (5.5, 1.5, -1.0),
            "credit_score": (650.0, 80.0, -1.0),
            "debt_to_income_ratio": (0.35, 0.15, 1.0),
            "loan_to_income_ratio": (0.25, 0.12, 1.0),
            "payment_to_income_ratio": (0.05, 0.03, 1.0),
            "current_debt": (30000.0, 20000.0, 1.0),
            "defaults_on_file": (0.2, 0.6, 1.0),
            "delinquencies_last_2yrs": (0.4, 1.0, 1.0),
            "derogatory_marks": (0.2, 0.8, 1.0),
            "interest_rate": (11.0, 4.0, 1.0),
            "years_employed": (5.0, 4.0, -1.0),
        }

        contributions: Dict[str, float] = {}
        values: List[float] = []

        for feature, (mean, std, direction) in profile.items():
            if feature not in row:
                continue
            val = row.get(feature)
            if not isinstance(val, (int, float)):
                continue
            z = (float(val) - mean) / max(std, 1e-6)
            risk_z = float(np.clip(direction * z, -3.0, 3.0))
            contribution = risk_z * 10.0
            contributions[feature] = contribution
            values.append(risk_z)

        if not values:
            return 50.0, {"zscore_baseline": 0.0}

        avg_risk_z = float(np.mean(values))
        score = float(np.clip(50.0 + (avg_risk_z * 15.0), 0.0, 100.0))
        top = sorted(contributions.items(), key=lambda kv: abs(kv[1]), reverse=True)[:8]
        return score, {k: float(v) for k, v in top}

    def _summarise_contributors(
        self,
        prob_default: Optional[float],
        contributors: Dict[str, float],
    ) -> List[str]:
        messages: List[str] = []

        if prob_default is not None:
            messages.append(
                f"Estimated probability of default is {prob_default * 100:.1f}% based on combined features."
            )

        top_items = sorted(
            contributors.items(),
            key=lambda kv: abs(kv[1]),
            reverse=True,
        )[:5]

        for feature, impact in top_items:
            direction = "increases" if impact > 0 else "reduces"
            magnitude = abs(impact)

            if feature == "esg_score":
                messages.append(
                    f"ESG profile {direction} risk score by ~{magnitude:.1f} points "
                    f"({'below' if impact > 0 else 'above'} the sustainability threshold)."
                )
            elif feature == "core_enterprise_rating":
                messages.append(
                    f"Core enterprise strength {direction} overall risk by ~{magnitude:.1f} points."
                )
            elif feature == "relationship_years":
                messages.append(
                    f"Length of trading relationship {direction} perceived default risk by ~{magnitude:.1f} points."
                )
            elif feature == "logistics_consistency":
                messages.append(
                    f"Logistics and delivery consistency {direction} risk by ~{magnitude:.1f} points."
                )
            elif feature == "payment_history":
                messages.append(
                    f"Historical payment behaviour {direction} risk by ~{magnitude:.1f} points versus peers."
                )

        if not messages:
            messages.append(
                "Risk score is based on historical payment behaviour, core buyer strength, relationship stability, logistics, and ESG profile."
            )

        return messages

    # Breakdown for UI
    def _build_breakdown(
        self,
        seller: models.CreditHistory,
        feature_row: Dict[str, Any],
    ) -> Dict[str, Any]:
        return {
            "financial_risk": int(seller.payment_history_score or 0),
            "relationship_stability": float(feature_row.get("relationship_years", 0.0)),
            "buyer_quality": int(feature_row.get("core_enterprise_rating", 0)),
            "logistics_quality": float(feature_row.get("logistics_consistency", 0.0)),
            "esg_score": float(feature_row.get("esg_score", 0.0)),
        }
