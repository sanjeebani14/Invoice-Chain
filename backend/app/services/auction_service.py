import logging
import os
from typing import Dict, Any, Optional
from web3 import Web3
from eth_account import Account
from sqlalchemy.orm import Session
from datetime import datetime

from ..models import Invoice, MarketplaceAuction, User
from .blockchain import get_blockchain_service

logger = logging.getLogger(__name__)


class AuctionBlockchainService:
    """Service for managing blockchain auction operations."""

    def __init__(self):
        self.blockchain_service = get_blockchain_service()
        self.w3 = self.blockchain_service.w3
        self.auction_contract_address = os.getenv("AUCTION_CONTRACT_ADDRESS")
        self.auction_abi = self._load_auction_abi()

        if not self.auction_contract_address:
            raise ValueError("AUCTION_CONTRACT_ADDRESS environment variable not set")

        self.auction_contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(self.auction_contract_address),
            abi=self.auction_abi,
        )

    def _load_auction_abi(self) -> list:
        """Load Auction contract ABI."""
        abi_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "..",
            "blockchain",
            "artifacts",
            "contracts",
            "Auction.sol",
            "Auction.json",
        )

        fallback_paths = [
            os.path.join(os.getcwd(), "blockchain", "artifacts", "contracts", "Auction.sol", "Auction.json"),
            "/app/blockchain/artifacts/contracts/Auction.sol/Auction.json",
        ]

        if not os.path.exists(abi_path):
            for fallback in fallback_paths:
                if os.path.exists(fallback):
                    abi_path = fallback
                    break

        if not os.path.exists(abi_path):
            raise FileNotFoundError(f"Auction.json not found at {abi_path}")

        import json
        with open(abi_path, "r") as f:
            artifact = json.load(f)

        return artifact.get("abi", artifact)

    def create_auction_on_chain(
        self,
        token_id: int,
        shares_on_auction: int,
        starting_price_wei: int,
        duration_seconds: int,
        seller_address: str,
        seller_private_key: str,
    ) -> Dict[str, Any]:
        """
        Create auction on-chain.

        Args:
            token_id: The invoice NFT token ID.
            shares_on_auction: Number of shares to auction.
            starting_price_wei: Starting bid price in wei.
            duration_seconds: Auction duration in seconds.
            seller_address: Seller's wallet address.
            seller_private_key: Seller's private key for signing.

        Returns:
            Dict with auction ID and transaction hash.
        """
        try:
            seller_address = Web3.to_checksum_address(seller_address)

            account = Account.from_key(seller_private_key)
            assert account.address.lower() == seller_address.lower(), "Private key mismatch"

            # Build transaction
            tx = self.auction_contract.functions.createAuction(
                token_id,
                shares_on_auction,
                starting_price_wei,
                duration_seconds,
            ).build_transaction(
                {
                    "from": seller_address,
                    "nonce": self.w3.eth.get_transaction_count(seller_address),
                    "gas": 500000,
                    "gasPrice": self.w3.eth.gas_price,
                }
            )

            # Sign and send
            signed_tx = self.w3.eth.account.sign_transaction(tx, seller_private_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)

            logger.info(f"Auction creation tx sent: {tx_hash.hex()}")

            # Wait for receipt
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            if receipt["status"] != 1:
                return {
                    "success": False,
                    "error": "Transaction reverted",
                    "receipt": receipt,
                }

            # Parse auction ID from logs
            auction_id = None
            try:
                logs = self.auction_contract.events.AuctionCreated().process_receipt(receipt)
                if logs:
                    auction_id = logs[0]["args"]["auctionId"]
            except Exception as e:
                logger.warning(f"Could not extract auction ID: {e}")

            return {
                "success": True,
                "tx_hash": tx_hash.hex(),
                "auction_id": auction_id,
                "receipt": receipt,
            }

        except Exception as e:
            logger.error(f"Error creating auction: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
            }

    def place_bid_on_chain(
        self,
        auction_id: int,
        bid_amount_wei: int,
        bidder_address: str,
        bidder_private_key: str,
    ) -> Dict[str, Any]:
        """Place bid on on-chain auction."""
        try:
            bidder_address = Web3.to_checksum_address(bidder_address)
            account = Account.from_key(bidder_private_key)
            assert account.address.lower() == bidder_address.lower(), "Private key mismatch"

            tx = self.auction_contract.functions.placeBid(auction_id).build_transaction(
                {
                    "from": bidder_address,
                    "value": bid_amount_wei,
                    "nonce": self.w3.eth.get_transaction_count(bidder_address),
                    "gas": 300000,
                    "gasPrice": self.w3.eth.gas_price,
                }
            )

            signed_tx = self.w3.eth.account.sign_transaction(tx, bidder_private_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)

            logger.info(f"Bid placement tx sent: {tx_hash.hex()}")

            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            if receipt["status"] != 1:
                return {"success": False, "error": "Bid transaction reverted"}

            return {
                "success": True,
                "tx_hash": tx_hash.hex(),
                "receipt": receipt,
            }

        except Exception as e:
            logger.error(f"Error placing bid: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    def settle_auction_on_chain(
        self,
        auction_id: int,
        settler_private_key: str,
    ) -> Dict[str, Any]:
        """
        Settle auction on-chain (release funds and transfer shares).
        Can be called by anyone, but typically the contract owner.
        """
        try:
            account = Account.from_key(settler_private_key)
            settler_address = account.address

            tx = self.auction_contract.functions.settleAuction(auction_id).build_transaction(
                {
                    "from": settler_address,
                    "nonce": self.w3.eth.get_transaction_count(settler_address),
                    "gas": 400000,
                    "gasPrice": self.w3.eth.gas_price,
                }
            )

            signed_tx = self.w3.eth.account.sign_transaction(tx, settler_private_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)

            logger.info(f"Auction settlement tx sent: {tx_hash.hex()}")

            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            if receipt["status"] != 1:
                return {"success": False, "error": "Settlement transaction reverted"}

            return {
                "success": True,
                "tx_hash": tx_hash.hex(),
                "receipt": receipt,
            }

        except Exception as e:
            logger.error(f"Error settling auction: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    def get_auction_data_on_chain(self, auction_id: int) -> Dict[str, Any]:
        """Fetch auction data from blockchain."""
        try:
            data = self.auction_contract.functions.getAuction(auction_id).call()
            return {
                "success": True,
                "data": {
                    "auction_id": data[0],
                    "token_id": data[1],
                    "seller": data[2],
                    "shares_on_auction": data[3],
                    "starting_price": data[4],
                    "highest_bid": data[5],
                    "highest_bidder": data[6],
                    "start_time": data[7],
                    "end_time": data[8],
                    "status": data[9],  # 0=Active, 1=Settled, 2=Cancelled
                },
            }
        except Exception as e:
            logger.error(f"Error fetching auction data: {e}")
            return {"success": False, "error": str(e)}


class AuctionService:
    """High-level auction service (backend-only logic)."""

    def __init__(self):
        self.blockchain = AuctionBlockchainService()

    def create_auction(
        self,
        db: Session,
        invoice_id: int,
        seller_id: int,
        starting_price: float,
        duration_hours: int,
        total_shares: int,
    ) -> Dict[str, Any]:
        """
        Create auction in DB and on-chain.

        Args:
            db: Database session.
            invoice_id: Invoice database ID.
            seller_id: Seller database ID.
            starting_price: Starting bid in ETH.
            duration_hours: Auction duration in hours.
            total_shares: Total shares to auction.

        Returns:
            Dict with success status and auction details.
        """
        try:
            # Verify invoice
            invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
            if not invoice:
                return {"success": False, "error": "Invoice not found"}

            if invoice.token_id is None:
                return {"success": False, "error": "Invoice not yet minted"}

            # Verify seller
            seller = db.query(User).filter(User.id == seller_id).first()
            if not seller:
                return {"success": False, "error": "Seller not found"}

            # Create on-chain
            starting_price_wei = Web3.to_wei(starting_price, "ether")
            duration_seconds = duration_hours * 3600

            on_chain_result = self.blockchain.create_auction_on_chain(
                token_id=int(invoice.token_id),
                shares_on_auction=total_shares,
                starting_price_wei=starting_price_wei,
                duration_seconds=duration_seconds,
                seller_address=seller.primary_wallet or seller.wallet_address,
                seller_private_key=os.getenv("MINTER_PRIVATE_KEY"),  # Backend key for now
            )

            if not on_chain_result["success"]:
                return on_chain_result

            # Create DB record
            auction = MarketplaceAuction(
                invoice_id=invoice_id,
                seller_id=seller_id,
                status="open",
                start_price=starting_price,
                min_increment=starting_price * 0.05,  # 5%
                blockchain_auction_id=on_chain_result.get("auction_id"),
                tx_hash=on_chain_result["tx_hash"],
            )

            db.add(auction)
            db.commit()
            db.refresh(auction)

            return {
                "success": True,
                "auction_id": auction.id,
                "blockchain_auction_id": on_chain_result.get("auction_id"),
                "tx_hash": on_chain_result["tx_hash"],
            }

        except Exception as e:
            logger.error(f"Error creating auction: {e}", exc_info=True)
            db.rollback()
            return {"success": False, "error": str(e)}

    def place_bid(
        self,
        db: Session,
        auction_id: int,
        blockchain_auction_id: int,
        bidder_id: int,
        bid_amount: float,
    ) -> Dict[str, Any]:
        """Place bid on auction."""
        try:
            bidder = db.query(User).filter(User.id == bidder_id).first()
            if not bidder:
                return {"success": False, "error": "Bidder not found"}

            bid_amount_wei = Web3.to_wei(bid_amount, "ether")

            on_chain_result = self.blockchain.place_bid_on_chain(
                auction_id=blockchain_auction_id,
                bid_amount_wei=bid_amount_wei,
                bidder_address=bidder.primary_wallet or bidder.wallet_address,
                bidder_private_key=os.getenv("MINTER_PRIVATE_KEY"),  # Should use bidder's key
            )

            if not on_chain_result["success"]:
                return on_chain_result

            # Create bid record in DB
            from . import models
            bid = models.MarketplaceBid(
                auction_id=auction_id,
                bidder_id=bidder_id,
                amount=bid_amount,
                status="active",
                tx_hash=on_chain_result["tx_hash"],
            )

            db.add(bid)
            db.commit()
            db.refresh(bid)

            return {
                "success": True,
                "bid_id": bid.id,
                "tx_hash": on_chain_result["tx_hash"],
            }

        except Exception as e:
            logger.error(f"Error placing bid: {e}", exc_info=True)
            db.rollback()
            return {"success": False, "error": str(e)}


_auction_service: Optional[AuctionService] = None


def get_auction_service() -> AuctionService:
    """Get or initialize auction service."""
    global _auction_service
    if _auction_service is None:
        _auction_service = AuctionService()
    return _auction_service