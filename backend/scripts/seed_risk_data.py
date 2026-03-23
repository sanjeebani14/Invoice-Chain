import pandas as pd
import numpy as np
from app.database import SessionLocal
from app.models import CreditHistory

def seed_from_csv():
    db = SessionLocal()
    df = pd.read_csv("data/Loan_approval_data_2025.csv")
    
    # Take a sample of 1000 to seed your 'Global Population'
    for _, row in df.head(1000).iterrows():
        # Map CSV logic to 0-100 scores
        # Credit Score (300-850) -> 0-100
        norm_credit = int(((row['credit_score'] - 300) / 550) * 100)
        
        # Track record based on loan status and defaults
        track = 100 if row['loan_status'] == 1 else 40
        if row['defaults_on_file'] > 0: track -= 30

        # Basic seller-side metrics
        seller_id = int(row['customer_id'].replace('CUST', ''))
        payment_history = norm_credit
        track_record = max(0, track)
        client_reputation = np.random.randint(60, 95)  # Placeholder for demo
        employment_years = float(row['years_employed'])
        debt_to_income = float(row['debt_to_income_ratio'])

        # Core enterprise + relationship + ESG placeholders
        core_enterprise_rating = np.random.randint(65, 95)  # Buyer quality
        relationship_years = np.random.uniform(1.0, 7.0)
        logistics_consistency = np.random.uniform(80.0, 100.0)
        # ESG on a 0–10 scale, centred above the 4.73 risk threshold
        esg_score = np.random.normal(loc=6.0, scale=1.0)

        history = CreditHistory(
            seller_id=seller_id,
            payment_history_score=payment_history,
            seller_track_record=track_record,
            client_reputation_score=client_reputation,
            employment_years=employment_years,
            debt_to_income=debt_to_income,
            core_enterprise_rating=int(core_enterprise_rating),
            transaction_stability=float(relationship_years),
            logistics_consistency=float(logistics_consistency),
            esg_score=float(max(0.0, min(10.0, esg_score))),
        )
        db.add(history)
    
    db.commit()
    print("Seeded 1000 records from Loan CSV into CreditHistory table.")

if __name__ == "__main__":
    seed_from_csv()