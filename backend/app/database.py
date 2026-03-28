import os
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus
from urllib.parse import urlsplit
from urllib.parse import urlunsplit

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# Use the DATABASE_URL env variable (Online Neon DB)
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

# Otherwise,Use Local Postgres Config
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


def _is_local_postgres(url: str) -> bool:
    lowered = url.lower()
    if "sqlite" in lowered:
        return True
    if "@" not in lowered:
        return False
    host = lowered.rsplit("@", 1)[1].split("/", 1)[0]
    host = host.split(":", 1)[0]
    return host in {"localhost", "127.0.0.1", "0.0.0.0", "db"}


def _ensure_sslmode_if_needed(url: str) -> str:
    """Keep local DB untouched; ensure sslmode=require for remote Postgres URLs."""
    lowered = url.lower()
    if not lowered.startswith("postgresql"):
        return url
    if _is_local_postgres(url):
        return url
    if "sslmode=" in lowered:
        return url

    parts = urlsplit(url)
    if parts.query:
        query = f"{parts.query}&sslmode=require"
    else:
        query = "sslmode=require"
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))


normalized_database_url = _ensure_sslmode_if_needed(SQLALCHEMY_DATABASE_URL)

engine_kwargs: dict[str, Any] = {
    "pool_pre_ping": True,
    "pool_recycle": int(os.getenv("DB_POOL_RECYCLE_SECONDS", "1800")),
    "pool_size": int(os.getenv("DB_POOL_SIZE", "5")),
    "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "10")),
    "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT_SECONDS", "30")),
}

if not _is_local_postgres(normalized_database_url):

    engine_kwargs["connect_args"] = {
        "keepalives": 1,
        "keepalives_idle": int(os.getenv("DB_KEEPALIVES_IDLE", "30")),
        "keepalives_interval": int(os.getenv("DB_KEEPALIVES_INTERVAL", "10")),
        "keepalives_count": int(os.getenv("DB_KEEPALIVES_COUNT", "5")),
    }

engine = create_engine(normalized_database_url, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
