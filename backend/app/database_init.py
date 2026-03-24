import logging
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from app.database import engine
from app import models

logger = logging.getLogger(__name__)

def _add_columns_if_missing(table_name: str, columns: list[tuple[str, str]]):
    """Helper to add multiple columns to a table if they don't exist."""
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

def run_database_maintenance():
    """Main entry point for database setup and schema compatibility checks."""
    logger.info("Initializing database bootstrap...")
    
    # 1. Create any missing tables defined in models.Base
    models.Base.metadata.create_all(bind=engine)

    # 2. Fix Invoices Table
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

    # 3. Fix Users Table (wallet_address removed in favor of linked_wallets)
    _add_columns_if_missing("users", [
        ("email_verified", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("verified_at", "TIMESTAMPTZ"),
        ("is_active", "BOOLEAN NOT NULL DEFAULT TRUE"),
        ("last_login", "TIMESTAMPTZ"),
        ("last_refresh_token_issued_at", "TIMESTAMPTZ"),
        ("two_factor_enabled", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("two_factor_secret", "VARCHAR")
    ])

    # 4. Fix Linked Wallets Table (network metadata added after initial release)
    _add_columns_if_missing("linked_wallets", [
        ("chain_id", "INTEGER DEFAULT 84532"),
        ("network_name", "VARCHAR DEFAULT 'base_sepolia'"),
        # Older DBs may be missing these wallet state flags.
        ("is_primary", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("is_active", "BOOLEAN NOT NULL DEFAULT TRUE"),
        ("is_verified", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ])

    # 5. Fix Repayment Snapshots Table
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

    # 6. Postgres-Specific Logic (Enums, backfills, and performance indexes)
    if engine.dialect.name == "postgresql":
        _run_postgres_specific_maintenance()

    logger.info("Database maintenance complete.")

def _run_postgres_specific_maintenance():
    """Handles migrations using separate transactions to prevent block abortion."""
    
    # Task 1: Update Enum (Independent Transaction)
    with engine.begin() as conn:
        conn.execute(text("""
            DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'userrole') THEN
                    ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'seller';
                END IF;
            END $$;
        """))

    # Task 2: Data Migration (Independent Transaction)
    # We wrap this separately so if it fails, the indexes still get created.
    with engine.begin() as conn:
        try:
            conn.execute(text("UPDATE users SET role = 'seller' WHERE role = 'seller'"))
        except Exception as e:
            logger.warning(f"Role migration skipped: {e}")

    # Task 3: Backfill linked wallet defaults for older rows.
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

    # Task 4: Performance Indexes (Independent Transaction)
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_linked_wallets_user_active 
            ON linked_wallets(user_id, is_active);
        """))
        
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_wallet_nonces_address_unused 
            ON wallet_nonces(wallet_address) WHERE is_used = FALSE;
        """))