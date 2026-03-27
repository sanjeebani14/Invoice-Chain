import logging
import os
import json
from typing import Dict, Any, Optional
from web3 import Web3
from eth_account import Account
from sqlalchemy.orm import Session
from datetime import datetime

logger = logging.getLogger(__name__)


class EscrowBlockchainService:
    """Service for managing blockchain escrow operations."""

    def __init__(self):
        from .blockchain import get_blockchain_service

        self.blockchain_service = get_blockchain_service()
        self.w3 = self.blockchain_service.w3
        self.escrow_contract_address = os.getenv("ESCROW_CONTRACT_ADDRESS")
        self.escrow_abi = self._load_escrow_abi()

        if not self.escrow_contract_address:
            raise ValueError("ESCROW_CONTRACT_ADDRESS environment variable not set")

        self.escrow_contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(self.escrow_contract_address),
            abi=self.escrow_abi,
        )

    def _load_escrow_abi(self) -> list:
        """Load Escrow contract ABI."""
        abi_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "..",
            "blockchain",
            "artifacts",
            "contracts",
            "Escrow.sol",
            "Escrow.json",
        )

        fallback_paths = [
            os.path.join(os.getcwd(), "blockchain", "artifacts", "contracts", "Escrow.sol", "Escrow.json"),
            "/app/blockchain/artifacts/contracts/Escrow.sol/Escrow.json",
        ]

        if not os.path.exists(abi_path):
            for fallback in fallback_paths:
                if os.path.exists(fallback):
                    abi_path = fallback
                    break

        if not os.path.exists(abi_path):
            raise FileNotFoundError(f"Escrow.json not found at {abi_path}")

        with open(abi_path, "r") as f:
            artifact = json.load(f)

        return artifact.get("abi", artifact)

    def create_escrow_on_chain(
        self,
        invoice_id: int,
        token_id: int,
        investor_address: str,
        seller_address: str,
        amount_wei: int,
        shares: int,
    ) -> Dict[str, Any]:
        """
        Create escrow record on-chain.
        Called by owner (backend) after successful purchase.
        """
        try:
            investor_address = Web3.to_checksum_address(investor_address)
            seller_address = Web3.to_checksum_address(seller_address)

            owner_key = os.getenv("MINTER_PRIVATE_KEY")
            if not owner_key:
                raise ValueError("MINTER_PRIVATE_KEY not set")

            account = Account.from_key(owner_key)

            tx = self.escrow_contract.functions.createEscrow(
                invoice_id,
                token_id,
                investor_address,
                seller_address,
                amount_wei,
                shares,
            ).build_transaction(
                {
                    "from": account.address,
                    "nonce": self.w3.eth.get_transaction_count(account.address),
                    "gas": 300000,
                    "gasPrice": self.w3.eth.gas_price,
                }
            )

            signed_tx = self.w3.eth.account.sign_transaction(tx, owner_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)

            logger.info(f"Escrow creation tx sent: {tx_hash.hex()}")

            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            if receipt["status"] != 1:
                return {"success": False, "error": "Escrow creation reverted"}

            # Parse escrow ID
            escrow_id = None
            try:
                logs = self.escrow_contract.events.EscrowCreated().process_receipt(receipt)
                if logs:
                    escrow_id = logs[0]["args"]["escrowId"]
            except Exception as e:
                logger.warning(f"Could not extract escrow ID: {e}")

            return {
                "success": True,
                "escrow_id": escrow_id,
                "tx_hash": tx_hash.hex(),
            }

        except Exception as e:
            logger.error(f"Error creating escrow: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    def release_escrow_on_chain(self, escrow_id: int) -> Dict[str, Any]:
        """Release escrowed funds to seller after settlement."""
        try:
            owner_key = os.getenv("MINTER_PRIVATE_KEY")
            if not owner_key:
                raise ValueError("MINTER_PRIVATE_KEY not set")

            account = Account.from_key(owner_key)

            tx = self.escrow_contract.functions.releaseEscrow(escrow_id).build_transaction(
                {
                    "from": account.address,
                    "nonce": self.w3.eth.get_transaction_count(account.address),
                    "gas": 300000,
                    "gasPrice": self.w3.eth.gas_price,
                }
            )

            signed_tx = self.w3.eth.account.sign_transaction(tx, owner_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)

            logger.info(f"Escrow release tx sent: {tx_hash.hex()}")

            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            if receipt["status"] != 1:
                return {"success": False, "error": "Release transaction reverted"}

            return {
                "success": True,
                "tx_hash": tx_hash.hex(),
            }

        except Exception as e:
            logger.error(f"Error releasing escrow: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    def get_escrow_on_chain(self, escrow_id: int) -> Dict[str, Any]:
        """Fetch escrow data from blockchain."""
        try:
            data = self.escrow_contract.functions.getEscrow(escrow_id).call()
            return {
                "success": True,
                "data": {
                    "escrow_id": data[0],
                    "invoice_id": data[1],
                    "token_id": data[2],
                    "investor": data[3],
                    "seller": data[4],
                    "amount": data[5],
                    "shares": data[6],
                    "created_at": data[7],
                    "release_date": data[8],
                    "status": data[9],  # 0=Held, 1=Released, 2=Disputed, 3=Refunded
                },
            }
        except Exception as e:
            logger.error(f"Error fetching escrow: {e}")
            return {"success": False, "error": str(e)}


class EscrowService:
    """High-level escrow service."""

    def __init__(self):
        self.blockchain = EscrowBlockchainService()

    def create_escrow(
        self,
        db: Session,
        invoice_id: int,
        token_id: int,
        investor_address: str,
        seller_address: str,
        amount: float,
        shares: int,
    ) -> Dict[str, Any]:
        """Create escrow after successful purchase."""
        try:
            amount_wei = Web3.to_wei(amount, "ether")

            on_chain_result = self.blockchain.create_escrow_on_chain(
                invoice_id=invoice_id,
                token_id=token_id,
                investor_address=investor_address,
                seller_address=seller_address,
                amount_wei=amount_wei,
                shares=shares,
            )

            if not on_chain_result["success"]:
                return on_chain_result

            # DB record
            from . import models

            escrow = models.EscrowRecord(
                invoice_id=invoice_id,
                investor_id=None,  # Get from investor_address lookup if required
                seller_id=None,  # Get from seller_address lookup if required
                amount=amount,
                shares=shares,
                blockchain_escrow_id=on_chain_result.get("escrow_id"),
                status="held",
                tx_hash=on_chain_result["tx_hash"],
            )

            db.add(escrow)
            db.commit()
            db.refresh(escrow)

            logger.info(f"Escrow created: {escrow.id} -> blockchain: {on_chain_result.get('escrow_id')}")

            return {
                "success": True,
                "escrow_id": escrow.id,
                "blockchain_escrow_id": on_chain_result.get("escrow_id"),
            }

        except Exception as e:
            logger.error(f"Error creating escrow: {e}", exc_info=True)
            db.rollback()
            return {"success": False, "error": str(e)}

    def release_escrow_on_settlement(
        self,
        db: Session,
        escrow_id: int,
        blockchain_escrow_id: int,
    ) -> Dict[str, Any]:
        """
        Release escrow after invoice payment confirmed.
        Burns invoice shares and releases funds to seller.
        """
        try:
            # Release on-chain (burns shares + transfers funds)
            on_chain_result = self.blockchain.release_escrow_on_chain(blockchain_escrow_id)

            if not on_chain_result["success"]:
                return on_chain_result

            # Update DB record
            from . import models

            escrow = db.query(models.EscrowRecord).filter(models.EscrowRecord.id == escrow_id).first()
            if escrow:
                escrow.status = "released"
                escrow.released_at = datetime.utcnow()
                db.commit()

            logger.info(f"Escrow {escrow_id} released (blockchain: {blockchain_escrow_id})")

            return {
                "success": True,
                "tx_hash": on_chain_result["tx_hash"],
            }

        except Exception as e:
            logger.error(f"Error releasing escrow: {e}", exc_info=True)
            db.rollback()
            return {"success": False, "error": str(e)}


_escrow_service: Optional[EscrowService] = None


def get_escrow_service() -> EscrowService:
    """Get or initialize escrow service."""
    global _escrow_service
    if _escrow_service is None:
        _escrow_service = EscrowService()
    return _escrow_service