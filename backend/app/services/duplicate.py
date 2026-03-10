"""
duplicate.py  —  Kavya: Invoice Processing Pipeline
Duplicate invoice detection using exact hash matching + fuzzy matching.
"""

from sqlalchemy.orm import Session
from rapidfuzz import fuzz
from ..models import Invoice, FraudFlag


# ── Check 1: Exact hash match ─────────────────────────────────────

def check_exact_duplicate(db: Session, canonical_hash: str) -> Invoice | None:
    """
    Query the database for an invoice with the exact same keccak256 hash.
    If found, it's a definite duplicate.
    """
    return db.query(Invoice).filter(Invoice.canonical_hash == canonical_hash).first()


# ── Check 2: Fuzzy match ──────────────────────────────────────────

def check_fuzzy_duplicate(
    db: Session,
    invoice_number: str,
    seller_name: str,
    client_name: str,
    amount: float,
    threshold: int = 90,        # 90% similarity = suspicious
) -> Invoice | None:
    """
    Check if there's a "near duplicate" — same invoice with tiny changes
    (e.g., amount changed from 50000 to 50001 to fool hash detection).

    Uses fuzzy string matching on invoice_number + seller + client.
    Amount must also be within 1% to trigger.
    """
    # Only check recent invoices — don't scan entire DB for performance
    recent_invoices = (
        db.query(Invoice)
        .filter(Invoice.is_duplicate == False)
        .order_by(Invoice.created_at.desc())
        .limit(500)
        .all()
    )

    for existing in recent_invoices:
        # Score how similar the invoice number is
        inv_score = fuzz.ratio(
            str(invoice_number).upper(),
            str(existing.invoice_number or "").upper(),
        )
        # Score how similar the seller+client combination is
        name_score = fuzz.ratio(
            f"{seller_name} {client_name}".upper(),
            f"{existing.seller_name or ''} {existing.client_name or ''}".upper(),
        )

        # Amount within 1%?
        amount_similar = False
        if existing.amount and amount:
            diff_pct = abs(existing.amount - amount) / max(existing.amount, amount)
            amount_similar = diff_pct < 0.01   # less than 1% difference

        # If invoice number AND names are very similar AND amounts match → suspicious
        if inv_score >= threshold and name_score >= threshold and amount_similar:
            return existing

    return None


# ── Log fraud flag ────────────────────────────────────────────────

def create_fraud_flag(
    db: Session,
    invoice_id: int,
    reason: str,
    severity: str = "HIGH",
) -> FraudFlag:
    """
    Create a fraud flag record for admin review.
    Severity: "HIGH" | "MEDIUM" | "LOW"
    """
    flag = FraudFlag(
        invoice_id=invoice_id,
        reason=reason,
        severity=severity,
        is_resolved=False,
    )
    db.add(flag)
    db.commit()
    db.refresh(flag)
    return flag


# ── Main entry point ──────────────────────────────────────────────

def run_duplicate_detection(
    db: Session,
    canonical_hash: str,
    invoice_number: str,
    seller_name: str,
    client_name: str,
    amount: float,
    new_invoice_id: int,
) -> dict:
    """
    Run all duplicate checks on a newly uploaded invoice.

    Returns:
      {
        "is_duplicate": True/False,
        "duplicate_type": "exact" | "fuzzy" | None,
        "matched_invoice_id": 42 or None,
        "fraud_flag_id": 7 or None,
        "message": "Human readable explanation"
      }
    """

    # Check 1: Exact hash match
    exact_match = check_exact_duplicate(db, canonical_hash)
    if exact_match:
        flag = create_fraud_flag(
            db=db,
            invoice_id=new_invoice_id,
            reason=f"Exact duplicate of Invoice ID {exact_match.id} "
                   f"(Invoice #{exact_match.invoice_number}). "
                   f"Identical keccak256 hash detected.",
            severity="HIGH",
        )
        return {
            "is_duplicate": True,
            "duplicate_type": "exact",
            "matched_invoice_id": exact_match.id,
            "fraud_flag_id": flag.id,
            "message": (
                f"This invoice is an exact duplicate of Invoice #{exact_match.invoice_number} "
                f"already on the platform."
            ),
        }

    # Check 2: Fuzzy match
    fuzzy_match = check_fuzzy_duplicate(
        db=db,
        invoice_number=invoice_number,
        seller_name=seller_name,
        client_name=client_name,
        amount=amount,
    )
    if fuzzy_match:
        flag = create_fraud_flag(
            db=db,
            invoice_id=new_invoice_id,
            reason=f"Suspected fuzzy duplicate of Invoice ID {fuzzy_match.id} "
                   f"(Invoice #{fuzzy_match.invoice_number}). "
                   f"High similarity in invoice number, parties, and amount.",
            severity="MEDIUM",
        )
        return {
            "is_duplicate": True,
            "duplicate_type": "fuzzy",
            "matched_invoice_id": fuzzy_match.id,
            "fraud_flag_id": flag.id,
            "message": (
                f"This invoice is very similar to Invoice #{fuzzy_match.invoice_number}. "
                f"Flagged for manual review."
            ),
        }

    # All clear
    return {
        "is_duplicate": False,
        "duplicate_type": None,
        "matched_invoice_id": None,
        "fraud_flag_id": None,
        "message": "No duplicates detected. Invoice is clean.",
    }