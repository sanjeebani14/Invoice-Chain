import numpy as np
from sqlalchemy.orm import Session
from app import models  # Ensure this matches your project structure

class RiskScoringEngine:
    def __init__(self):
        # No ML models here - strictly statistical
        pass

    def calculate_score(self, db: Session, seller_id: int, invoice_data: dict = None) -> dict:
        # 1. Fetch seller and population data
        seller = db.query(models.CreditHistory).filter(models.CreditHistory.seller_id == seller_id).first()
        all_scores = db.query(models.CreditHistory.payment_history_score).all()

        if not seller or not all_scores:
            return {"composite_score": 50, "risk_level": "NEUTRAL", "insights": ["No history found"]}

        # 2. Z-Score math
        scores_array = np.array([s[0] for s in all_scores])
        mean_val = np.mean(scores_array)
        std_val = np.std(scores_array) or 1.0
        z_score = (seller.payment_history_score - mean_val) / std_val

        # 3. Weighted Score (Multi-factor)
        base_risk = 50 - (z_score * 10)
        track_record_factor = (100 - seller.seller_track_record) * 0.3
        reputation_factor = (100 - seller.client_reputation_score) * 0.2
        
        # 4. Final calculation
        final_score = int(base_risk + track_record_factor + reputation_factor)
        final_score = max(0, min(100, final_score))

        return {
            "composite_score": final_score,
            "risk_level": "High" if final_score > 70 else "Medium" if final_score > 40 else "Low",
            "breakdown": {
                "statistical_risk": int(base_risk),
                "operational_risk": int(track_record_factor),
                "reputation_impact": int(reputation_factor)
            }
        }