import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Load the variables from your .env file
load_dotenv()

# Use os.getenv to fetch the password securely
DB_USER = os.getenv("POSTGRES_USER", "sanjeebani")
DB_PASS = os.getenv("POSTGRES_PASSWORD")
DB_NAME = os.getenv("POSTGRES_DB", "invoice_chain_db")
DB_HOST = "localhost"

SQLALCHEMY_DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:5432/{DB_NAME}"

engine = create_engine(SQLALCHEMY_DATABASE_URL)

# Each request gets its own session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# All your models will inherit from this Base class
Base = declarative_base()

# Dependency to get a DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()