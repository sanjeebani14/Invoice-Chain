from app.schemas.auth import UserOut
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from typing import Any
import os

from ..schemas.wallet import (
    RequestNonceRequest,
    RequestNonceResponse,
    VerifySignatureRequest,
    VerifySignatureResponse,
    LinkWalletResponse,
    UserWalletsResponse,
    GetBalanceResponse,
    DisconnectWalletResponse,
)
from ..services.wallet_service import WalletService
from ..database import get_db
from ..auth.dependencies import get_current_user, verify_wallet_ownership
from ..auth.tokens import create_access_token
from ..services.auth_service import AuthService
from ..auth.utils import set_auth_cookies
from ..models import User, LinkedWallet

from web3 import Web3

router = APIRouter()

WEB3_PROVIDER = (
    os.getenv("WEB3_PROVIDER_URL")
    or os.getenv("WEB3_PROVIDER")
    or "http://127.0.0.1:8545"
)


@router.post("/nonce", response_model=RequestNonceResponse)
def request_nonce(payload: RequestNonceRequest, db: Session = Depends(get_db)):
    ws = WalletService(db, WEB3_PROVIDER)
    try:
        data = ws.create_nonce_for_wallet(payload.wallet_address)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid wallet address"
        )
    return RequestNonceResponse(**data)


@router.post("/verify-signature", response_model=VerifySignatureResponse)
def verify_signature(
    payload: VerifySignatureRequest, response: Response, db: Session = Depends(get_db)
):
    ws = WalletService(db, WEB3_PROVIDER)
    auth_service = AuthService(db)  # Instantiate the AuthService

    # Normalize address
    addr = Web3.to_checksum_address(payload.wallet_address)

    # Verify Signature
    result = ws.verify_signature(
        addr, ws.build_sign_message(payload.nonce), payload.signature, payload.nonce
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=result.get("message")
        )

    # Login Logic
    user = ws.find_user_by_wallet(addr)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Wallet not linked to any user.",
        )

    # Handle Tokens
    access = create_access_token(user.id)
    refresh = auth_service.create_and_store_refresh_token(user.id)
    set_auth_cookies(response, access, refresh)

    return VerifySignatureResponse(
        message="Login successful",
        access_token=access,
        wallet_address=addr,
        user=UserOut.from_orm(user),
    )


@router.get("/wallets", response_model=UserWalletsResponse)
def get_wallets(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    ws = WalletService(db, WEB3_PROVIDER)
    wallets = ws.get_user_wallets(current_user.id)

    for w in wallets:
        if w.balance_wei:
            w.balance_eth = str(Web3.from_wei(int(w.balance_wei), "ether"))
    return UserWalletsResponse(wallets=wallets)


@router.post("/link", response_model=LinkWalletResponse)
def link_wallet(
    payload: VerifySignatureRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = WalletService(db, WEB3_PROVIDER)
    addr = Web3.to_checksum_address(payload.wallet_address)

    result = ws.verify_signature(
        addr, ws.build_sign_message(payload.nonce), payload.signature, payload.nonce
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=result.get("message")
        )

    try:
        lw = ws.link_wallet_to_user(current_user.id, addr)

        if lw.balance_wei:
            lw.balance_eth = str(Web3.from_wei(int(lw.balance_wei), "ether"))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

    return LinkWalletResponse(message="Wallet linked successfully", wallet=lw)


@router.post("/{wallet_address}/balance", response_model=GetBalanceResponse)
def refresh_balance(
    wallet: LinkedWallet = Depends(verify_wallet_ownership),
    db: Session = Depends(get_db),
):
    ws = WalletService(db, WEB3_PROVIDER)
    try:
        success = ws.update_wallet_balance(wallet.wallet_address)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="RPC unavailable"
        )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not fetch balance",
        )

    db.refresh(wallet)

    eth_val = "0"
    if wallet.balance_wei:
        eth_val = str(Web3.from_wei(int(wallet.balance_wei), "ether"))

    return GetBalanceResponse(
        wallet_address=wallet.wallet_address,
        balance_wei=wallet.balance_wei or "0",
        balance_eth=eth_val,
        last_updated=wallet.balance_checked_at,
    )


@router.delete("/{wallet_address}", response_model=DisconnectWalletResponse)
def disconnect_wallet(
    wallet: LinkedWallet = Depends(verify_wallet_ownership),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = WalletService(db, WEB3_PROVIDER)

    active_wallets = (
        db.query(LinkedWallet).filter_by(user_id=current_user.id, is_active=True).all()
    )

    if len(active_wallets) == 1 and not current_user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove last wallet without an email/password set.",
        )

    ws.disconnect_wallet(current_user.id, wallet.wallet_address)
    return DisconnectWalletResponse(message="Wallet unlinked successfully")
