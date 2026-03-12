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

        history = CreditHistory(
            seller_id=int(row['customer_id'].replace('CUST', '')),
            payment_history_score=norm_credit,
            seller_track_record=max(0, track),
            client_reputation_score=np.random.randint(60, 95) # Placeholder for demo
        )
        db.add(history)
    
    db.commit()
    print("Seeded 1000 records from Loan CSV into CreditHistory table.")

if __name__ == "__main__":
    seed_from_csv()