import os
import logging
import math
from uuid import uuid4
from datetime import date, datetime, timezone
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func
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
from ..services.malware_scan import scan_invoice_bytes
from ..services.realtime import notification_hub
from ..services.storage_s3 import (
    upload_invoice_document,
    build_s3_uri,
    parse_s3_uri,
    generate_presigned_get_url,
)
from ..services.rate_limit import enforce_rate_limit
from ..auth.dependencies import (
    get_current_user,
    require_seller,
    require_admin,
    require_kyc_approved,
)

router = APIRouter()
logger = logging.getLogger(__name__)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}
MAX_FILE_SIZE_MB = 10
anomaly_service = InvoiceAnomalyService()
minting_service = get_invoice_minting_service()


def _create_or_update_fraud_flag_from_anomaly(
    db: Session,
    invoice: Invoice,
    anomaly_payload: dict,
) -> None:
    existing = (
        db.query(FraudFlag)
        .filter(FraudFlag.invoice_id == invoice.id, FraudFlag.is_resolved == False)
        .order_by(FraudFlag.created_at.desc())
        .first()
    )

    reason_text = " | ".join(anomaly_payload.get("reasons") or ["Anomaly detected"])
    severity = anomaly_payload.get("severity") or "MEDIUM"

    if existing is not None:
        existing.reason = reason_text
        existing.severity = severity
        existing.anomaly_metadata = anomaly_payload
        existing.resolution_action = None
        return

    db.add(
        FraudFlag(
            invoice_id=invoice.id,
            seller_id=invoice.seller_id,
            reason=reason_text,
            severity=severity,
            anomaly_metadata=anomaly_payload,
            is_resolved=False,
        )
    )


def _run_pending_review_anomaly(db: Session, invoice: Invoice) -> dict | None:
    if invoice.status != "pending_review":
        return None

    anomaly_result = anomaly_service.evaluate_invoice(db, invoice)
    anomaly_payload = anomaly_result.to_dict()

    if anomaly_result.should_flag:
        invoice.status = "flagged"
        invoice.is_duplicate = False
        _create_or_update_fraud_flag_from_anomaly(db, invoice, anomaly_payload)

    return anomaly_payload


def _upsert_listing_for_invoice(
    db: Session,
    invoice: Invoice,
    listing_type: str,
    *,
    ask_price: Optional[float] = None,
    share_price: Optional[float] = None,
    total_shares: Optional[int] = None,
) -> models.MarketplaceListing:
    listing = (
        db.query(models.MarketplaceListing)
        .filter(models.MarketplaceListing.invoice_id == invoice.id)
        .order_by(models.MarketplaceListing.created_at.desc())
        .first()
    )

    if listing is None:
        listing = models.MarketplaceListing(
            invoice_id=invoice.id,
            seller_id=invoice.seller_id,
            listing_type=listing_type,
            status="active",
        )
        db.add(listing)

    listing.listing_type = listing_type
    listing.ask_price = ask_price if ask_price is not None else invoice.ask_price
    listing.share_price = (
        share_price if share_price is not None else invoice.share_price
    )
    listing.total_shares = total_shares if total_shares is not None else invoice.supply
    if listing.available_shares is None:
        listing.available_shares = listing.total_shares

    return listing


def _open_or_create_auction(
    db: Session, invoice: Invoice, listing: models.MarketplaceListing
) -> models.MarketplaceAuction:
    auction = (
        db.query(models.MarketplaceAuction)
        .filter(
            models.MarketplaceAuction.invoice_id == invoice.id,
            models.MarketplaceAuction.status == "open",
        )
        .order_by(models.MarketplaceAuction.started_at.desc())
        .first()
    )
    if auction is None:
        auction = models.MarketplaceAuction(
            invoice_id=invoice.id,
            listing_id=listing.id,
            seller_id=invoice.seller_id,
            status="open",
            start_price=float(invoice.ask_price or invoice.amount or 0.0),
            min_increment=float(invoice.min_bid_increment or 100.0),
        )
        db.add(auction)
    return auction


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


class RepayInvoicePayload(BaseModel):
    repayment_amount: Optional[float] = None
    notes: Optional[str] = None
    wallet_address: Optional[str] = None
    tx_hash: Optional[str] = None


class FundInvoicePayload(BaseModel):
    investment_amount: Optional[float] = None
    shares: Optional[int] = None
    notes: Optional[str] = None


class PlaceBidPayload(BaseModel):
    amount: float


class CloseAuctionPayload(BaseModel):
    notes: Optional[str] = None


class ListingCreatePayload(BaseModel):
    invoice_id: int
    listing_type: str = "fixed"  # fixed,auction,fractional
    ask_price: Optional[float] = None
    share_price: Optional[float] = None
    total_shares: Optional[int] = None


class ListingUpdatePayload(BaseModel):
    status: Optional[str] = None  # active,paused,sold,canceled
    ask_price: Optional[float] = None
    share_price: Optional[float] = None
    available_shares: Optional[int] = None


class SettlementConfirmPayload(BaseModel):
    notes: Optional[str] = None


