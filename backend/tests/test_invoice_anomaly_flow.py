from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import get_db
from app.models import Base, FraudFlag, Invoice, User, UserRole
from app.routers import invoice as invoice_router
from app.services.fraud_anomaly import InvoiceAnomalyResult, InvoiceAnomalyService


TEST_DB_URL = "sqlite:///./test_invoice_anomaly.db"
DATASET_PATH = Path(__file__).resolve().parents[1] / "data" / "newest_invoices_data.csv"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

app = FastAPI()
app.include_router(invoice_router.router, prefix="/api/v1/invoice", tags=["Invoice Processing"])


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


class DummyAdmin:
    id = 1
    role = UserRole.ADMIN


app.dependency_overrides[invoice_router.require_admin] = lambda: DummyAdmin()


def setup_module(module):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def teardown_module(module):
    Base.metadata.drop_all(bind=engine)


def _seed_user_and_invoice(db):
    db.query(FraudFlag).delete()
    db.query(Invoice).delete()
    db.query(User).delete()
    db.commit()

    user = User(
        email="admin@test.com",
        password_hash="hashed",
        role=UserRole.ADMIN,
        full_name="Admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    invoice = Invoice(
        original_filename="invoice.pdf",
        file_path="seed/invoice.pdf",
        invoice_number="INV-001",
        seller_name="Seller A",
        client_name="Buyer X",
        amount=1000.0,
        currency="INR",
        issue_date="2026-03-01",
        due_date="2026-03-31",
        canonical_hash="hash-001",
        status="pending_review",
        seller_id=42,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    return user, invoice


def _seed_invoices_from_dataset(
    db,
    seller_id: int,
    max_rows: int = 120,
) -> None:
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Dataset not found at {DATASET_PATH}")

    frame = pd.read_csv(DATASET_PATH).head(max_rows)

    for idx, row in frame.iterrows():
        issued = pd.to_datetime(row.get("issuedDate"), errors="coerce")
        due = pd.to_datetime(row.get("dueDate"), errors="coerce")

        issue_date = issued.strftime("%Y-%m-%d") if pd.notna(issued) else "2026-01-01"
        due_date = due.strftime("%Y-%m-%d") if pd.notna(due) else issue_date

        amount = float(pd.to_numeric(row.get("total"), errors="coerce") or 0.0)
        discount = float(pd.to_numeric(row.get("discount"), errors="coerce") or 0.0)
        tax = float(pd.to_numeric(row.get("tax"), errors="coerce") or 0.0)
        balance = float(pd.to_numeric(row.get("balance"), errors="coerce") or 0.0)

        db.add(
            Invoice(
                original_filename=f"seed_{idx}.json",
                file_path=f"seed/data_row_{idx}.json",
                invoice_number=f"SEED-{idx}",
                seller_name=f"Dataset Seller {seller_id}",
                client_name=str(row.get("client") or "Unknown Client"),
                amount=amount,
                currency="INR",
                issue_date=issue_date,
                due_date=due_date,
                canonical_hash=f"seed-hash-{seller_id}-{idx}",
                status="approved",
                seller_id=seller_id,
                ocr_confidence={
                    "discount": discount,
                    "tax": tax,
                    "balance": balance,
                    "invoiceStatus": str(row.get("invoiceStatus") or "Pending"),
                    "country": str(row.get("country") or "Unknown"),
                    "service": str(row.get("service") or "Unknown"),
                },
            )
        )

    db.commit()


def test_anomaly_service_insufficient_history_returns_safe_result():
    db = TestingSessionLocal()
    try:
        # No history for this seller.
        invoice = Invoice(
            id=999,
            original_filename="single.pdf",
            file_path="seed/single.pdf",
            amount=1200.0,
            issue_date="2026-03-10",
            due_date="2026-03-20",
            seller_id=777,
        )
        service = InvoiceAnomalyService(min_history=5)

        result = service.evaluate_invoice(db, invoice)

        assert result.should_flag is False
        assert result.model_label == 1
        assert "Insufficient seller history" in " ".join(result.reasons)
    finally:
        db.close()


def test_review_endpoint_flags_invoice_when_anomaly_detected():
    db = TestingSessionLocal()
    try:
        _, invoice = _seed_user_and_invoice(db)

        original = invoice_router.anomaly_service
        invoice_router.anomaly_service = InvoiceAnomalyService()
        invoice_router.anomaly_service.evaluate_invoice = lambda _db, _inv: InvoiceAnomalyResult(
            should_flag=True,
            severity="HIGH",
            model_label=-1,
            anomaly_score=-0.4,
            global_anomaly_score=0.52,
            supervised_probability=0.81,
            amount_velocity_zscore=4.2,
            benford_deviation=0.31,
            net_delta_abs=340.0,
            reasons=["Synthetic anomaly for integration test"],
        )

        response = client.put(f"/api/v1/invoice/invoices/{invoice.id}/review", params={"action": "approve"})
        assert response.status_code == 200

        db.refresh(invoice)
        assert invoice.status == "flagged"

        flag = db.query(FraudFlag).filter(FraudFlag.invoice_id == invoice.id).first()
        assert flag is not None
        assert flag.severity == "HIGH"
        assert "Synthetic anomaly" in flag.reason
    finally:
        invoice_router.anomaly_service = original
        db.close()


def test_review_endpoint_approves_when_no_anomaly_and_resolves_existing_flags():
    db = TestingSessionLocal()
    try:
        _, invoice = _seed_user_and_invoice(db)

        pending_flag = FraudFlag(
            invoice_id=invoice.id,
            seller_id=invoice.seller_id,
            reason="Old duplicate warning",
            severity="LOW",
            is_resolved=False,
        )
        db.add(pending_flag)
        db.commit()
        db.refresh(pending_flag)

        original = invoice_router.anomaly_service
        invoice_router.anomaly_service = InvoiceAnomalyService()
        invoice_router.anomaly_service.evaluate_invoice = lambda _db, _inv: InvoiceAnomalyResult(
            should_flag=False,
            severity="LOW",
            model_label=1,
            anomaly_score=0.2,
            global_anomaly_score=0.01,
            supervised_probability=0.09,
            amount_velocity_zscore=0.1,
            benford_deviation=0.02,
            net_delta_abs=2.0,
            reasons=["Normal behavior"],
        )

        response = client.put(f"/api/v1/invoice/invoices/{invoice.id}/review", params={"action": "approve"})
        assert response.status_code == 200

        db.refresh(invoice)
        db.refresh(pending_flag)

        assert invoice.status == "approved"
        assert pending_flag.is_resolved is True
        assert pending_flag.resolved_by == DummyAdmin.id
    finally:
        invoice_router.anomaly_service = original
        db.close()


def test_anomaly_service_detects_extreme_amount_outlier():
    db = TestingSessionLocal()
    try:
        seller_id = 900

        _seed_invoices_from_dataset(db, seller_id=seller_id, max_rows=60)

        base_time = datetime.utcnow()

        target = Invoice(
            id=10_000,
            original_filename="target.json",
            file_path="seed/target.json",
            invoice_number="TARGET-1",
            seller_name="Seller Outlier",
            client_name="Buyer Outlier",
            amount=350_000,
            currency="INR",
            issue_date=(base_time + timedelta(days=31)).strftime("%Y-%m-%d"),
            due_date=(base_time + timedelta(days=61)).strftime("%Y-%m-%d"),
            canonical_hash="target-hash-1",
            status="pending_review",
            seller_id=seller_id,
            created_at=base_time + timedelta(days=31),
            ocr_confidence={
                "discount": 45_000,
                "tax": 52_000,
                "balance": 390_000,
                "invoiceStatus": "Overdue",
                "country": "Ghana",
                "service": "AI Solution",
            },
        )

        service = InvoiceAnomalyService(min_history=20, contamination=0.1)
        result = service.evaluate_invoice(db, target)

        assert result.model_label == -1
        assert result.should_flag is True
    finally:
        db.close()
