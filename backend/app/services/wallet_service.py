from __future__ import annotations
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta, timezone
import secrets

from sqlalchemy.orm import Session
from web3 import Web3, HTTPProvider
from eth_account.messages import encode_defunct

from ..models import WalletNonce, LinkedWallet, User


class WalletService:
    def __init__(
        self,
        db: Session,
        web3_provider: str,
        network_name: str = "base_sepolia",
        chain_id: int = 84532,
    ):
        self.db = db
        self.w3 = Web3(HTTPProvider(web3_provider))
        self.network_name = network_name
        self.chain_id = chain_id

    def generate_nonce(self) -> str:
        return secrets.token_hex(32)

    def build_sign_message(self, nonce: str) -> str:
        return f"Sign in to InvoiceChain: {nonce}"

    def create_nonce_for_wallet(self, wallet_address: str) -> Dict[str, Any]:
        checksum = self.w3.to_checksum_address(wallet_address)
        nonce = self.generate_nonce()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)

        wn = WalletNonce(
            wallet_address=checksum,
            nonce=nonce,
            is_used=False,
            expires_at=expires_at,
        )
        self.db.add(wn)
        self.db.commit()

        return {
            "nonce": nonce,
            "message": self.build_sign_message(nonce),
            "expires_in_seconds": 300,
            "expires_at": expires_at,
        }

    def verify_signature(
        self, wallet_address: str, message: str, signature: str, nonce: str
    ) -> Dict[str, Any]:
        # Normalize address for comparison
        checksum = self.w3.to_checksum_address(wallet_address)

        wn = (
            self.db.query(WalletNonce)
            .filter_by(nonce=nonce, wallet_address=checksum)
            .first()
        )
        if not wn or wn.is_used or wn.expires_at < datetime.now(timezone.utc):
            return {"success": False, "message": "Invalid, used, or expired nonce"}

        try:
            msg_enc = encode_defunct(text=message)
            recovered = self.w3.eth.account.recover_message(
                msg_enc, signature=signature
            )
        except Exception:
            return {"success": False, "message": "Invalid signature format"}

        if recovered.lower() != checksum.lower():
            return {"success": False, "message": "Signature/Address mismatch"}

        wn.is_used = True
        self.db.commit()

        return {"success": True, "wallet_address": recovered}

    def link_wallet_to_user(
        self, user_id: int, wallet_address: str, label: Optional[str] = None
    ) -> LinkedWallet:
        checksum = self.w3.to_checksum_address(wallet_address)

        # Check if this wallet is CURRENTLY active for ANY other user
        active_other = (
            self.db.query(LinkedWallet)
            .filter(
                LinkedWallet.wallet_address == checksum,
                LinkedWallet.user_id != user_id,
                LinkedWallet.is_active,
            )
            .first()
        )

        if active_other:
            raise ValueError("Wallet is already linked to another active account")

        # Check if this user already has a record for this wallet (active or inactive)
        existing_link = (
            self.db.query(LinkedWallet)
            .filter_by(user_id=user_id, wallet_address=checksum)
            .first()
        )

        if existing_link:
            # Reactivate and update metadata
            existing_link.is_active = True
            existing_link.wallet_label = label or existing_link.wallet_label
            existing_link.network_name = self.network_name
            existing_link.chain_id = self.chain_id
            has_active_primary = (
                self.db.query(LinkedWallet)
                .filter(
                    LinkedWallet.user_id == user_id,
                    LinkedWallet.id != existing_link.id,
                    LinkedWallet.is_active,
                    LinkedWallet.is_primary,
                )
                .first()
            )
            if not has_active_primary:
                existing_link.is_primary = True
            existing_link.updated_at = datetime.now(timezone.utc)

            self.db.commit()
            self.update_wallet_balance(checksum)
            return existing_link

        # Create new link only if no record exists for this user
        has_active_wallet = (
            self.db.query(LinkedWallet)
            .filter(
                LinkedWallet.user_id == user_id,
                LinkedWallet.is_active,
            )
            .first()
        )
        lw = LinkedWallet(
            user_id=user_id,
            wallet_address=checksum,
            wallet_label=label,
            network_name=self.network_name,
            chain_id=self.chain_id,
            is_primary=not bool(has_active_wallet),
            is_verified=True,
            is_active=True,
        )

        self.db.add(lw)
        self.db.commit()
        self.update_wallet_balance(checksum)
        return lw

    def get_user_wallets(self, user_id: int) -> List[LinkedWallet]:
        return (
            self.db.query(LinkedWallet).filter_by(user_id=user_id, is_active=True).all()
        )

    def get_wallet_balance(self, wallet_address: str) -> Optional[Dict[str, str]]:
        try:
            checksum = self.w3.to_checksum_address(wallet_address)
            balance_wei = self.w3.eth.get_balance(checksum)
            balance_eth = str(self.w3.from_wei(balance_wei, "ether"))
            return {
                "wallet_address": checksum,
                "balance_wei": str(balance_wei),
                "balance_eth": balance_eth,
            }
        except Exception:
            return None

    def update_wallet_balance(self, wallet_address: str) -> bool:
        checksum = self.w3.to_checksum_address(wallet_address)
        lw = self.db.query(LinkedWallet).filter_by(wallet_address=checksum).first()
        if not lw:
            return False

        bal = self.get_wallet_balance(checksum)
        if not bal:
            return False

        lw.balance_wei = bal.get("balance_wei")
        lw.balance_checked_at = datetime.now(timezone.utc)
        self.db.commit()
        return True

    def disconnect_wallet(self, user_id: int, wallet_address: str) -> bool:
        checksum = self.w3.to_checksum_address(wallet_address)
        lw = (
            self.db.query(LinkedWallet)
            .filter_by(user_id=user_id, wallet_address=checksum)
            .first()
        )
        if not lw:
            return False

        # Soft delete: mark inactive
        was_primary = bool(lw.is_primary)
        lw.is_active = False
        lw.is_primary = False

        if was_primary:
            replacement = (
                self.db.query(LinkedWallet)
                .filter(
                    LinkedWallet.user_id == user_id,
                    LinkedWallet.id != lw.id,
                    LinkedWallet.is_active,
                )
                .order_by(LinkedWallet.id.asc())
                .first()
            )
            if replacement:
                replacement.is_primary = True
        self.db.commit()
        return True

    def find_user_by_wallet(self, wallet_address: str) -> Optional[User]:
        checksum = self.w3.to_checksum_address(wallet_address)
        lw = (
            self.db.query(LinkedWallet)
            .filter_by(wallet_address=checksum, is_active=True)
            .first()
        )
        return lw.user if lw else None

    def cleanup_expired_nonces(self):
        self.db.query(WalletNonce).filter(
            WalletNonce.expires_at < datetime.now(timezone.utc)
        ).delete()
        self.db.commit()
