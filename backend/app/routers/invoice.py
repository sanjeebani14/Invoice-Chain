"""
invoice.py  —  Kavya: Invoice Processing Pipeline
All invoice-related API endpoints.
"""

import os
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models import Invoice, FraudFlag
from ..services.ocr import process_invoice_file
from ..services.hashing import generate_invoice_hash
from ..services.duplicate import run_duplicate_detection

router = APIRouter(prefix="/invoices", tags=["Invoice Processing"])

# Local upload folder (replace with S3/IPFS later)
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}
MAX_FILE_SIZE_MB = 10


# ── POST /invoices/upload ─────────────────────────────────────────

@router.post("/upload")
async def upload_invoice(
    file: UploadFile = File(...),
    seller_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Full invoice processing pipeline:
    1. Validate file type & size
    2. Save file locally
    3. Run OCR → extract fields
    4. Generate keccak256 hash
    5. Run duplicate detection
    6. Save to database
    7. Return extracted fields to frontend
    """

    # ── Validate file type ────────────────────────────────────────
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{file_ext}'. Allowed: PDF, PNG, JPG",
        )

    # ── Read file bytes ───────────────────────────────────────────
    file_bytes = await file.read()

    # ── Validate file size ────────────────────────────────────────
    size_mb = len(file_bytes) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({size_mb:.1f} MB). Maximum allowed: {MAX_FILE_SIZE_MB} MB",
        )

    # ── Save file locally ─────────────────────────────────────────
    safe_filename = f"{os.urandom(8).hex()}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    with open(file_path, "wb") as f:
        f.write(file_bytes)

    # ── Run OCR pipeline ──────────────────────────────────────────
    ocr_result = process_invoice_file(file_bytes, file.filename)

    if not ocr_result["success"]:
        raise HTTPException(
            status_code=422,
            detail=f"OCR processing failed: {ocr_result.get('error', 'Unknown error')}",
        )

    fields = ocr_result["fields"]

    # Helper to safely get field value
    def get_val(field_name):
        return fields.get(field_name, {}).get("value")

    def get_conf(field_name):
        return fields.get(field_name, {}).get("confidence", 0.0)

    # ── Generate keccak256 hash ───────────────────────────────────
    hash_result = generate_invoice_hash(
        invoice_number=get_val("invoice_number") or "",
        seller_name=get_val("seller_name") or "",
        client_name=get_val("client_name") or "",
        amount=get_val("amount") or 0,
        due_date=get_val("due_date") or "",
        currency=get_val("currency") or "INR",
    )

    # ── Save invoice to DB (before duplicate check, so we have an ID) ──
    invoice = Invoice(
        original_filename=file.filename,
        file_path=file_path,
        invoice_number=get_val("invoice_number"),
        seller_name=get_val("seller_name"),
        client_name=get_val("client_name"),
        amount=get_val("amount"),
        currency=get_val("currency") or "INR",
        issue_date=str(get_val("issue_date")) if get_val("issue_date") else None,
        due_date=str(get_val("due_date")) if get_val("due_date") else None,
        ocr_confidence={
            "invoice_number": get_conf("invoice_number"),
            "seller_name": get_conf("seller_name"),
            "client_name": get_conf("client_name"),
            "amount": get_conf("amount"),
            "due_date": get_conf("due_date"),
            "overall": ocr_result["overall_confidence"],
        },
        canonical_hash=hash_result["hash"],
        is_duplicate=False,
        status="pending_review",
        seller_id=seller_id,
    )

    # Handle hash collision (same hash already in DB from a previous duplicate check)
    try:
        db.add(invoice)
        db.commit()
        db.refresh(invoice)
    except Exception:
        db.rollback()
        # Hash already exists — definite duplicate
        raise HTTPException(
            status_code=409,
            detail="This invoice has already been submitted to the platform.",
        )

    # ── Run duplicate detection ───────────────────────────────────
    duplicate_result = run_duplicate_detection(
        db=db,
        canonical_hash=hash_result["hash"],
        invoice_number=get_val("invoice_number") or "",
        seller_name=get_val("seller_name") or "",
        client_name=get_val("client_name") or "",
        amount=get_val("amount") or 0,
        new_invoice_id=invoice.id,
    )

    # Update invoice status if duplicate
    if duplicate_result["is_duplicate"]:
        invoice.is_duplicate = True
        invoice.status = "flagged"
        db.commit()

    # ── Return response ───────────────────────────────────────────
    return JSONResponse(
        status_code=200,
        content={
            "invoice_id": invoice.id,
            "filename": file.filename,
            "ocr_fields": {
                "invoice_number": {
                    "value": get_val("invoice_number"),
                    "confidence": get_conf("invoice_number"),
                },
                "seller_name": {
                    "value": get_val("seller_name"),
                    "confidence": get_conf("seller_name"),
                },
                "client_name": {
                    "value": get_val("client_name"),
                    "confidence": get_conf("client_name"),
                },
                "amount": {
                    "value": get_val("amount"),
                    "confidence": get_conf("amount"),
                },
                "currency": {
                    "value": get_val("currency"),
                    "confidence": get_conf("currency"),
                },
                "due_date": {
                    "value": get_val("due_date"),
                    "confidence": get_conf("due_date"),
                },
            },
            "hash": hash_result["hash"],
            "canonical_string": hash_result["canonical_string"],
            "overall_ocr_confidence": ocr_result["overall_confidence"],
            "duplicate_check": duplicate_result,
            "status": invoice.status,
        },
    )


# ── GET /invoices ─────────────────────────────────────────────────

@router.get("/")
def list_invoices(
    status: Optional[str] = None,
    seller_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """Get all invoices with optional filtering by status or seller."""
    query = db.query(Invoice)
    if status:
        query = query.filter(Invoice.status == status)
    if seller_id:
        query = query.filter(Invoice.seller_id == seller_id)
    invoices = query.order_by(Invoice.created_at.desc()).offset(skip).limit(limit).all()
    return {"invoices": [_invoice_to_dict(inv) for inv in invoices], "total": query.count()}


# ── GET /invoices/{invoice_id} ────────────────────────────────────

@router.get("/{invoice_id}")
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    """Get a single invoice by ID."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _invoice_to_dict(invoice)


# ── PUT /invoices/{invoice_id} — manual field correction ─────────

@router.put("/{invoice_id}")
def update_invoice_fields(
    invoice_id: int,
    invoice_number: Optional[str] = None,
    seller_name: Optional[str] = None,
    client_name: Optional[str] = None,
    amount: Optional[float] = None,
    due_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Allow SME to manually correct OCR-extracted fields.
    Recalculates hash after correction.
    """
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Update only provided fields
    if invoice_number is not None:
        invoice.invoice_number = invoice_number
    if seller_name is not None:
        invoice.seller_name = seller_name
    if client_name is not None:
        invoice.client_name = client_name
    if amount is not None:
        invoice.amount = amount
    if due_date is not None:
        invoice.due_date = due_date

    # Recalculate hash with corrected fields
    hash_result = generate_invoice_hash(
        invoice_number=invoice.invoice_number or "",
        seller_name=invoice.seller_name or "",
        client_name=invoice.client_name or "",
        amount=invoice.amount or 0,
        due_date=invoice.due_date or "",
        currency=invoice.currency or "INR",
    )
    invoice.canonical_hash = hash_result["hash"]
    invoice.status = "pending_review"

    db.commit()
    db.refresh(invoice)
    return {"message": "Invoice updated successfully", "invoice": _invoice_to_dict(invoice)}


# ── PUT /invoices/{invoice_id}/review — admin approval ───────────

@router.put("/{invoice_id}/review")
def review_invoice(
    invoice_id: int,
    action: str,          # "approve" | "reject"
    admin_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Admin endpoint to approve or reject a flagged invoice."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if action == "approve":
        invoice.status = "approved"
        invoice.is_duplicate = False
        # Resolve any fraud flags
        db.query(FraudFlag).filter(
            FraudFlag.invoice_id == invoice_id,
            FraudFlag.is_resolved == False,
        ).update({"is_resolved": True, "resolved_by": admin_id})
    elif action == "reject":
        invoice.status = "rejected"
    else:
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")

    db.commit()
    return {"message": f"Invoice {action}d successfully", "status": invoice.status}


# ── GET /invoices/flagged — admin fraud queue ─────────────────────

@router.get("/admin/flagged")
def get_flagged_invoices(db: Session = Depends(get_db)):
    """Get all invoices flagged for fraud review."""
    flagged = (
        db.query(Invoice)
        .filter(Invoice.is_duplicate == True)
        .order_by(Invoice.created_at.desc())
        .all()
    )
    return {"flagged_invoices": [_invoice_to_dict(inv) for inv in flagged]}


# ── Helper ────────────────────────────────────────────────────────

def _invoice_to_dict(invoice: Invoice) -> dict:
    return {
        "id": invoice.id,
        "original_filename": invoice.original_filename,
        "invoice_number": invoice.invoice_number,
        "seller_name": invoice.seller_name,
        "client_name": invoice.client_name,
        "amount": invoice.amount,
        "currency": invoice.currency,
        "issue_date": invoice.issue_date,
        "due_date": invoice.due_date,
        "canonical_hash": invoice.canonical_hash,
        "is_duplicate": invoice.is_duplicate,
        "status": invoice.status,
        "ocr_confidence": invoice.ocr_confidence,
        "created_at": str(invoice.created_at),
    }
