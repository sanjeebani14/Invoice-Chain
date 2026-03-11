from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models
from app.services.risk_scoring.risk_service import RiskScoringEngine

router = APIRouter()
# Initialize the engine once
risk_engine = RiskScoringEngine()

@router.get("/score/{seller_id}")
def get_score(seller_id: int, db: Session = Depends(get_db)):
    # 1. Get the seller record
    seller = db.query(models.CreditHistory).filter(models.CreditHistory.seller_id == seller_id).first()
    
    if not seller:
        raise HTTPException(status_code=404, detail="Seller ID not found in database.")

    # 2. Call the engine (with dummy invoice data)
    dummy_invoice_data = {
        'annual_income': 50000,
        'loan_amount': 10000,
        'credit_score': 650,
        'employment_years': 5,
        'debt_to_income': 0.3
    }
    result = risk_engine.calculate_score(db, seller_id, dummy_invoice_data)
    
    # 3. Save the result to the DB
    seller.composite_score = result["composite_score"]
    db.commit()

    return result