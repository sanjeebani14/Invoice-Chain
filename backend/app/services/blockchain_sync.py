import logging
import os
import threading
from typing import Optional
from datetime import datetime

from sqlalchemy.orm import Session

from .blockchain import get_blockchain_service
from ..database import SessionLocal
from ..models import BlockchainSyncState, Invoice, MarketplaceTransaction

logger = logging.getLogger(__name__)

_worker_thread: Optional[threading.Thread] = None
_stop_event = threading.Event()


def _get_or_create_sync_state(
    db: Session, contract_address: str, current_head: int
) -> BlockchainSyncState:
    state = (
        db.query(BlockchainSyncState)
        .filter(BlockchainSyncState.contract_address == contract_address)
        .first()
    )

    if state:
        return state

    configured_start = (
        os.getenv("BLOCKCHAIN_SYNC_START_BLOCK", "latest").strip().lower()
    )
    if configured_start == "latest":
        start_block = current_head
    else:
        try:
            start_block = max(0, int(configured_start))
        except ValueError:
            start_block = current_head

    state = BlockchainSyncState(
        contract_address=contract_address,
        last_synced_block=start_block,
        last_synced_at=datetime.utcnow(),
        last_error=None,
    )
    db.add(state)
    db.commit()
    db.refresh(state)
    return state


def _ensure_hex_prefixed(value: str) -> str:
    if not value:
        return ""
    return value if value.startswith("0x") else f"0x{value}"


def _decode_invoice_hash(raw_hash) -> str:
    if isinstance(raw_hash, bytes):
        return _ensure_hex_prefixed(raw_hash.hex())
    return _ensure_hex_prefixed(str(raw_hash))


def _ingest_invoice_minted_event(db: Session, event, tx_hash: str) -> None:
    args = event.get("args", {})
    token_id = args.get("tokenId")
    invoice_hash = _decode_invoice_hash(args.get("invoiceHash"))
    minter = args.get("minter")
    face_value = args.get("faceValue")
    due_date = args.get("dueDate")
    supply = args.get("supply")
    uri = args.get("uri")

    if token_id is None or not invoice_hash:
        return

    invoice = db.query(Invoice).filter(Invoice.canonical_hash == invoice_hash).first()
    if invoice:
        invoice.token_id = str(token_id)
        if invoice.status in {"approved", "pending_mint", "minting_failed"}:
            invoice.status = "minted"

    if not invoice:
        logger.warning(
            "Blockchain sync: no invoice found for hash=%s (tx=%s)",
            invoice_hash,
            tx_hash,
        )
        return

    existing = (
        db.query(MarketplaceTransaction)
        .filter(
            MarketplaceTransaction.reference == tx_hash,
            MarketplaceTransaction.tx_type == "mint",
        )
        .first()
    )
    if not existing:
        db.add(
            MarketplaceTransaction(
                invoice_id=invoice.id,
                seller_id=invoice.seller_id,
                tx_type="mint",
                amount=float(invoice.amount if invoice.amount is not None else 0.0),
                status="completed",
                reference=tx_hash,
                tx_metadata={
                    "token_id": str(token_id),
                    "invoice_hash": invoice_hash,
                    "minter": str(minter) if minter is not None else None,
                    "face_value": int(face_value) if face_value is not None else None,
                    "due_date": int(due_date) if due_date is not None else None,
                    "supply": int(supply) if supply is not None else None,
                    "uri": str(uri) if uri is not None else None,
                    "source": "blockchain_sync",
                },
            )
        )


def _ingest_invoice_burned_event(db: Session, event, tx_hash: str) -> None:
    args = event.get("args", {})
    token_id = args.get("tokenId")
    burner = args.get("burner")
    if token_id is None:
        return

    invoice = db.query(Invoice).filter(Invoice.token_id == str(token_id)).first()
    if not invoice:
        logger.warning(
            "Blockchain sync: no invoice found for burned token_id=%s (tx=%s)",
            token_id,
            tx_hash,
        )
        return

    if invoice.status not in {"settled", "sold"}:
        invoice.status = "burned"

    existing = (
        db.query(MarketplaceTransaction)
        .filter(
            MarketplaceTransaction.reference == tx_hash,
            MarketplaceTransaction.tx_type == "burn",
        )
        .first()
    )
    if not existing:
        db.add(
            MarketplaceTransaction(
                invoice_id=invoice.id,
                seller_id=invoice.seller_id,
                tx_type="burn",
                amount=float(invoice.amount if invoice.amount is not None else 0.0),
                status="completed",
                reference=tx_hash,
                tx_metadata={
                    "token_id": str(token_id),
                    "burner": str(burner) if burner is not None else None,
                    "source": "blockchain_sync",
                },
            )
        )


