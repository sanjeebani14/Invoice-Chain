from __future__ import annotations

import argparse
import csv
from pathlib import Path

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    CreditEvent,
    FraudFlag,
    Invoice,
    RepaymentSnapshot,
    User,
    UserRole,
)
from app.services.hashing import generate_invoice_hash


def _pick_seller_id(db: Session) -> int | None:
    seller = (
        db.query(User)
        .filter(User.role.in_([UserRole.SELLER, UserRole.seller]))
        .order_by(User.id.asc())
        .first()
    )
    if seller is not None:
        return int(seller.id)

    fallback = db.query(User).order_by(User.id.asc()).first()
    if fallback is not None:
        return int(fallback.id)

    return None


def _to_float(value: str | None, default: float = 0.0) -> float:
    if value is None:
        return default
    text = str(value).strip()
    if not text:
        return default
    try:
        return float(text)
    except ValueError:
        return default


def _normalize_status(raw_status: str | None) -> str:
    text = (raw_status or "").strip().lower()
    if text == "pending":
        return "pending_review"
    if text == "paid":
        return "approved"
    if text == "overdue":
        return "flagged"
    return "pending_review"


def _clear_invoice_data(db: Session) -> dict[str, int]:
    deleted_credit_events = db.query(CreditEvent).delete(synchronize_session=False)
    deleted_repayment = db.query(RepaymentSnapshot).delete(synchronize_session=False)
    deleted_flags = db.query(FraudFlag).delete(synchronize_session=False)
    deleted_invoices = db.query(Invoice).delete(synchronize_session=False)

    return {
        "credit_events": int(deleted_credit_events or 0),
        "repayment_snapshots": int(deleted_repayment or 0),
        "fraud_flags": int(deleted_flags or 0),
        "invoices": int(deleted_invoices or 0),
    }


def _build_invoice_row(
    row: dict[str, str], row_num: int, seller_id: int | None
) -> Invoice:
    id_invoice = (row.get("id_invoice") or "UNK").strip()
    issued_date = (row.get("issuedDate") or "").strip() or None
    due_date = (row.get("dueDate") or "").strip() or None
    client = (row.get("client") or "Unknown Client").strip() or "Unknown Client"

    amount = _to_float(row.get("total"), 0.0)
    discount = _to_float(row.get("discount"), 0.0)
    tax = _to_float(row.get("tax"), 0.0)
    balance = _to_float(row.get("balance"), 0.0)

    invoice_number = f"INV-{id_invoice}-{row_num:03d}"
    seller_name = f"SeedSeller-{id_invoice}"

    hash_payload = generate_invoice_hash(
        invoice_number=invoice_number,
        seller_name=seller_name,
        client_name=client,
        amount=amount,
        due_date=due_date or "",
        currency="INR",
    )

    return Invoice(
        original_filename=f"seed_invoice_{row_num:03d}.csv",
        file_path=f"uploads/seed_invoice_{row_num:03d}.csv",
        invoice_number=invoice_number,
        seller_name=seller_name,
        client_name=client,
        amount=amount,
        currency="INR",
        issue_date=issued_date,
        due_date=due_date,
        ocr_confidence={
            "invoice_number": 1.0,
            "seller_name": 1.0,
            "client_name": 1.0,
            "amount": 1.0,
            "due_date": 1.0,
            "overall": 1.0,
            "discount": {"value": discount},
            "tax": {"value": tax},
            "balance": {"value": balance},
            "country": {"value": (row.get("country") or "unknown")},
            "service": {"value": (row.get("service") or "unknown")},
            "invoiceStatus": {"value": (row.get("invoiceStatus") or "pending")},
        },
        canonical_hash=hash_payload["hash"],
        is_duplicate=False,
        status=_normalize_status(row.get("invoiceStatus")),
        seller_id=seller_id,
    )


def seed_invoices(dataset_path: Path, limit: int = 100) -> None:
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    db = SessionLocal()
    try:
        deleted = _clear_invoice_data(db)
        seller_id = _pick_seller_id(db)

        invoices: list[Invoice] = []
        with dataset_path.open("r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for idx, row in enumerate(reader, start=1):
                if idx > limit:
                    break
                invoices.append(
                    _build_invoice_row(row=row, row_num=idx, seller_id=seller_id)
                )

        db.add_all(invoices)
        db.commit()

        print("Reset complete.")
        print(f"Deleted: {deleted}")
        print(f"Seeded invoices: {len(invoices)}")
        print(f"Assigned seller_id: {seller_id}")
        print(f"Dataset: {dataset_path}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Delete all invoice data and seed top N rows from dataset."
    )
    parser.add_argument(
        "--dataset",
        default="data/newest_invoices_data.csv",
        help="Path to invoice dataset CSV (relative to backend/)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="How many top rows to seed",
    )

    args = parser.parse_args()

    backend_root = Path(__file__).resolve().parents[1]
    dataset_path = (backend_root / args.dataset).resolve()

    seed_invoices(dataset_path=dataset_path, limit=max(1, args.limit))


if __name__ == "__main__":
    main()
