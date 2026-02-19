from fastapi import FastAPI
from app.database import engine, Base
from app import models

# This command creates the tables in Docker as soon as the app starts!
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="InvoiceChain API")

@app.get("/")
def read_root():
    return {"message": "Infrastructure is Live", "tables": "Created Successfully"}

# Placeholder for your Risk Scoring logic
@app.get("/risk/score/{seller_id}")
def get_score(seller_id: int):
    return {"seller_id": seller_id, "score": 75, "status": "Healthy"}