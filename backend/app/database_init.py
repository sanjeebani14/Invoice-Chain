import logging
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from app.database import engine
from app import models

logger = logging.getLogger(__name__)

def _add_columns_if_missing(table_name: str, columns: list[tuple[str, str]]):
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        return

    existing = {c["name"] for c in inspector.get_columns(table_name)}
    statements = [
        f"ALTER TABLE {table_name} ADD COLUMN {name} {definition}"
        for name, definition in columns
        if name not in existing
    ]

    if statements:
        with engine.begin() as conn:
            for stmt in statements:
                try:
                    conn.execute(text(stmt))
                except Exception as e:
                    logger.warning(f"Could not add column to {table_name}: {e}")

#Database maintenance
def run_database_maintenance():
    logger.info("Initializing database bootstrap...")
    
    # Create any missing tables defined in models.Base
    models.Base.metadata.create_all(bind=engine)

    # Fix Invoices Table
    _add_columns_if_missing("invoices", [
        ("sector", "VARCHAR"),
        ("financing_type", "VARCHAR DEFAULT 'fixed'"),
        ("ask_price", "DOUBLE PRECISION"),
        ("share_price", "DOUBLE PRECISION"),
        ("min_bid_increment", "DOUBLE PRECISION"),
        ("supply", "INTEGER DEFAULT 1"),
        ("token_id", "VARCHAR"),
        ("escrow_status", "VARCHAR NOT NULL DEFAULT 'not_applicable'"),
        ("escrow_reference", "VARCHAR"),
        ("escrow_held_at", "TIMESTAMPTZ"),
        ("escrow_released_at", "TIMESTAMPTZ")
    ])

    # Fix Users Table 
    _add_columns_if_missing("users", [
        ("email_verified", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("verified_at", "TIMESTAMPTZ"),
        ("is_active", "BOOLEAN NOT NULL DEFAULT TRUE"),
        ("last_login", "TIMESTAMPTZ"),
        ("last_refresh_token_issued_at", "TIMESTAMPTZ"),
        ("two_factor_enabled", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("two_factor_secret", "VARCHAR")
    ])

    # Fix Linked Wallets Table 
    _add_columns_if_missing("linked_wallets", [
        ("chain_id", "INTEGER DEFAULT 84532"),
        ("network_name", "VARCHAR DEFAULT 'base_sepolia'"),
        ("is_primary", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("is_active", "BOOLEAN NOT NULL DEFAULT TRUE"),
        ("is_verified", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ])

    # Fix Repayment Snapshots Table
    _add_columns_if_missing("repayment_snapshots", [
        ("invoice_id", "INTEGER"),
        ("investor_id", "INTEGER"),
        ("seller_id", "INTEGER"),
        ("funded_amount", "DOUBLE PRECISION DEFAULT 0"),
        ("repayment_amount", "DOUBLE PRECISION"),
        ("funded_at", "TIMESTAMPTZ"),
        ("repaid_at", "TIMESTAMPTZ"),
        ("impact_score", "DOUBLE PRECISION"),
        ("weighted_average_days_late", "DOUBLE PRECISION"),
        ("industry_sector", "VARCHAR"),
        ("geography", "VARCHAR"),
        ("created_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()"),
        ("updated_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()")
    ])

    if engine.dialect.name == "postgresql":
        _run_postgres_specific_maintenance()

    logger.info("Database maintenance complete.")

#Handles migrations using separate transactions to prevent block abortion.
def _run_postgres_specific_maintenance():
    
    
    # Update Enum 
    with engine.begin() as conn:
        conn.execute(text("""
            DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'userrole') THEN
                    ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'seller';
                END IF;
            END $$;
        """))

    # Data Migration 
    with engine.begin() as conn:
        try:
            conn.execute(text("UPDATE users SET role = 'seller' WHERE role = 'seller'"))
        except Exception as e:
            logger.warning(f"Role migration skipped: {e}")

    # Backfill linked wallet defaults for older rows.
    with engine.begin() as conn:
        try:
            conn.execute(text("""
                UPDATE linked_wallets
                SET chain_id = COALESCE(chain_id, 84532),
                    network_name = COALESCE(network_name, 'base_sepolia'),
                    is_primary = COALESCE(is_primary, FALSE)
            """))
            conn.execute(text("ALTER TABLE linked_wallets ALTER COLUMN chain_id SET DEFAULT 84532"))
            conn.execute(text("ALTER TABLE linked_wallets ALTER COLUMN network_name SET DEFAULT 'base_sepolia'"))
            conn.execute(text("ALTER TABLE linked_wallets ALTER COLUMN is_primary SET DEFAULT FALSE"))
            conn.execute(text("ALTER TABLE linked_wallets ALTER COLUMN is_primary SET NOT NULL"))
        except Exception as e:
            logger.warning(f"Linked wallet backfill/default migration skipped: {e}")

    # Performance Indexes 
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_linked_wallets_user_active 
            ON linked_wallets(user_id, is_active);
        """))
        
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_wallet_nonces_address_unused 
            ON wallet_nonces(wallet_address) WHERE is_used = FALSE;
        """))