import os
from datetime import date, datetime, timezone
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from ..database import get_db
from .. import models
from ..models import Invoice, FraudFlag, User, UserRole
from ..services.ocr import process_invoice_file
from ..services.hashing import generate_invoice_hash
from ..services.duplicate import run_duplicate_detection
from ..services.fraud_anomaly import InvoiceAnomalyService
from ..services.minting import get_invoice_minting_service
from ..auth.dependencies import get_current_user, require_sme, require_admin

router = APIRouter(prefix="/invoices", tags=["Invoice Processing"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}
MAX_FILE_SIZE_MB = 10
anomaly_service = InvoiceAnomalyService()
minting_service = get_invoice_minting_service()


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
    supply: Optional[int] = None  # 1 for whole invoice, N for N fractional shares


class MintInvoicePayload(BaseModel):
    recipient_address: str
    ipfs_uri: Optional[str] = ""
    supply: Optional[int] = None


class ValidateFractionalPayload(BaseModel):
    amount: float
    share_price: float
    num_shares: int


class SettleInvoicePayload(BaseModel):
    repayment_amount: Optional[float] = None
    notes: Optional[str] = None


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
    if payload.supply is not None:
        if payload.supply < 1:
            raise HTTPException(status_code=400, detail="Supply must be >= 1")
        invoice.supply = payload.supply

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


def _parse_date(raw: Optional[str]) -> Optional[date]:
    if not raw:
        return None

    value = raw.strip()
    if not value:
        return None

    formats = ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y"]
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        pass

    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _to_upload_url(file_path: Optional[str]) -> Optional[str]:
    if not file_path:
        return None
    filename = os.path.basename(file_path)
    if not filename:
        return None
    return f"/uploads/{filename}"


def _settlement_event_type(days_late: int) -> str:
    if days_late <= 0:
        return "ON_TIME_PAYMENT"
    if days_late <= 30:
        return "LATE_30"
    if days_late <= 60:
        return "LATE_60"
    return "LATE_90_PLUS"


@router.get("/admin/pending-review")
def list_pending_invoices_for_admin(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ = current_user
    query = (
        db.query(Invoice)
        .filter(Invoice.status.in_(["pending_review", "flagged"]))
        .order_by(Invoice.created_at.desc())
    )

    invoices = query.offset(skip).limit(limit).all()
    rows = []
    for inv in invoices:
        duplicate_count = 0
        if inv.invoice_number:
            duplicate_count = (
                db.query(Invoice)
                .filter(Invoice.invoice_number == inv.invoice_number, Invoice.id != inv.id)
                .count()
            )

        conf = inv.ocr_confidence or {}
        rows.append(
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "seller_name": inv.seller_name,
                "client_name": inv.client_name,
                "amount": inv.amount,
                "currency": inv.currency,
                "due_date": inv.due_date,
                "status": inv.status,
                "is_duplicate": bool(inv.is_duplicate),
                "duplicate_invoice_number_exists": duplicate_count > 0,
                "duplicate_matches": duplicate_count,
                "upload_url": _to_upload_url(inv.file_path),
                "original_filename": inv.original_filename,
                "ocr_extracted": {
                    "invoice_number": inv.invoice_number,
                    "seller_name": inv.seller_name,
                    "client_name": inv.client_name,
                    "amount": inv.amount,
                    "currency": inv.currency,
                    "due_date": inv.due_date,
                },
                "confidence": {
                    "invoice_number": conf.get("invoice_number"),
                    "seller_name": conf.get("seller_name"),
                    "client_name": conf.get("client_name"),
                    "amount": conf.get("amount"),
                    "due_date": conf.get("due_date"),
                    "overall": conf.get("overall"),
                },
                "created_at": str(inv.created_at),
            }
        )

    return {"invoices": rows, "total": query.count()}


@router.get("/admin/settlement-tracker")
def settlement_tracker(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ = current_user
    statuses = ["funded", "active", "settled"]

    query = db.query(Invoice).filter(Invoice.status.in_(statuses))
    if status:
        query = query.filter(Invoice.status == status)

    invoices = query.order_by(Invoice.created_at.desc()).offset(skip).limit(limit).all()
    now = datetime.now(timezone.utc).date()

    snapshots = (
        db.query(models.RepaymentSnapshot)
        .filter(models.RepaymentSnapshot.invoice_id.in_([inv.id for inv in invoices]))
        .order_by(models.RepaymentSnapshot.created_at.desc())
        .all()
        if invoices
        else []
    )
    snapshot_by_invoice: dict[int, models.RepaymentSnapshot] = {}
    for snapshot in snapshots:
        if snapshot.invoice_id not in snapshot_by_invoice:
            snapshot_by_invoice[snapshot.invoice_id] = snapshot

    items = []
    for inv in invoices:
        due_date = _parse_date(inv.due_date)
        days_to_due = (due_date - now).days if due_date else None
        is_overdue = bool(due_date and due_date < now and inv.status != "settled")
        snapshot = snapshot_by_invoice.get(inv.id)

        items.append(
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "seller_id": inv.seller_id,
                "seller_name": inv.seller_name,
                "client_name": inv.client_name,
                "amount": inv.amount,
                "ask_price": inv.ask_price,
                "status": inv.status,
                "due_date": inv.due_date,
                "days_to_due": days_to_due,
                "is_overdue": is_overdue,
                "countdown_label": (
                    f"Overdue by {abs(days_to_due)} days"
                    if days_to_due is not None and days_to_due < 0
                    else "Due Today"
                    if days_to_due == 0
                    else f"Due in {days_to_due} days"
                    if days_to_due is not None
                    else "Due date unavailable"
                ),
                "can_settle": inv.status != "settled",
                "investor_id": snapshot.investor_id if snapshot else None,
                "funded_amount": snapshot.funded_amount if snapshot else inv.ask_price,
                "created_at": str(inv.created_at),
            }
        )

    items.sort(
        key=lambda item: (
            _parse_date(item["due_date"]) is None,
            _parse_date(item["due_date"]) or date.max,
        )
    )
    return {"items": items, "total": query.count()}


@router.post("/{invoice_id}/settle")
def settle_invoice(
    invoice_id: int,
    payload: SettleInvoicePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.status not in ["funded", "active", "settled"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invoice status '{invoice.status}' cannot be settled. Expected funded/active.",
        )

    if invoice.status == "settled":
        raise HTTPException(status_code=400, detail="Invoice already settled")

    now = datetime.now(timezone.utc)
    due_dt = _parse_date(invoice.due_date)
    days_late = max((now.date() - due_dt).days, 0) if due_dt else 0
    event_type = _settlement_event_type(days_late)

    snapshot = (
        db.query(models.RepaymentSnapshot)
        .filter(models.RepaymentSnapshot.invoice_id == invoice_id)
        .order_by(models.RepaymentSnapshot.created_at.desc())
        .first()
    )

    settled_amount = (
        payload.repayment_amount
        if payload.repayment_amount is not None and payload.repayment_amount > 0
        else invoice.amount
        if invoice.amount is not None and invoice.amount > 0
        else invoice.ask_price
        if invoice.ask_price is not None and invoice.ask_price > 0
        else 0.0
    )

    if snapshot is not None:
        snapshot.repaid_at = now
        snapshot.repayment_amount = settled_amount
        snapshot.weighted_average_days_late = float(days_late)
        snapshot.impact_score = float(max(0, min(100, 100 - (days_late * 1.5))))

    credit_event = models.CreditEvent(
        invoice_id=invoice.id,
        seller_id=invoice.seller_id,
        investor_id=snapshot.investor_id if snapshot else None,
        event_type=event_type,
        days_late=days_late,
        amount=float(settled_amount or 0.0),
        notes=payload.notes,
        recorded_by=current_user.id,
    )
    db.add(credit_event)

    if invoice.seller_id is not None:
        credit = (
            db.query(models.CreditHistory)
            .filter(models.CreditHistory.seller_id == invoice.seller_id)
            .first()
        )
        if credit is not None:
            delta = -2 if days_late <= 0 else 5 if days_late <= 30 else 10 if days_late <= 60 else 15
            current_score = int(credit.composite_score or 0)
            next_score = max(0, min(100, current_score + delta))
            credit.composite_score = next_score

            current_track = int(credit.seller_track_record or 50)
            track_delta = 2 if days_late <= 0 else -5 if days_late <= 30 else -10 if days_late <= 60 else -15
            credit.seller_track_record = max(0, min(100, current_track + track_delta))

            contributors = credit.risk_contributors if isinstance(credit.risk_contributors, dict) else {}
            contributors["repayment_velocity_delta"] = float(delta)
            contributors["settlement_impact_score"] = float(max(0, min(100, 100 - (days_late * 1.5))))
            credit.risk_contributors = contributors

    invoice.status = "settled"
    db.commit()

    return {
        "message": "Invoice settled successfully",
        "invoice_id": invoice.id,
        "status": invoice.status,
        "days_late": days_late,
        "event_type": event_type,
        "settled_amount": settled_amount,
        "credit_event_id": credit_event.id,
    }


# ── POST /invoices/{invoice_id}/mint ── admin or seller ───────────────────────

@router.post("/{invoice_id}/mint")
def mint_invoice_nft(
    invoice_id: int,
    payload: MintInvoicePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mint an invoice as an ERC1155 NFT with optional fractional shares.
    
    Admins can mint any approved invoice.
    Sellers can mint their own approved invoices.
    """
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Authorization: must be admin or the seller
    if current_user.role != UserRole.ADMIN and invoice.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to mint this invoice")

    # Validation: must be approved
    if invoice.status not in ["approved", "pending_mint"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invoice status '{invoice.status}' is not eligible for minting. "
                   "Must be 'approved' or 'pending_mint'.",
        )

    # Validation: cannot mint same invoice twice
    if invoice.token_id is not None:
        raise HTTPException(
            status_code=400,
            detail=f"Invoice already minted with token_id: {invoice.token_id}",
        )

    # Call minting service
    mint_result = minting_service.mint_invoice(
        db=db,
        invoice_id=invoice_id,
        recipient_address=payload.recipient_address,
        ipfs_uri=payload.ipfs_uri or "",
        supply=payload.supply,
    )

    if not mint_result["success"]:
        raise HTTPException(status_code=400, detail=mint_result["error"])

    return {
        "message": "Invoice successfully minted",
        "token_id": mint_result["token_id"],
        "tx_hash": mint_result["tx_hash"],
        "supply": mint_result["supply"],
        "status": "minted",
    }


# ── POST /invoices/mint/validate-fractional ──────────────────────────────────

@router.post("/mint/validate-fractional")
def validate_fractional_config(
    payload: ValidateFractionalPayload,
    current_user: User = Depends(get_current_user),
):
    """
    Validate a fractional invoice configuration.
    Ensures that (share_price × num_shares) ≈ total amount.
    """
    is_valid, error_msg = minting_service.validate_fractional_config(
        amount=payload.amount,
        share_price=payload.share_price,
        num_shares=payload.num_shares,
    )

    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    return {
        "valid": True,
        "num_shares": payload.num_shares,
        "total_amount": payload.amount,
        "share_price": payload.share_price,
        "is_fractional": payload.num_shares > 1,
    }


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
        "supply": invoice.supply,
        "token_id": invoice.token_id,
        "canonical_hash": invoice.canonical_hash,
        "is_duplicate": invoice.is_duplicate,
        "status": invoice.status,
        "ocr_confidence": invoice.ocr_confidence,
        "seller_id": invoice.seller_id,
        "upload_url": _to_upload_url(invoice.file_path),
        "created_at": str(invoice.created_at),
    }