@router.post("/upload")
async def upload_invoice(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_seller),
    _: User = Depends(require_kyc_approved),
):
    enforce_rate_limit(
        key=f"invoice_upload:{request.client.host if request.client else 'unknown'}:{current_user.id}",
        limit=int(os.getenv("RL_UPLOAD_LIMIT", "15")),
        window_seconds=int(os.getenv("RL_UPLOAD_WINDOW_SECONDS", "300")),
    )

    # Validate file type
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{file_ext}'. Allowed: PDF, PNG, JPG",
        )

    # Read & validate file size
    file_bytes = await file.read()
    size_mb = len(file_bytes) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({size_mb:.1f} MB). Maximum: {MAX_FILE_SIZE_MB} MB",
        )

    scan_result = scan_invoice_bytes(file_bytes, file.filename)
    if not scan_result.get("clean", False):
        notification_hub.broadcast_from_sync(
            "invoice_upload_blocked",
            {
                "filename": file.filename,
                "seller_id": current_user.id,
                "reason": scan_result.get("threat"),
                "engine": scan_result.get("engine"),
            },
            roles={"admin"},
            user_ids={current_user.id},
        )
        raise HTTPException(
            status_code=400,
            detail=f"Upload blocked by malware scanner: {scan_result.get('threat')}",
        )

    # Persist file to configured storage
    storage_mode = os.getenv("INVOICE_STORAGE_MODE", "local").strip().lower()
    file_path: str
    if storage_mode == "s3":
        try:
            upload_result = upload_invoice_document(
                seller_id=current_user.id,
                filename=file.filename,
                content_type=file.content_type,
                file_bytes=file_bytes,
            )
            file_path = build_s3_uri(upload_result["bucket"], upload_result["key"])
        except Exception as exc:
            raise HTTPException(
                status_code=500, detail=f"Invoice storage upload failed: {exc}"
            )
    else:
        safe_filename = f"{os.urandom(8).hex()}_{file.filename}"
        file_path = os.path.join(UPLOAD_DIR, safe_filename)
        with open(file_path, "wb") as f:
            f.write(file_bytes)

    # Run OCR
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

    # Generate hash
    hash_result = generate_invoice_hash(
        invoice_number=get_val("invoice_number") or "",
        seller_name=get_val("seller_name") or "",
        client_name=get_val("client_name") or "",
        amount=get_val("amount") or 0,
        due_date=get_val("due_date") or "",
        currency=get_val("currency") or "INR",
    )

    # Save to DB
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

    # Duplicate detection
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
        db.add(
            FraudFlag(
                invoice_id=invoice.id,
                seller_id=invoice.seller_id,
                reason="Duplicate detection: invoice appears to match existing records.",
                severity="MEDIUM",
                anomaly_metadata={
                    "source": "duplicate_detection",
                    "details": duplicate_result,
                },
                is_resolved=False,
            )
        )
    else:
        _run_pending_review_anomaly(db, invoice)

    db.commit()

    latest_flag = (
        db.query(FraudFlag)
        .filter(FraudFlag.invoice_id == invoice.id)
        .order_by(FraudFlag.created_at.desc())
        .first()
    )

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
            "malware_scan": scan_result,
            "duplicate_check": duplicate_result,
            "status": invoice.status,
            "anomaly": latest_flag.anomaly_metadata if latest_flag else None,
            "uploaded_by": current_user.email,
        },
    )


