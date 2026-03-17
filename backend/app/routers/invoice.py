import os
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from ..database import get_db
from ..models import Invoice, FraudFlag, User, UserRole
from ..services.ocr import process_invoice_file
from ..services.hashing import generate_invoice_hash
from ..services.duplicate import run_duplicate_detection
from ..services.fraud_anomaly import InvoiceAnomalyService
from ..auth.dependencies import get_current_user, require_sme, require_admin

router = APIRouter(prefix="/invoices", tags=["Invoice Processing"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}
MAX_FILE_SIZE_MB = 10
anomaly_service = InvoiceAnomalyService()


class InvoiceUpdatePayload(BaseModel):
    invoice_number: Optional[str] = None
    seller_name: Optional[str] = None
    client_name: Optional[str] = None
    amount: Optional[float] = None
    due_date: Optional[str] = None
    sector: Optional[str] = None
    financing_type: Optional[str] = None
    ask_price: Optional[float] = None
    share_price: Optional[float] = None
    min_bid_increment: Optional[float] = None


# ── POST /invoices/upload ── SME only ────────────────────────────────────────

@router.post("/upload")
async def upload_invoice(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sme),
):

    # ── Validate file type ────────────────────────────────────────────────────
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{file_ext}'. Allowed: PDF, PNG, JPG",
        )

    # ── Read & validate file size ─────────────────────────────────────────────
    file_bytes = await file.read()
    size_mb = len(file_bytes) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({size_mb:.1f} MB). Maximum: {MAX_FILE_SIZE_MB} MB",
        )

    # ── Save file locally ─────────────────────────────────────────────────────
    safe_filename = f"{os.urandom(8).hex()}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    with open(file_path, "wb") as f:
        f.write(file_bytes)

    # ── Run OCR ───────────────────────────────────────────────────────────────
    ocr_result = process_invoice_file(file_bytes, file.filename)
    if not ocr_result["success"]:
        raise HTTPException(
            status_code=422,
            detail=f"OCR processing failed: {ocr_result.get('error', 'Unknown error')}",
        )

    fields = ocr_result["fields"]

    def get_val(field_name):
        return fields.get(field_name, {}).get("value")

    def get_conf(field_name):
        return fields.get(field_name, {}).get("confidence", 0.0)

    # ── Generate hash ─────────────────────────────────────────────────────────
    hash_result = generate_invoice_hash(
        invoice_number=get_val("invoice_number") or "",
        seller_name=get_val("seller_name") or "",
        client_name=get_val("client_name") or "",
        amount=get_val("amount") or 0,
        due_date=get_val("due_date") or "",
        currency=get_val("currency") or "INR",
    )

    # ── Save to DB ───────────────────────────────────────────────────────────
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
        seller_id=current_user.id,
    )

    try:
        db.add(invoice)
        db.commit()
        db.refresh(invoice)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This invoice has already been submitted.",
        )

    # ── Duplicate detection ───────────────────────────────────────────────────
    duplicate_result = run_duplicate_detection(
        db=db,
        canonical_hash=hash_result["hash"],
        invoice_number=get_val("invoice_number") or "",
        seller_name=get_val("seller_name") or "",
        client_name=get_val("client_name") or "",
        amount=get_val("amount") or 0,
        new_invoice_id=invoice.id,
    )

    if duplicate_result["is_duplicate"]:
        invoice.is_duplicate = True
        invoice.status = "flagged"
        db.commit()

    return JSONResponse(status_code=200, content={
        "invoice_id": invoice.id,
        "filename": file.filename,
        "ocr_fields": {
            "invoice_number": {"value": get_val("invoice_number"), "confidence": get_conf("invoice_number")},
            "seller_name":    {"value": get_val("seller_name"),    "confidence": get_conf("seller_name")},
            "client_name":    {"value": get_val("client_name"),    "confidence": get_conf("client_name")},
            "amount":         {"value": get_val("amount"),         "confidence": get_conf("amount")},
            "currency":       {"value": get_val("currency"),       "confidence": get_conf("currency")},
            "due_date":       {"value": get_val("due_date"),       "confidence": get_conf("due_date")},
        },
        "hash": hash_result["hash"],
        "canonical_string": hash_result["canonical_string"],
        "overall_ocr_confidence": ocr_result["overall_confidence"],
        "duplicate_check": duplicate_result,
        "status": invoice.status,
        "uploaded_by": current_user.email,
    })


# ── GET /invoices/ ── any logged-in user ─────────────────────────────────────