def _sync_invoice_minted_events(
    db: Session, from_block: int, to_block: int, chunk_size: int = 1000
) -> int:
    service = get_blockchain_service()
    processed = 0

    if to_block < from_block:
        return processed

    for start in range(from_block, to_block + 1, chunk_size):
        end = min(start + chunk_size - 1, to_block)
        events = service.contract.events.InvoiceMinted().get_logs(
            from_block=start, to_block=end
        )
        for event in events:
            tx_hash = event.get("transactionHash")
            tx_hex = tx_hash.hex() if tx_hash else ""
            _ingest_invoice_minted_event(db, event, tx_hex)
            processed += 1

    return processed


def _sync_invoice_burned_events(
    db: Session, from_block: int, to_block: int, chunk_size: int = 1000
) -> int:
    service = get_blockchain_service()
    processed = 0

    if to_block < from_block:
        return processed

    for start in range(from_block, to_block + 1, chunk_size):
        end = min(start + chunk_size - 1, to_block)
        events = service.contract.events.InvoiceBurned().get_logs(
            from_block=start, to_block=end
        )
        for event in events:
            tx_hash = event.get("transactionHash")
            tx_hex = tx_hash.hex() if tx_hash else ""
            _ingest_invoice_burned_event(db, event, tx_hex)
            processed += 1

    return processed


def sync_blockchain_events_once() -> None:
    # Sync blockchain invoice lifecycle events into local invoice and ledger tables.
    service = get_blockchain_service()
    latest_block = int(service.w3.eth.block_number)
    contract_address = str(service.contract.address)
    db = SessionLocal()

    try:
        state = _get_or_create_sync_state(db, contract_address, latest_block)
        start_from = max(0, int(state.last_synced_block) + 1)
        if start_from > latest_block:
            state.last_synced_at = datetime.utcnow()
            state.last_error = None
            db.commit()
            logger.info(
                "Blockchain sync idle: head=%s, cursor=%s",
                latest_block,
                state.last_synced_block,
            )
            return

        minted_processed = _sync_invoice_minted_events(db, start_from, latest_block)
        burned_processed = _sync_invoice_burned_events(db, start_from, latest_block)
        processed = minted_processed + burned_processed
        state.last_synced_block = latest_block
        state.last_synced_at = datetime.utcnow()
        state.last_error = None
        db.commit()
        logger.info(
            "Blockchain sync completed: from=%s to=%s processed_events=%s minted=%s burned=%s",
            start_from,
            latest_block,
            processed,
            minted_processed,
            burned_processed,
        )
    except Exception as exc:
        db.rollback()
        try:
            state = (
                db.query(BlockchainSyncState)
                .filter(BlockchainSyncState.contract_address == contract_address)
                .first()
            )
            if state:
                state.last_error = str(exc)
                state.last_synced_at = datetime.utcnow()
                db.commit()
        except Exception:
            db.rollback()
        raise
    finally:
        db.close()


def _sync_loop(interval_seconds: int) -> None:
    while not _stop_event.is_set():
        try:
            sync_blockchain_events_once()
        except Exception as exc:
            logger.warning("Blockchain sync iteration failed: %s", exc)
        _stop_event.wait(interval_seconds)


def start_blockchain_sync_worker() -> None:
    global _worker_thread
    if _worker_thread and _worker_thread.is_alive():
        return

    enabled = os.getenv("BLOCKCHAIN_SYNC_ENABLED", "false").strip().lower() == "true"
    if not enabled:
        logger.info(
            "Blockchain sync worker is disabled (BLOCKCHAIN_SYNC_ENABLED=false)"
        )
        return

    interval_seconds = int(os.getenv("BLOCKCHAIN_SYNC_INTERVAL_SECONDS", "30"))
    _stop_event.clear()
    _worker_thread = threading.Thread(
        target=_sync_loop,
        args=(interval_seconds,),
        daemon=True,
        name="blockchain-sync-worker",
    )
    _worker_thread.start()
    logger.info("Blockchain sync worker started (interval=%ss)", interval_seconds)


def stop_blockchain_sync_worker() -> None:
    _stop_event.set()