@router.get("/")
def list_invoices(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    SMEs see only their own invoices.
    Admins see all invoices.
    """
    query = db.query(Invoice)

    if current_user.role != UserRole.ADMIN:
        query = query.filter(Invoice.seller_id == current_user.id)

    if status:
        query = query.filter(Invoice.status == status)

    invoices = query.order_by(Invoice.created_at.desc()).offset(skip).limit(limit).all()
    return {
        "invoices": [_invoice_to_dict(inv, db) for inv in invoices],
        "total": query.count(),
    }


@router.get("/marketplace")
def list_marketplace_invoices(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    if current_user.role not in {UserRole.INVESTOR, UserRole.ADMIN}:
        raise HTTPException(
            status_code=403, detail="Only investors can access marketplace invoices"
        )

    listed_statuses = ["approved", "listed", "minted"]
    query = (
        db.query(Invoice)
        .filter(Invoice.status.in_(listed_statuses))
        .order_by(Invoice.created_at.desc())
    )

    invoices = query.offset(skip).limit(limit).all()
    return {
        "invoices": [_invoice_to_dict(inv, db) for inv in invoices],
        "total": query.count(),
    }


@router.post("/listings")
def create_listing(
    payload: ListingCreatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_seller),
    _: User = Depends(require_kyc_approved),
):
    invoice = db.query(Invoice).filter(Invoice.id == payload.invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.seller_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorised to list this invoice"
        )

    normalized_type = (payload.listing_type or "fixed").lower()
    if normalized_type not in {"fixed", "auction", "fractional"}:
        raise HTTPException(
            status_code=400, detail="listing_type must be fixed, auction, or fractional"
        )

    invoice.financing_type = normalized_type
    if payload.ask_price is not None:
        invoice.ask_price = payload.ask_price
    if payload.share_price is not None:
        invoice.share_price = payload.share_price
    if payload.total_shares is not None and payload.total_shares > 0:
        invoice.supply = payload.total_shares
    invoice.status = "listed"

    listing = _upsert_listing_for_invoice(
        db,
        invoice,
        normalized_type,
        ask_price=payload.ask_price,
        share_price=payload.share_price,
        total_shares=payload.total_shares,
    )
    db.flush()

    auction = None
    if normalized_type == "auction":
        auction = _open_or_create_auction(db, invoice, listing)

    db.commit()
    db.refresh(listing)

    return {
        "message": "Listing created",
        "listing": {
            "id": listing.id,
            "invoice_id": listing.invoice_id,
            "listing_type": listing.listing_type,
            "status": listing.status,
            "ask_price": listing.ask_price,
            "share_price": listing.share_price,
            "total_shares": listing.total_shares,
            "available_shares": listing.available_shares,
            "created_at": (
                listing.created_at.isoformat() if listing.created_at else None
            ),
            "auction_id": auction.id if auction else None,
        },
    }


@router.get("/listings")
def list_listings(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(models.MarketplaceListing)
    if current_user.role != UserRole.ADMIN:
        query = query.filter(models.MarketplaceListing.seller_id == current_user.id)
    if status:
        query = query.filter(models.MarketplaceListing.status == status)

    rows = (
        query.order_by(models.MarketplaceListing.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {
        "items": [
            {
                "id": row.id,
                "invoice_id": row.invoice_id,
                "seller_id": row.seller_id,
                "listing_type": row.listing_type,
                "status": row.status,
                "ask_price": row.ask_price,
                "share_price": row.share_price,
                "total_shares": row.total_shares,
                "available_shares": row.available_shares,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
        "total": query.count(),
    }


@router.put("/listings/{listing_id:int}")
def update_listing(
    listing_id: int,
    payload: ListingUpdatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_kyc_approved),
):
    listing = (
        db.query(models.MarketplaceListing)
        .filter(models.MarketplaceListing.id == listing_id)
        .first()
    )
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if current_user.role != UserRole.ADMIN and listing.seller_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorised to update this listing"
        )

    if payload.status is not None:
        normalized = payload.status.lower()
        if normalized not in {"active", "paused", "sold", "canceled"}:
            raise HTTPException(status_code=400, detail="Invalid listing status")
        listing.status = normalized
    if payload.ask_price is not None:
        listing.ask_price = payload.ask_price
    if payload.share_price is not None:
        listing.share_price = payload.share_price
    if payload.available_shares is not None:
        listing.available_shares = max(payload.available_shares, 0)

    invoice = db.query(Invoice).filter(Invoice.id == listing.invoice_id).first()
    if invoice:
        if payload.ask_price is not None:
            invoice.ask_price = payload.ask_price
        if payload.share_price is not None:
            invoice.share_price = payload.share_price

    db.commit()
    return {
        "message": "Listing updated",
        "listing_id": listing.id,
        "status": listing.status,
    }


@router.delete("/listings/{listing_id:int}")
def delete_listing(
    listing_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_kyc_approved),
):
    listing = (
        db.query(models.MarketplaceListing)
        .filter(models.MarketplaceListing.id == listing_id)
        .first()
    )
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if current_user.role != UserRole.ADMIN and listing.seller_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorised to delete this listing"
        )

    listing.status = "canceled"
    invoice = db.query(Invoice).filter(Invoice.id == listing.invoice_id).first()
    if invoice and invoice.status == "listed":
        invoice.status = "approved"

    db.commit()
    return {"message": "Listing canceled", "listing_id": listing.id}


@router.get("/settlements/history")
def settlement_history(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(models.SettlementRecord)
    if current_user.role != UserRole.ADMIN:
        query = query.filter(
            (models.SettlementRecord.seller_id == current_user.id)
            | (models.SettlementRecord.investor_id == current_user.id)
        )

    rows = (
        query.order_by(models.SettlementRecord.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {
        "items": [
            {
                "id": row.id,
                "invoice_id": row.invoice_id,
                "investor_id": row.investor_id,
                "seller_id": row.seller_id,
                "amount": row.amount,
                "status": row.status,
                "escrow_reference": row.escrow_reference,
                "seller_wallet_address": row.seller_wallet_address,
                "repayment_tx_hash": row.repayment_tx_hash,
                "initiated_at": (
                    row.initiated_at.isoformat() if row.initiated_at else None
                ),
                "confirmed_by": row.confirmed_by,
                "confirmed_at": (
                    row.confirmed_at.isoformat() if row.confirmed_at else None
                ),
                "notes": row.notes,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
        "total": query.count(),
    }


@router.post("/settlements/{invoice_id:int}/confirm")
def confirm_settlement(
    invoice_id: int,
    payload: SettlementConfirmPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    record = (
        db.query(models.SettlementRecord)
        .filter(models.SettlementRecord.invoice_id == invoice_id)
        .order_by(models.SettlementRecord.created_at.desc())
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="No settlement record found")

    if record.status == "confirmed" or invoice.status == "settled":
        raise HTTPException(status_code=400, detail="Invoice already settled")

    if record.status not in {"processing", "pending"}:
        raise HTTPException(
            status_code=400,
            detail=f"Settlement record in status '{record.status}' cannot be confirmed",
        )

    if invoice.status not in {"funded", "active", "repayment_processing"}:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invoice status '{invoice.status}' cannot be confirmed. "
                "Expected funded, active, or repayment_processing."
            ),
        )

    settlement_result = _complete_invoice_settlement(
        db,
        invoice,
        record,
        recorded_by=current_user.id,
        confirmation_note=payload.notes,
    )

    db.commit()
    snapshot = settlement_result["snapshot"]
    notification_hub.broadcast_from_sync(
        "invoice_settled",
        {
            "invoice_id": invoice.id,
            "status": invoice.status,
            "days_late": settlement_result["days_late"],
            "event_type": settlement_result["event_type"],
            "settled_amount": settlement_result["settled_amount"],
            "escrow_status": invoice.escrow_status,
            "escrow_reference": invoice.escrow_reference,
            "settled_by": current_user.id,
        },
        roles={"admin"},
        user_ids={
            uid
            for uid in [invoice.seller_id, snapshot.investor_id if snapshot else None]
            if uid is not None
        },
        invoice_id=invoice.id,
    )
    return {
        "message": "Settlement confirmed",
        "settlement_id": record.id,
        "status": record.status,
        "invoice_status": invoice.status,
    }


@router.get("/{invoice_id:int}")
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # must be logged in
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=403, detail="Not authorised to view this invoice"
        )

    return _invoice_to_dict(invoice, db)


@router.put("/{invoice_id:int}")
def update_invoice_fields(
    invoice_id: int,
    payload: InvoiceUpdatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_seller),  # seller only
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.seller_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorised to edit this invoice"
        )

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
    anomaly_payload = _run_pending_review_anomaly(db, invoice)

    db.commit()
    db.refresh(invoice)
    return {
        "message": "Invoice updated",
        "invoice": _invoice_to_dict(invoice, db),
        "anomaly": anomaly_payload,
    }


@router.put("/{invoice_id:int}/review")
def review_invoice(
    invoice_id: int,
    action: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if action == "approve":
        anomaly_result = anomaly_service.evaluate_invoice(db, invoice)

        if anomaly_result.should_flag:
            invoice.status = "flagged"
            invoice.is_duplicate = False
            _create_or_update_fraud_flag_from_anomaly(
                db, invoice, anomaly_result.to_dict()
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
        ).update(
            {
                "is_resolved": True,
                "resolved_by": current_user.id,
                "resolution_action": "clear",
            }
        )
    elif action == "reject":
        invoice.status = "rejected"
    else:
        raise HTTPException(
            status_code=400, detail="Action must be 'approve' or 'reject'"
        )

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

    parsed_s3 = parse_s3_uri(file_path)
    if parsed_s3 is not None:
        bucket, key = parsed_s3
        try:
            return generate_presigned_get_url(bucket=bucket, key=key)
        except Exception:
            return None

    filename = os.path.basename(file_path)
    if not filename:
        return None
    return f"/uploads/{filename}"


def _safe_json_number(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        numeric = float(value)
        if math.isnan(numeric) or math.isinf(numeric):
            return None
        return numeric
    return None


def _settlement_event_type(days_late: int) -> str:
    if days_late <= 0:
        return "ON_TIME_PAYMENT"
    if days_late <= 30:
        return "LATE_30"
    if days_late <= 60:
        return "LATE_60"
    return "LATE_90_PLUS"


def _resolve_repayment_amount(
    invoice: Invoice, requested_amount: Optional[float] = None
) -> float:
    if requested_amount is not None:
        if requested_amount <= 0:
            raise HTTPException(
                status_code=400, detail="repayment_amount must be greater than 0"
            )
        return float(requested_amount)

    for candidate in (invoice.amount, invoice.ask_price):
        if candidate is not None and float(candidate) > 0:
            return float(candidate)

    raise HTTPException(
        status_code=400,
        detail="Repayment amount is unavailable for this invoice",
    )


def _append_notes(existing: Optional[str], new_note: Optional[str]) -> Optional[str]:
    clean_existing = (existing or "").strip()
    clean_new = (new_note or "").strip()

    if clean_existing and clean_new:
        return f"{clean_existing}\n{clean_new}"
    return clean_new or clean_existing or None


def _latest_repayment_snapshot(
    db: Session, invoice_id: int
) -> Optional[models.RepaymentSnapshot]:
    return (
        db.query(models.RepaymentSnapshot)
        .filter(models.RepaymentSnapshot.invoice_id == invoice_id)
        .order_by(models.RepaymentSnapshot.created_at.desc())
        .first()
    )


def _complete_invoice_settlement(
    db: Session,
    invoice: Invoice,
    record: models.SettlementRecord,
    *,
    recorded_by: int,
    confirmation_note: Optional[str] = None,
) -> dict:
    now = datetime.now(timezone.utc)
    due_dt = _parse_date(invoice.due_date)
    days_late = max((now.date() - due_dt).days, 0) if due_dt else 0
    event_type = _settlement_event_type(days_late)
    snapshot = _latest_repayment_snapshot(db, invoice.id)
    settled_amount = _resolve_repayment_amount(invoice, record.amount)

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
        amount=float(settled_amount),
        notes=record.notes,
        recorded_by=recorded_by,
    )
    db.add(credit_event)

    if invoice.seller_id is not None:
        credit = (
            db.query(models.CreditHistory)
            .filter(models.CreditHistory.seller_id == invoice.seller_id)
            .first()
        )
        if credit is not None:
            delta = (
                -2
                if days_late <= 0
                else 5 if days_late <= 30 else 10 if days_late <= 60 else 15
            )
            current_score = int(credit.composite_score or 0)
            next_score = max(0, min(100, current_score + delta))
            credit.composite_score = next_score

            current_track = int(credit.seller_track_record or 50)
            track_delta = (
                2
                if days_late <= 0
                else -5 if days_late <= 30 else -10 if days_late <= 60 else -15
            )
            credit.seller_track_record = max(0, min(100, current_track + track_delta))

            contributors = (
                credit.risk_contributors
                if isinstance(credit.risk_contributors, dict)
                else {}
            )
            contributors["repayment_velocity_delta"] = float(delta)
            contributors["settlement_impact_score"] = float(
                max(0, min(100, 100 - (days_late * 1.5)))
            )
            credit.risk_contributors = contributors

    invoice.status = "settled"
    invoice.escrow_status = "released"
    invoice.escrow_released_at = now

    record.amount = float(settled_amount)
    record.status = "confirmed"
    record.confirmed_by = recorded_by
    record.confirmed_at = now
    record.initiated_at = record.initiated_at or now
    record.notes = _append_notes(record.notes, confirmation_note)

    db.add(
        models.MarketplaceTransaction(
            invoice_id=invoice.id,
            buyer_id=snapshot.investor_id if snapshot else None,
            seller_id=invoice.seller_id,
            tx_type="settle",
            amount=float(settled_amount),
            status="completed",
            reference=record.repayment_tx_hash or invoice.escrow_reference,
            tx_metadata={
                "event_type": event_type,
                "days_late": days_late,
                "repayment_tx_hash": record.repayment_tx_hash,
                "seller_wallet_address": record.seller_wallet_address,
            },
        )
    )

    return {
        "snapshot": snapshot,
        "credit_event": credit_event,
        "days_late": days_late,
        "event_type": event_type,
        "settled_amount": settled_amount,
    }


@router.get("/admin/pending-review")
def list_pending_invoices_for_admin(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    logger.info(
        "pending-review endpoint hit: user_id=%s skip=%s limit=%s",
        current_user.id,
        skip,
        limit,
    )
    try:
        _ = current_user

        limit = min(max(int(limit), 1), 100)
        query = (
            db.query(Invoice)
            .filter(Invoice.status.in_(["pending", "pending_review", "flagged"]))
            .order_by(Invoice.created_at.desc())
        )

        invoices = query.offset(skip).limit(limit).all()
        invoice_numbers = {inv.invoice_number for inv in invoices if inv.invoice_number}
        duplicate_count_by_number: dict[str, int] = {}
        if invoice_numbers:

            counts = (
                db.query(Invoice.invoice_number, func.count(Invoice.id))
                .filter(Invoice.invoice_number.in_(invoice_numbers))
                .group_by(Invoice.invoice_number)
                .all()
            )
            duplicate_count_by_number = {
                str(num): int(cnt) for num, cnt in counts if num is not None
            }
        rows = []
        for inv in invoices:
            total_same_number = (
                duplicate_count_by_number.get(str(inv.invoice_number), 0)
                if inv.invoice_number
                else 0
            )

            duplicate_count = max(0, total_same_number - 1)

            conf = inv.ocr_confidence if isinstance(inv.ocr_confidence, dict) else {}
            row = {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "seller_name": inv.seller_name,
                "client_name": inv.client_name,
                "amount": _safe_json_number(inv.amount),
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
                    "amount": _safe_json_number(inv.amount),
                    "currency": inv.currency,
                    "due_date": inv.due_date,
                },
                "confidence": {
                    "invoice_number": _safe_json_number(conf.get("invoice_number")),
                    "seller_name": _safe_json_number(conf.get("seller_name")),
                    "client_name": _safe_json_number(conf.get("client_name")),
                    "amount": _safe_json_number(conf.get("amount")),
                    "due_date": _safe_json_number(conf.get("due_date")),
                    "overall": _safe_json_number(conf.get("overall")),
                },
                "created_at": str(inv.created_at),
            }
            rows.append(row)

        total = query.count()
        logger.info(
            "pending-review returning rows=%s total=%s user_id=%s",
            len(rows),
            total,
            current_user.id,
        )
        return {"invoices": rows, "total": total}
    except Exception:
        logger.exception(
            "pending-review failed: user_id=%s skip=%s limit=%s",
            current_user.id,
            skip,
            limit,
        )
        raise


@router.get("/admin/settlement-tracker")
def settlement_tracker(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ = current_user
    statuses = ["funded", "active", "repayment_processing", "settled"]

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

    settlement_records = (
        db.query(models.SettlementRecord)
        .filter(models.SettlementRecord.invoice_id.in_([inv.id for inv in invoices]))
        .order_by(models.SettlementRecord.created_at.desc())
        .all()
        if invoices
        else []
    )
    settlement_by_invoice: dict[int, models.SettlementRecord] = {}
    for record in settlement_records:
        if record.invoice_id not in settlement_by_invoice:
            settlement_by_invoice[record.invoice_id] = record

    items = []
    for inv in invoices:
        due_date = _parse_date(inv.due_date)
        days_to_due = (due_date - now).days if due_date else None
        is_overdue = bool(due_date and due_date < now and inv.status != "settled")
        snapshot = snapshot_by_invoice.get(inv.id)
        settlement = settlement_by_invoice.get(inv.id)

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
                    else (
                        "Due Today"
                        if days_to_due == 0
                        else (
                            f"Due in {days_to_due} days"
                            if days_to_due is not None
                            else "Due date unavailable"
                        )
                    )
                ),
                "escrow_status": inv.escrow_status,
                "escrow_reference": inv.escrow_reference,
                "escrow_held_at": (
                    inv.escrow_held_at.isoformat() if inv.escrow_held_at else None
                ),
                "escrow_released_at": (
                    inv.escrow_released_at.isoformat()
                    if inv.escrow_released_at
                    else None
                ),
                "investor_id": snapshot.investor_id if snapshot else None,
                "funded_amount": snapshot.funded_amount if snapshot else inv.ask_price,
                "settlement_id": settlement.id if settlement else None,
                "settlement_status": settlement.status if settlement else None,
                "can_confirm": bool(
                    settlement
                    and settlement.status in {"processing", "pending"}
                    and inv.status == "repayment_processing"
                ),
                "seller_wallet_address": (
                    settlement.seller_wallet_address if settlement else None
                ),
                "repayment_tx_hash": (
                    settlement.repayment_tx_hash if settlement else None
                ),
                "repayment_initiated_at": (
                    settlement.initiated_at.isoformat()
                    if settlement and settlement.initiated_at
                    else None
                ),
                "confirmed_at": (
                    settlement.confirmed_at.isoformat()
                    if settlement and settlement.confirmed_at
                    else None
                ),
                "repayment_notes": settlement.notes if settlement else None,
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


@router.post("/{invoice_id:int}/repay")
def repay_invoice(
    invoice_id: int,
    payload: RepayInvoicePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_seller),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.seller_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorised to repay this invoice"
        )

    if invoice.status in {"repayment_processing"}:
        raise HTTPException(
            status_code=400,
            detail="Repayment already initiated and awaiting admin confirmation",
        )

    if invoice.status not in {"funded", "active"}:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invoice status '{invoice.status}' cannot enter repayment processing. "
                "Expected funded/active."
            ),
        )

    now = datetime.now(timezone.utc)
    snapshot = _latest_repayment_snapshot(db, invoice_id)
    repayment_amount = _resolve_repayment_amount(invoice, payload.repayment_amount)

    invoice.status = "repayment_processing"
    record = models.SettlementRecord(
        invoice_id=invoice.id,
        investor_id=snapshot.investor_id if snapshot else None,
        seller_id=invoice.seller_id,
        amount=float(repayment_amount),
        status="processing",
        escrow_reference=invoice.escrow_reference,
        seller_wallet_address=payload.wallet_address,
        repayment_tx_hash=payload.tx_hash,
        initiated_at=now,
        notes=payload.notes,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    notification_hub.broadcast_from_sync(
        "invoice_repayment_initiated",
        {
            "invoice_id": invoice.id,
            "status": invoice.status,
            "repayment_amount": repayment_amount,
            "escrow_status": invoice.escrow_status,
            "escrow_reference": invoice.escrow_reference,
            "settlement_id": record.id,
            "seller_wallet_address": record.seller_wallet_address,
            "repayment_tx_hash": record.repayment_tx_hash,
            "initiated_by": current_user.id,
        },
        roles={"admin"},
        user_ids={
            uid
            for uid in [invoice.seller_id, snapshot.investor_id if snapshot else None]
            if uid is not None
        },
        invoice_id=invoice.id,
    )

    return {
        "message": "Repayment submitted and awaiting admin confirmation",
        "invoice_id": invoice.id,
        "status": invoice.status,
        "settlement_id": record.id,
        "repayment_amount": repayment_amount,
        "escrow_status": invoice.escrow_status,
        "escrow_reference": invoice.escrow_reference,
        "seller_wallet_address": record.seller_wallet_address,
        "repayment_tx_hash": record.repayment_tx_hash,
    }


@router.post("/{invoice_id:int}/mint")
def mint_invoice_nft(
    invoice_id: int,
    payload: MintInvoicePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Authorization: must be admin or the seller
    if current_user.role != UserRole.ADMIN and invoice.seller_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to mint this invoice"
        )

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


@router.post("/{invoice_id:int}/fund")
def fund_invoice(
    invoice_id: int,
    payload: FundInvoicePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_kyc_approved),
):

    if current_user.role not in {UserRole.INVESTOR, UserRole.ADMIN}:
        raise HTTPException(status_code=403, detail="Only investors can fund invoices")

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.status in {"settled", "defaulted", "rejected", "flagged"}:
        raise HTTPException(
            status_code=400,
            detail=f"Invoice with status '{invoice.status}' cannot be funded",
        )

    if invoice.status not in {"approved", "listed", "minted", "funded", "active"}:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invoice is not yet available for funding. "
                "Expected approved/listed/minted status."
            ),
        )

    target_amount = float(invoice.ask_price or invoice.amount or 0.0)
    if target_amount <= 0:
        raise HTTPException(status_code=400, detail="Invoice price is not configured")

    funded_total = float(
        db.query(func.coalesce(func.sum(models.RepaymentSnapshot.funded_amount), 0.0))
        .filter(models.RepaymentSnapshot.invoice_id == invoice.id)
        .scalar()
        or 0.0
    )
    remaining_amount = max(target_amount - funded_total, 0.0)

    if remaining_amount <= 0:
        raise HTTPException(status_code=400, detail="Invoice is already fully funded")

    is_fractional = (invoice.financing_type or "").lower() == "fractional"

    shares = None
    if is_fractional:
        share_price = float(invoice.share_price or 0.0)
        total_shares = int(invoice.supply or 0)
        if share_price <= 0 or total_shares <= 1:
            raise HTTPException(
                status_code=400,
                detail="Fractional invoice configuration is invalid",
            )

        if payload.shares is not None:
            shares = payload.shares
        elif payload.investment_amount is not None:
            shares = int(math.floor(payload.investment_amount / share_price))
        else:
            shares = 1

        if shares is None or shares <= 0:
            raise HTTPException(status_code=400, detail="shares must be greater than 0")

        funded_amount = round(shares * share_price, 2)
        if funded_amount > remaining_amount + 1e-6:
            raise HTTPException(
                status_code=400,
                detail="Selected shares exceed remaining available amount",
            )
    else:
        funded_amount = float(payload.investment_amount or remaining_amount)
        if funded_amount <= 0:
            raise HTTPException(
                status_code=400, detail="investment_amount must be greater than 0"
            )

        if abs(funded_amount - remaining_amount) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=(
                    "This invoice supports full funding only. "
                    f"Expected amount: {remaining_amount:.2f}"
                ),
            )

    snapshot = models.RepaymentSnapshot(
        invoice_id=invoice.id,
        investor_id=current_user.id,
        seller_id=invoice.seller_id,
        funded_amount=funded_amount,
        funded_at=datetime.now(timezone.utc),
        industry_sector=invoice.sector,
    )
    db.add(snapshot)

    new_funded_total = funded_total + funded_amount
    if new_funded_total + 1e-6 >= target_amount:
        invoice.status = "funded"
    else:
        invoice.status = "listed"
    invoice.escrow_status = "held"
    invoice.escrow_held_at = datetime.now(timezone.utc)
    invoice.escrow_reference = f"esc_{uuid4().hex[:16]}"

    db.commit()
    db.refresh(snapshot)
    db.refresh(invoice)

    listing = (
        db.query(models.MarketplaceListing)
        .filter(models.MarketplaceListing.invoice_id == invoice.id)
        .order_by(models.MarketplaceListing.created_at.desc())
        .first()
    )
    if listing is not None:
        listing.status = "sold" if invoice.status == "funded" else listing.status
        if listing.available_shares is not None and shares is not None:
            listing.available_shares = max(0, listing.available_shares - shares)

    tx_reference = f"sim_{uuid4().hex[:16]}"
    db.add(
        models.MarketplaceTransaction(
            invoice_id=invoice.id,
            listing_id=listing.id if listing else None,
            buyer_id=current_user.id,
            seller_id=invoice.seller_id,
            tx_type="fund",
            amount=float(funded_amount),
            status="completed",
            reference=tx_reference,
            tx_metadata={"shares": shares, "notes": payload.notes},
        )
    )
    db.commit()

    simulated_tx_id = tx_reference
    notification_hub.broadcast_from_sync(
        "invoice_funded",
        {
            "invoice_id": invoice.id,
            "status": invoice.status,
            "funded_amount": funded_amount,
            "target_amount": target_amount,
            "remaining_amount": max(target_amount - new_funded_total, 0.0),
            "escrow_status": invoice.escrow_status,
            "escrow_reference": invoice.escrow_reference,
            "investor_id": current_user.id,
        },
        roles={"admin", "investor"},
        user_ids={
            uid for uid in [invoice.seller_id, current_user.id] if uid is not None
        },
        invoice_id=invoice.id,
    )
    return {
        "message": "Funding simulated successfully",
        "invoice_id": invoice.id,
        "status": invoice.status,
        "funded_amount": funded_amount,
        "target_amount": target_amount,
        "remaining_amount": max(target_amount - new_funded_total, 0.0),
        "shares": shares,
        "repayment_snapshot_id": snapshot.id,
        "simulated_transaction_id": simulated_tx_id,
        "escrow_status": invoice.escrow_status,
        "escrow_reference": invoice.escrow_reference,
        "notes": payload.notes,
    }


@router.get("/{invoice_id:int}/bids")
def list_invoice_bids(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    bids = (
        db.query(models.AuctionBid)
        .filter(models.AuctionBid.invoice_id == invoice_id)
        .order_by(models.AuctionBid.amount.desc(), models.AuctionBid.created_at.asc())
        .all()
    )

    highest_active = next((b for b in bids if b.status == "active"), None)
    min_increment = float(invoice.min_bid_increment or 100.0)
    base_price = float(invoice.ask_price or invoice.amount or 0.0)
    next_min = (
        (float(highest_active.amount) + min_increment)
        if highest_active is not None
        else base_price
    )

    return {
        "invoice_id": invoice_id,
        "highest_bid": float(highest_active.amount) if highest_active else None,
        "next_min_bid": round(next_min, 2),
        "my_active_bid_id": (
            highest_active.id
            if highest_active and highest_active.bidder_id == current_user.id
            else None
        ),
        "bids": [
            {
                "id": bid.id,
                "invoice_id": bid.invoice_id,
                "bidder_id": bid.bidder_id,
                "amount": float(bid.amount),
                "status": bid.status,
                "is_mine": bid.bidder_id == current_user.id,
                "created_at": bid.created_at.isoformat() if bid.created_at else None,
            }
            for bid in bids
        ],
    }


@router.post("/{invoice_id:int}/bids")
def place_invoice_bid(
    invoice_id: int,
    payload: PlaceBidPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_kyc_approved),
):
    if current_user.role not in {UserRole.INVESTOR, UserRole.ADMIN}:
        raise HTTPException(status_code=403, detail="Only investors can place bids")

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if (invoice.financing_type or "").lower() != "auction":
        raise HTTPException(
            status_code=400, detail="This invoice is not configured for auction bidding"
        )

    if invoice.status not in {"approved", "listed", "minted"}:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invoice is not open for auction bidding. "
                "Expected approved/listed/minted status."
            ),
        )

    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Bid amount must be greater than 0")

    active_bids = (
        db.query(models.AuctionBid)
        .filter(
            models.AuctionBid.invoice_id == invoice_id,
            models.AuctionBid.status == "active",
        )
        .order_by(models.AuctionBid.amount.desc(), models.AuctionBid.created_at.asc())
        .all()
    )

    highest = active_bids[0] if active_bids else None
    min_increment = float(invoice.min_bid_increment or 100.0)
    base_price = float(invoice.ask_price or invoice.amount or 0.0)
    minimum_allowed = (float(highest.amount) + min_increment) if highest else base_price

    if payload.amount + 1e-9 < minimum_allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Bid too low. Minimum allowed bid is {minimum_allowed:.2f}",
        )

    for bid in active_bids:
        if bid.bidder_id != current_user.id:
            notification_hub.broadcast_from_sync(
                "auction_outbid",
                {
                    "invoice_id": invoice_id,
                    "outbidder_id": bid.bidder_id,
                    "new_high_bid": float(payload.amount),
                },
                user_ids={bid.bidder_id},
            )
        bid.status = "outbid"

    new_bid = models.AuctionBid(
        invoice_id=invoice_id,
        bidder_id=current_user.id,
        amount=float(payload.amount),
        status="active",
    )
    db.add(new_bid)
    listing = _upsert_listing_for_invoice(
        db,
        invoice,
        "auction",
        ask_price=invoice.ask_price,
        share_price=invoice.share_price,
        total_shares=invoice.supply,
    )
    db.flush()
    _open_or_create_auction(db, invoice, listing)

    db.add(
        models.MarketplaceTransaction(
            invoice_id=invoice.id,
            listing_id=listing.id,
            buyer_id=current_user.id,
            seller_id=invoice.seller_id,
            tx_type="bid",
            amount=float(payload.amount),
            status="completed",
            reference=f"bid_{new_bid.id if new_bid.id else uuid4().hex[:8]}",
            tx_metadata={"bid_status": "active"},
        )
    )
    db.commit()
    db.refresh(new_bid)

    notification_hub.broadcast_from_sync(
        "auction_bid_placed",
        {
            "invoice_id": invoice_id,
            "bid_id": new_bid.id,
            "bidder_id": new_bid.bidder_id,
            "amount": float(new_bid.amount),
            "status": new_bid.status,
        },
        roles={"admin", "investor"},
        user_ids={
            uid for uid in [invoice.seller_id, current_user.id] if uid is not None
        },
        invoice_id=invoice.id,
    )

    return {
        "message": "Bid placed successfully",
        "invoice_id": invoice_id,
        "bid": {
            "id": new_bid.id,
            "bidder_id": new_bid.bidder_id,
            "amount": float(new_bid.amount),
            "status": new_bid.status,
            "created_at": (
                new_bid.created_at.isoformat() if new_bid.created_at else None
            ),
        },
    }


@router.post("/{invoice_id:int}/bids/cancel-my-active")
def cancel_my_active_bid(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_kyc_approved),
):
    if current_user.role not in {UserRole.INVESTOR, UserRole.ADMIN}:
        raise HTTPException(status_code=403, detail="Only investors can cancel bids")

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if (invoice.financing_type or "").lower() != "auction":
        raise HTTPException(
            status_code=400, detail="This invoice is not configured for auction bidding"
        )

    if invoice.status in {"funded", "active", "settled", "defaulted"}:
        raise HTTPException(
            status_code=400, detail="Auction is already closed for this invoice"
        )

    my_active_bid = (
        db.query(models.AuctionBid)
        .filter(
            models.AuctionBid.invoice_id == invoice_id,
            models.AuctionBid.bidder_id == current_user.id,
            models.AuctionBid.status == "active",
        )
        .order_by(models.AuctionBid.amount.desc(), models.AuctionBid.created_at.asc())
        .first()
    )

    if my_active_bid is None:
        raise HTTPException(status_code=404, detail="No active bid found to retract")

    my_active_bid.status = "canceled"
    my_active_bid.canceled_at = datetime.now(timezone.utc)

    candidate_bids = (
        db.query(models.AuctionBid)
        .filter(
            models.AuctionBid.invoice_id == invoice_id,
            models.AuctionBid.status.in_(["active", "outbid"]),
        )
        .order_by(models.AuctionBid.amount.desc(), models.AuctionBid.created_at.asc())
        .all()
    )

    if candidate_bids:
        candidate_bids[0].status = "active"
        for bid in candidate_bids[1:]:
            bid.status = "outbid"

    db.commit()

    highest_active = next(
        (bid for bid in candidate_bids if bid.status == "active"), None
    )
    min_increment = float(invoice.min_bid_increment or 100.0)
    base_price = float(invoice.ask_price or invoice.amount or 0.0)
    next_min = (
        (float(highest_active.amount) + min_increment)
        if highest_active is not None
        else base_price
    )

    notification_hub.broadcast_from_sync(
        "auction_bid_retracted",
        {
            "invoice_id": invoice_id,
            "canceled_bid_id": my_active_bid.id,
            "bidder_id": current_user.id,
            "highest_bid": float(highest_active.amount) if highest_active else None,
            "next_min_bid": round(next_min, 2),
        },
        roles={"admin", "investor"},
        user_ids={
            uid for uid in [invoice.seller_id, current_user.id] if uid is not None
        },
        invoice_id=invoice.id,
    )

    return {
        "message": "Active bid retracted successfully",
        "invoice_id": invoice_id,
        "canceled_bid_id": my_active_bid.id,
        "highest_bid": float(highest_active.amount) if highest_active else None,
        "next_min_bid": round(next_min, 2),
    }


@router.post("/{invoice_id:int}/auction/close")
def close_invoice_auction(
    invoice_id: int,
    payload: CloseAuctionPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if (invoice.financing_type or "").lower() != "auction":
        raise HTTPException(status_code=400, detail="Invoice is not an auction listing")

    if invoice.status in {"funded", "active", "settled", "defaulted"}:
        raise HTTPException(
            status_code=400,
            detail=f"Invoice status '{invoice.status}' cannot be auction-closed",
        )

    winner = (
        db.query(models.AuctionBid)
        .filter(
            models.AuctionBid.invoice_id == invoice_id,
            models.AuctionBid.status == "active",
        )
        .order_by(models.AuctionBid.amount.desc(), models.AuctionBid.created_at.asc())
        .first()
    )

    if winner is None:
        raise HTTPException(
            status_code=400, detail="Cannot close auction without active bids"
        )

    winner_user = db.query(User).filter(User.id == winner.bidder_id).first()

    winner.status = "winning"
    invoice.ask_price = float(winner.amount)
    invoice.status = "funded"
    invoice.escrow_status = "held"
    invoice.escrow_held_at = datetime.now(timezone.utc)
    invoice.escrow_reference = f"esc_{uuid4().hex[:16]}"

    snapshot = models.RepaymentSnapshot(
        invoice_id=invoice.id,
        investor_id=winner.bidder_id,
        seller_id=invoice.seller_id,
        funded_amount=float(winner.amount),
        funded_at=datetime.now(timezone.utc),
        industry_sector=invoice.sector,
    )
    db.add(snapshot)

    listing = _upsert_listing_for_invoice(
        db,
        invoice,
        "auction",
        ask_price=invoice.ask_price,
        share_price=invoice.share_price,
        total_shares=invoice.supply,
    )
    listing.status = "sold"

    auction = _open_or_create_auction(db, invoice, listing)
    auction.status = "closed"
    auction.winning_bid_id = winner.id
    auction.ended_at = datetime.now(timezone.utc)

    auction_tx_ref = f"sim_auction_{uuid4().hex[:16]}"
    db.add(
        models.MarketplaceTransaction(
            invoice_id=invoice.id,
            listing_id=listing.id,
            buyer_id=winner.bidder_id,
            seller_id=invoice.seller_id,
            tx_type="buy",
            amount=float(winner.amount),
            status="completed",
            reference=auction_tx_ref,
            tx_metadata={"winner_bid_id": winner.id, "notes": payload.notes},
        )
    )

    db.commit()
    db.refresh(snapshot)

    simulated_tx_id = auction_tx_ref
    closed_at = datetime.now(timezone.utc)
    notification_hub.broadcast_from_sync(
        "auction_closed",
        {
            "invoice_id": invoice.id,
            "status": invoice.status,
            "winning_bid": float(winner.amount),
            "winner_bidder_id": winner.bidder_id,
            "winner_name": winner_user.full_name if winner_user else None,
            "winner_email": winner_user.email if winner_user else None,
            "escrow_status": invoice.escrow_status,
            "escrow_reference": invoice.escrow_reference,
            "closed_by": current_user.id,
            "closed_at": closed_at.isoformat(),
        },
        roles={"admin", "investor"},
        user_ids={
            uid for uid in [invoice.seller_id, winner.bidder_id] if uid is not None
        },
        invoice_id=invoice.id,
    )
    return {
        "message": "Auction closed successfully",
        "invoice_id": invoice.id,
        "status": invoice.status,
        "winning_bid": float(winner.amount),
        "winner_bid_id": winner.id,
        "winner_bidder_id": winner.bidder_id,
        "winner_name": winner_user.full_name if winner_user else None,
        "winner_email": winner_user.email if winner_user else None,
        "winner_created_at": (
            winner.created_at.isoformat() if winner.created_at else None
        ),
        "repayment_snapshot_id": snapshot.id,
        "simulated_transaction_id": simulated_tx_id,
        "escrow_status": invoice.escrow_status,
        "escrow_reference": invoice.escrow_reference,
        "closed_at": closed_at.isoformat(),
        "closed_by": current_user.id,
        "notes": payload.notes,
    }


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


@router.get("/admin/flagged")
def get_flagged_invoices(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    flagged = (
        db.query(Invoice)
        .filter((Invoice.is_duplicate) | (Invoice.status == "flagged"))
        .order_by(Invoice.created_at.desc())
        .all()
    )
    return {"flagged_invoices": [_invoice_to_dict(inv, db) for inv in flagged]}


def _invoice_to_dict(invoice: Invoice, db: Session | None = None) -> dict:
    latest_flag: FraudFlag | None = None
    if db is not None:
        latest_flag = (
            db.query(FraudFlag)
            .filter(FraudFlag.invoice_id == invoice.id)
            .order_by(FraudFlag.created_at.desc())
            .first()
        )

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
        "escrow_status": invoice.escrow_status,
        "escrow_reference": invoice.escrow_reference,
        "escrow_held_at": (
            invoice.escrow_held_at.isoformat() if invoice.escrow_held_at else None
        ),
        "escrow_released_at": (
            invoice.escrow_released_at.isoformat()
            if invoice.escrow_released_at
            else None
        ),
        "anomaly": latest_flag.anomaly_metadata if latest_flag else None,
        "fraud_flag": (
            {
                "id": latest_flag.id,
                "severity": latest_flag.severity,
                "reason": latest_flag.reason,
                "is_resolved": latest_flag.is_resolved,
                "resolution_action": latest_flag.resolution_action,
                "resolved_by": latest_flag.resolved_by,
            }
            if latest_flag
            else None
        ),
        "upload_url": _to_upload_url(invoice.file_path),
        "created_at": str(invoice.created_at),
    }
