"""
Blockchain service for InvoiceNFT smart contract interactions.
Handles minting, hash verification, and web3 connectivity.
"""

import os
import json
from typing import Optional, Dict, Any
from web3 import Web3
from eth_account import Account
import logging

logger = logging.getLogger(__name__)


class BlockchainService:
    """Manages Web3 interactions with InvoiceNFT contract."""

    def __init__(self):
        """Initialize Web3 connection and load contract details."""
        self.rpc_url = os.getenv("BLOCKCHAIN_RPC_URL", "http://127.0.0.1:8545")
        self.contract_address = os.getenv("INVOICE_NFT_CONTRACT_ADDRESS")
        self.minter_private_key = os.getenv("MINTER_PRIVATE_KEY")
        self.contract_abi = self._load_contract_abi()

        # Initialize Web3
        self.w3 = Web3(Web3.HTTPProvider(self.rpc_url))

        if not self.w3.is_connected():
            logger.warning(f"Failed to connect to blockchain at {self.rpc_url}")
        else:
            logger.info(f"Connected to blockchain: {self.rpc_url}")

        # Validate required config
        if not self.contract_address:
            raise ValueError(
                "INVOICE_NFT_CONTRACT_ADDRESS environment variable not set"
            )

        # Initialize contract instance
        self.contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(self.contract_address),
            abi=self.contract_abi,
        )

    def _load_contract_abi(self) -> list:
        """Load InvoiceNFT contract ABI from JSON file."""
        abi_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "..",
            "blockchain",
            "artifacts",
            "contracts",
            "InvoiceNFT.sol",
            "InvoiceNFT.json",
        )

        # Fallback: try alternate paths
        fallback_paths = [
            os.path.join(os.getcwd(), "blockchain", "artifacts", "contracts", "InvoiceNFT.sol", "InvoiceNFT.json"),
            "/app/blockchain/artifacts/contracts/InvoiceNFT.sol/InvoiceNFT.json",
        ]

        if not os.path.exists(abi_path):
            for fallback in fallback_paths:
                if os.path.exists(fallback):
                    abi_path = fallback
                    break

        if not os.path.exists(abi_path):
            raise FileNotFoundError(
                f"InvoiceNFT.json not found at {abi_path}. "
                "Please ensure contract artifacts are generated."
            )

        with open(abi_path, "r") as f:
            artifact = json.load(f)

        # Extract ABI from artifact
        abi = artifact.get("abi", artifact)
        return abi

    def is_hash_registered(self, invoice_hash: str) -> bool:
        """
        Check if an invoice hash is already registered on-chain.
        
        Args:
            invoice_hash: keccak256 hash as hex string (with or without 0x prefix)
        
        Returns:
            bool: True if hash is registered, False otherwise
        """
        try:
            # Ensure hash has 0x prefix
            if not invoice_hash.startswith("0x"):
                invoice_hash = "0x" + invoice_hash

            # Convert hex string to bytes32
            invoice_hash_bytes = bytes.fromhex(invoice_hash[2:].ljust(64, "0"))

            result = self.contract.functions.isHashRegistered(
                invoice_hash_bytes
            ).call()
            return result
        except Exception as e:
            logger.error(f"Error checking hash registration: {e}")
            return False

    def mint_invoice_nft(
        self,
        recipient_address: str,
        invoice_hash: str,
        face_value_wei: int,
        due_date_unix: int,
        supply: int = 1,
        token_uri: str = "",
    ) -> Dict[str, Any]:
        """
        Mint an InvoiceNFT with fractional share support.
        
        Args:
            recipient_address: seller wallet receiving the NFT
            invoice_hash: keccak256 hash of invoice (hex string with or without 0x)
            face_value_wei: Invoice amount in wei
            due_date_unix: Unix timestamp of due date
            supply: 1 for whole invoice, N for N fractional shares
            token_uri: IPFS URI of invoice document
        
        Returns:
            Dict with transaction hash, token_id, and status
        """
        try:
            # Validate inputs
            if not self.w3.is_address(recipient_address):
                raise ValueError(f"Invalid recipient address: {recipient_address}")

            if supply < 1:
                raise ValueError("Supply must be >= 1")

            latest_block = self.w3.eth.get_block("latest")
            latest_block_ts = int(latest_block["timestamp"])
            if due_date_unix <= latest_block_ts:
                raise ValueError("Due date must be in the future")

            # Ensure hash has 0x prefix and convert
            if not invoice_hash.startswith("0x"):
                invoice_hash = "0x" + invoice_hash

            invoice_hash_bytes = bytes.fromhex(invoice_hash[2:].ljust(64, "0"))

            # Check if hash already registered
            if self.is_hash_registered(invoice_hash):
                return {
                    "success": False,
                    "error": "Invoice hash already registered",
                    "receipt": None,
                }

            recipient_address = Web3.to_checksum_address(recipient_address)

            # Prepare transaction
            minter_account = Account.from_key(self.minter_private_key)
            minter_address = minter_account.address

            # Build transaction
            tx = self.contract.functions.mint(
                recipient_address,
                invoice_hash_bytes,
                face_value_wei,
                due_date_unix,
                supply,
                token_uri,
            ).build_transaction(
                {
                    "from": minter_address,
                    "nonce": self.w3.eth.get_transaction_count(minter_address),
                    "gas": 500000,
                    "gasPrice": self.w3.eth.gas_price,
                }
            )

            # Sign transaction
            signed_tx = self.w3.eth.account.sign_transaction(tx, self.minter_private_key)

            # Send transaction
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            logger.info(f"Minting transaction sent: {tx_hash.hex()}")

            # Wait for receipt
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

            if receipt["status"] != 1:
                return {
                    "success": False,
                    "error": "Transaction reverted",
                    "receipt": receipt,
                }

            # Extract token_id from event logs
            # The InvoiceMinted event emits tokenId as first indexed parameter
            token_id = None
            try:
                # Decode logs to get tokenId
                logs = self.contract.events.InvoiceMinted().process_receipt(receipt)
                if logs:
                    token_id = str(logs[0]["args"]["tokenId"])
            except Exception as e:
                logger.warning(f"Could not extract tokenId from logs: {e}")

            return {
                "success": True,
                "tx_hash": tx_hash.hex(),
                "token_id": token_id,
                "receipt": receipt,
                "supply": supply,
            }

        except Exception as e:
            logger.error(f"Error minting invoice NFT: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "receipt": None,
            }

    def get_invoice_details(self, token_id: int) -> Dict[str, any]:
        """
        Retrieve invoice details from smart contract.
        
        Args:
            token_id: ERC1155 token ID
        
        Returns:
            Dict with invoice metadata or None if not found
        """
        try:
            # Note: You may need to add view functions to your contract
            # to retrieve these details. For now, this is a placeholder.
            return {
                "face_value": self.contract.functions.invoiceFaceValue(
                    token_id
                ).call(),
                "due_date": self.contract.functions.invoiceDueDate(token_id).call(),
                "supply": self.contract.functions.tokenSupply(token_id).call(),
                "original_minter": self.contract.functions.originalMinter(token_id).call(),
                "uri": self.contract.functions.uri(token_id).call(),
            }
        except Exception as e:
            logger.error(f"Error retrieving invoice details for token {token_id}: {e}")
            return None


# Global service instance
_blockchain_service: Optional[BlockchainService] = None


def get_blockchain_service() -> BlockchainService:
    """Get or initialize the blockchain service."""
    global _blockchain_service
    if _blockchain_service is None:
        try:
            _blockchain_service = BlockchainService()
        except Exception as e:
            logger.error(f"Failed to initialize blockchain service: {e}")
            # Return a mock service that fails gracefully
            raise
    return _blockchain_service
