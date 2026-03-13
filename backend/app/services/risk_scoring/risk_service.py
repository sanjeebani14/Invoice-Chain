from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
import xgboost as xgb
import shap
from sqlalchemy.orm import Session

from app import models


class RiskScoringEngine:
    """
    ML-ready risk engine built around XGBoost + SHAP.

    In production you should:
    - Train an XGBoost model on your SCF-style dataset.
    - Save it as `model.json` (or similar).
    - Configure `model_path` to point to it.

    This implementation is defensive:
    - If the model cannot be loaded, it falls back to a
      deterministic rules-based score using the same features.
    """

    def __init__(self, model_path: str | None = None) -> None:
        self.model: Optional[xgb.Booster] = None
        self._explainer: Optional[shap.TreeExplainer] = None
        self.model_path = model_path or "model.json"
        self._try_load_model()

    # ── Model loading ──────────────────────────────────────────────
    def _try_load_model(self) -> None:
        try:
            booster = xgb.Booster()
            booster.load_model(self.model_path)
            self.model = booster
            # Explainer will be created lazily when first used
        except Exception:
            # Keep model as None – engine will fall back to heuristic
            self.model = None
            self._explainer = None

    # ── Public API ────────────────────────────────────────────────
    def calculate_score(
        self,
        db: Session,
        seller_id: int,
        invoice_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        # 1. Fetch the seller record with multi-entity indicators
        seller = (
            db.query(models.CreditHistory)
            .filter(models.CreditHistory.seller_id == seller_id)
            .first()
        )

        if not seller:
            return {
                "composite_score": 50,
                "risk_level": "NEUTRAL",
                "insights": ["No credit history found for this seller."],
                "breakdown": {},
            }

        features_df = self._build_feature_vector(seller, invoice_data)

        if self.model is not None:
            score, shap_summary, shap_vector = self._score_with_model(features_df)
        else:
            score, shap_summary, shap_vector = self._fallback_score(features_df)

        score_int = int(max(0, min(100, score)))
        risk_level = "High" if score_int > 70 else "Medium" if score_int > 40 else "Low"

        # Persist SHAP / attribution vector for future analytics
        seller.risk_contributors = shap_vector
        seller.composite_score = score_int

        # Automatically open a fraud review flag whenever a newly
        # calculated score crosses the high‑risk threshold, regardless
        # of whether an admin has visited the seller in the UI.
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
                    reason=(
                        "Automatic high-risk flag from risk engine "
                        "(composite score above threshold)."
                    ),
                    severity="HIGH",
                    is_resolved=False,
                )
                db.add(auto_flag)

        # Commit persistence-side effects so that both the updated
        # composite score and any newly created fraud flag are stored.
        db.add(seller)
        db.commit()

        return {
            "composite_score": score_int,
            "risk_level": risk_level,
            "insights": shap_summary,
            "breakdown": self._build_breakdown(seller, features_df.iloc[0].to_dict()),
        }

    # ── Feature engineering ───────────────────────────────────────
    def _build_feature_vector(
        self,
        seller: models.CreditHistory,
        invoice_data: Optional[Dict[str, Any]] = None,
    ) -> pd.DataFrame:
        """
        Constructs the feature vector for the ML model from:
        - SME financial behaviour (payment history, track record)
        - Core enterprise strength (core_enterprise_rating)
        - Relationship & logistics (transaction_stability, logistics_consistency)
        - ESG signal (esg_score)
        """
        # Simple defaults when new fields are still being backfilled
        core_rating = seller.core_enterprise_rating or 70
        relationship_years = float(seller.transaction_stability or 1.0)
        logistics_score = float(seller.logistics_consistency or 80.0)
        esg_score = float(seller.esg_score or 5.5)  # above 4.73 = safer

        # Optional extra invoice-level risk drivers can be merged in later
        base_features: Dict[str, Any] = {
            "payment_history": seller.payment_history_score or 0,
            "client_reputation": seller.client_reputation_score or 0,
            "seller_track_record": seller.seller_track_record or 0,
            "core_enterprise_rating": core_rating,
            "relationship_years": relationship_years,
            "logistics_consistency": logistics_score,
            "esg_score": esg_score,
        }

        if invoice_data:
            for k, v in invoice_data.items():
                if isinstance(v, (int, float)):
                    base_features[f"invoice_{k}"] = v

        return pd.DataFrame([base_features])

    # ── XGBoost + SHAP scoring ────────────────────────────────────
    def _score_with_model(
        self,
        features: pd.DataFrame,
    ) -> tuple[float, List[str], Dict[str, float]]:
        dmat = xgb.DMatrix(features)
        # Assuming binary classification – model outputs PD in [0, 1]
        prob_default = float(self.model.predict(dmat)[0])

        # Convert PD into 0-100 risk score (higher = riskier)
        score = prob_default * 100.0

        # Lazily build SHAP explainer
        if self._explainer is None:
            self._explainer = shap.TreeExplainer(self.model)

        shap_values = self._explainer.shap_values(features)

        # For binary classification, shap_values can be 2D – we take class 1
        if isinstance(shap_values, list):
            shap_vec = np.array(shap_values[1][0])
        else:
            shap_vec = np.array(shap_values[0])

        shap_dict = {
            feature_name: float(val)
            for feature_name, val in zip(features.columns, shap_vec, strict=False)
        }
        summary = self._summarise_shap(prob_default, shap_dict)
        return score, summary, shap_dict

    # ── Fallback rules-based scoring (no model yet) ───────────────
    def _fallback_score(
        self,
        features: pd.DataFrame,
    ) -> tuple[float, List[str], Dict[str, float]]:
        row = features.iloc[0]

        # Start from base risk informed by payment history (better history → lower risk)
        base_risk = 100 - (row["payment_history"] * 0.6)

        # Better core enterprise rating reduces risk
        core_adjustment = (100 - row["core_enterprise_rating"]) * 0.2

        # Longer relationships and better logistics reduce risk
        relationship_adjustment = max(0.0, 5.0 - row["relationship_years"]) * 2.0
        logistics_adjustment = (100 - row["logistics_consistency"]) * 0.1

        # ESG penalty when below threshold (~4.73). Here we map 0–10 ESG to penalty.
        esg_raw = row["esg_score"]
        esg_penalty = 0.0
        if esg_raw < 4.73:
            esg_penalty = (4.73 - esg_raw) * 4.0

        # Raw score before scaling / clipping
        raw_score = base_risk + core_adjustment + relationship_adjustment + logistics_adjustment + esg_penalty

        # Compress scores into a more realistic band [20, 80] instead of
        # regularly hitting the extremes 0 and 100 when using heuristic mode.
        clipped = max(0.0, min(100.0, raw_score))
        score = 20.0 + 0.6 * clipped

        shap_like_vector: Dict[str, float] = {
            "payment_history": float(-base_risk),
            "core_enterprise_rating": float(core_adjustment),
            "relationship_years": float(relationship_adjustment),
            "logistics_consistency": float(logistics_adjustment),
            "esg_score": float(esg_penalty),
        }

        insights = self._summarise_shap(None, shap_like_vector)
        return score, insights, shap_like_vector

    # ── Interpretability text ─────────────────────────────────────
    def _summarise_shap(
        self,
        prob_default: Optional[float],
        shap_vector: Dict[str, float],
    ) -> List[str]:
        messages: List[str] = []

        if prob_default is not None:
            messages.append(
                f"Estimated probability of default is {prob_default * 100:.1f}% based on combined features."
            )

        # Sort contributors by absolute impact
        top_items = sorted(
            shap_vector.items(),
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

    # ── Simple breakdown for dashboards ───────────────────────────
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