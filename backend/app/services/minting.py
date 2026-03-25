import logging
from datetime import datetime
from typing import Optional, Dict, Tuple, Any
from sqlalchemy.orm import Session
from web3 import Web3
import math

from ..models import Invoice
from .blockchain import get_blockchain_service
from .hashing import generate_invoice_hash

logger = logging.getLogger(__name__)

#Service for minting invoices as NFTs with fractional share support.
class InvoiceMintingService:
    
    def __init__(self):
        
        self.blockchain_service = get_blockchain_service()

    def prepare_invoice_for_minting(
        self,
        db: Session,
        invoice_id: int,
    ) -> Tuple[bool, Optional[str], Optional[Dict]]:
        
        try:
            invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()

            if not invoice:
                return False, "Invoice not found", None

            # Validate invoice status
            if invoice.status not in ["approved", "pending_mint"]:
                return False, f"Invoice status '{invoice.status}' not eligible for minting", None

            # Check if already minted
            if invoice.token_id is not None:
                return False, "Invoice already minted (token_id exists)", None

            # Validate required fields
            if not invoice.canonical_hash:
                return False, "Invoice missing canonical_hash", None

            if not invoice.amount or invoice.amount <= 0:
                return False, "Invoice missing valid amount", None

            if not invoice.due_date:
                return False, "Invoice missing due date", None

            if not invoice.seller_id:
                return False, "Invoice missing seller_id", None

            # Parse due date 
            try:
                due_date_obj = datetime.fromisoformat(invoice.due_date.replace("Z", "+00:00"))
                due_date_unix = int(due_date_obj.timestamp())
            except Exception as e:
                return False, f"Could not parse due_date: {e}", None

            # Determine supply (fractional shares)
            supply = invoice.supply or 1

            # Validate supply
            if supply < 1:
                return False, "Supply must be >= 1", None

            # Validate share_price for fractional invoices
            if supply > 1 and (not invoice.share_price or invoice.share_price <= 0):
                return False, "Fractional invoices must have valid share_price", None

            # Prepare invoice metadata
            prepared_data = {
                "invoice_id": invoice.id,
                "seller_id": invoice.seller_id,
                "invoice_hash": invoice.canonical_hash,
                "face_value_wei": Web3.to_wei(invoice.amount, "ether"),
                "due_date_unix": due_date_unix,
                "supply": supply,
                "original_filename": invoice.original_filename,
                "invoice_number": invoice.invoice_number or "",
                "seller_name": invoice.seller_name or "",
            }

            return True, None, prepared_data

        except Exception as e:
            logger.error(f"Error preparing invoice {invoice_id} for minting: {e}", exc_info=True)
            return False, f"Preparation error: {str(e)}", None

    # Mint an invoice as an NFT with optional fractional shares.
    
    def mint_invoice(
        self,
        db: Session,
        invoice_id: int,
        recipient_address: str,
        ipfs_uri: str = "",
        supply: Optional[int] = None,
    ) -> Dict[str, Any]:
        
        try:
            # Validate recipient address
            if not Web3.is_address(recipient_address):
                return {
                    "success": False,
                    "error": f"Invalid recipient address: {recipient_address}",
                    "token_id": None,
                }

            # Prepare invoice
            success, error_msg, prepared_data = self.prepare_invoice_for_minting(db, invoice_id)
            if not success:
                return {
                    "success": False,
                    "error": error_msg,
                    "token_id": None,
                }

            invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()

            # Use provided supply or invoice supply
            if supply is not None:
                if supply < 1:
                    return {
                        "success": False,
                        "error": "Supply parameter must be >= 1",
                        "token_id": None,
                    }
                prepared_data["supply"] = supply
                invoice.supply = supply
            else:
                supply = prepared_data["supply"]

            # Log minting attempt
            logger.info(
                f"Minting invoice {invoice_id} with supply={supply} "
                f"(fractional={supply > 1}) to {recipient_address}"
            )

            # Call blockchain service to mint
            mint_result = self.blockchain_service.mint_invoice_nft(
                recipient_address=recipient_address,
                invoice_hash=prepared_data["invoice_hash"],
                face_value_wei=prepared_data["face_value_wei"],
                due_date_unix=prepared_data["due_date_unix"],
                supply=supply,
                token_uri=ipfs_uri,
            )

            if not mint_result["success"]:
                logger.error(f"Blockchain mint failed for invoice {invoice_id}: {mint_result['error']}")
                return {
                    "success": False,
                    "error": mint_result["error"],
                    "token_id": None,
                }

            # Update invoice in database
            token_id = mint_result.get("token_id")
            invoice.token_id = token_id
            invoice.status = "minted"
            invoice.supply = supply

            db.commit()
            db.refresh(invoice)

            logger.info(
                f"Successfully minted invoice {invoice_id}: "
                f"tokenId={token_id}, supply={supply}, tx={mint_result['tx_hash']}"
            )

            return {
                "success": True,
                "token_id": token_id,
                "tx_hash": mint_result["tx_hash"],
                "supply": supply,
                "receipt": mint_result.get("receipt"),
            }

        except Exception as e:
            logger.error(f"Error minting invoice {invoice_id}: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"Minting error: {str(e)}",
                "token_id": None,
            }
    
    # Validate fractional invoice configuration.
    def validate_fractional_config(
        self,
        amount: float,
        share_price: float,
        num_shares: int,
    ) -> Tuple[bool, Optional[str]]:
        try:
            if num_shares < 1:
                return False, "num_shares must be >= 1"

            if num_shares == 1:
                return True, None  # Single share is valid

            if share_price <= 0:
                return False, "share_price must be positive for fractional invoices"


            calculated_total = share_price * num_shares
            if not math.isclose(calculated_total, amount, rel_tol=0.01):
                return (
                    False,
                    f"Mismatch: share_price ({share_price}) × num_shares ({num_shares}) "
                    f"= {calculated_total}, but amount = {amount}",
                )

            return True, None

        except Exception as e:
            return False, f"Validation error: {str(e)}"


# Global service instance
_minting_service: Optional[InvoiceMintingService] = None


def get_invoice_minting_service() -> InvoiceMintingService:
    """Get or initialize the invoice minting service."""
    global _minting_service
    if _minting_service is None:
        _minting_service = InvoiceMintingService()
    return _minting_service