@router.get("/")
def list_invoices(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),   # must be logged in
):
    """
    SMEs see only their own invoices.
    Admins see all invoices.
    """
    query = db.query(Invoice)

    # Admins see everything, SMEs only see their own
    if current_user.role != UserRole.ADMIN:
        query = query.filter(Invoice.seller_id == current_user.id)

    if status:
        query = query.filter(Invoice.status == status)

    invoices = query.order_by(Invoice.created_at.desc()).offset(skip).limit(limit).all()
    return {"invoices": [_invoice_to_dict(inv) for inv in invoices], "total": query.count()}


@router.get("/marketplace")
def list_marketplace_invoices(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Investor marketplace feed. Investors and admins can see listed inventory.
    """
    if current_user.role not in {UserRole.INVESTOR, UserRole.ADMIN}:
        raise HTTPException(status_code=403, detail="Only investors can access marketplace invoices")

    listed_statuses = ["approved", "listed", "minted"]
    query = (
        db.query(Invoice)
        .filter(Invoice.status.in_(listed_statuses))
        .order_by(Invoice.created_at.desc())
    )

    invoices = query.offset(skip).limit(limit).all()
    return {"invoices": [_invoice_to_dict(inv) for inv in invoices], "total": query.count()}


# ── GET /invoices/{invoice_id} ── owner or admin ──────────────────────────────

@router.get("/{invoice_id}")
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),   # must be logged in
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Only owner or admin can view
    if invoice.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorised to view this invoice")

    return _invoice_to_dict(invoice)


# ── PUT /invoices/{invoice_id} ── owner only ──────────────────────────────────

@router.put("/{invoice_id}")
def update_invoice_fields(
    invoice_id: int,
    payload: InvoiceUpdatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sme),        # SME only
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Only the owner can edit their invoice
    if invoice.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorised to edit this invoice")

    if payload.invoice_number is not None:
        invoice.invoice_number = payload.invoice_number
    if payload.seller_name is not None:
        invoice.seller_name = payload.seller_name
    if payload.client_name is not None:
        invoice.client_name = payload.client_name
    if payload.amount is not None:
        invoice.amount = payload.amount
    if payload.due_date is not None:
        invoice.due_date = payload.due_date
    if payload.sector is not None:
        invoice.sector = payload.sector
    if payload.financing_type is not None:
        invoice.financing_type = payload.financing_type
    if payload.ask_price is not None:
        invoice.ask_price = payload.ask_price
    if payload.share_price is not None:
        invoice.share_price = payload.share_price
    if payload.min_bid_increment is not None:
        invoice.min_bid_increment = payload.min_bid_increment

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
    return {"message": "Invoice updated", "invoice": _invoice_to_dict(invoice)}


# ── PUT /invoices/{invoice_id}/review ── admin only ──────────────────────────

@router.put("/{invoice_id}/review")
def review_invoice(
    invoice_id: int,
    action: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Admin approves or rejects an invoice."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if action == "approve":
        anomaly_result = anomaly_service.evaluate_invoice(db, invoice)

        if anomaly_result.should_flag:
            invoice.status = "flagged"
            invoice.is_duplicate = False
            db.add(
                FraudFlag(
                    invoice_id=invoice.id,
                    seller_id=invoice.seller_id,
                    reason=" | ".join(anomaly_result.reasons),
                    severity=anomaly_result.severity,
                    is_resolved=False,
                )
            )
            db.commit()
            return {
                "message": "Invoice flagged by anomaly model for manual review.",
                "status": invoice.status,
                "anomaly": anomaly_result.to_dict(),
            }

        invoice.status = "approved"
        invoice.is_duplicate = False
        db.query(FraudFlag).filter(
            FraudFlag.invoice_id == invoice_id,
            FraudFlag.is_resolved == False,
        ).update({"is_resolved": True, "resolved_by": current_user.id})
    elif action == "reject":
        invoice.status = "rejected"
    else:
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")

    db.commit()
    return {"message": f"Invoice {action}d", "status": invoice.status}


# ── GET /invoices/admin/flagged ── admin only ─────────────────────────────────

@router.get("/admin/flagged")
def get_flagged_invoices(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    flagged = (
        db.query(Invoice)
        .filter((Invoice.is_duplicate == True) | (Invoice.status == "flagged"))
        .order_by(Invoice.created_at.desc())
        .all()
    )
    return {"flagged_invoices": [_invoice_to_dict(inv) for inv in flagged]}


# ── Helper ────────────────────────────────────────────────────────────────────

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
        "sector": invoice.sector,
        "financing_type": invoice.financing_type,
        "ask_price": invoice.ask_price,
        "share_price": invoice.share_price,
        "min_bid_increment": invoice.min_bid_increment,
        "canonical_hash": invoice.canonical_hash,
        "is_duplicate": invoice.is_duplicate,
        "status": invoice.status,
        "ocr_confidence": invoice.ocr_confidence,
        "seller_id": invoice.seller_id,
        "created_at": str(invoice.created_at),
    }