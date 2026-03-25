import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

#Use the DATABASE_URL env variable (Online Neon DB)
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

#Otherwise,Use Local Postgres Config 
if not SQLALCHEMY_DATABASE_URL:
    postgres_user = os.getenv("POSTGRES_USER", "postgres")
    postgres_password = quote_plus(os.getenv("POSTGRES_PASSWORD", ""))
    postgres_host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    postgres_port = os.getenv("POSTGRES_PORT", "5432")
    postgres_db = os.getenv("POSTGRES_DB", "invoice_chain_db")

    SQLALCHEMY_DATABASE_URL = (
        f"postgresql+psycopg2://{postgres_user}:{postgres_password}@"
        f"{postgres_host}:{postgres_port}/{postgres_db}"
    )

if not SQLALCHEMY_DATABASE_URL:
    raise ValueError("DATABASE_URL is not set. Add it to backend/.env")

engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()