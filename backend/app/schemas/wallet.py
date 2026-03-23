from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from .auth import UserOut

class RequestNonceRequest(BaseModel):
    wallet_address: str

class RequestNonceResponse(BaseModel):
    nonce: str
    message: str
    expires_in_seconds: int
    expires_at: datetime

class VerifySignatureRequest(BaseModel):
    wallet_address: str
    signature: str
    nonce: str

class VerifySignatureResponse(BaseModel):
    message: str
    access_token: Optional[str] = None
    wallet_address: str
    user: Optional[UserOut] = None

class LinkedWalletResponse(BaseModel):
    id: int
    wallet_address: str
    wallet_label: Optional[str] = None
    balance_wei: Optional[str] = None
    balance_eth: Optional[str] = None  # Populated by Service Layer
    network_name: str
    chain_id: int
    is_active: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class GetBalanceResponse(BaseModel):
    wallet_address: str
    balance_wei: str
    balance_eth: str
    last_updated: Optional[datetime] = None

class LinkWalletResponse(BaseModel):
    message: str
    wallet: LinkedWalletResponse

class UserWalletsResponse(BaseModel):
    wallets: List[LinkedWalletResponse]

class DisconnectWalletResponse(BaseModel):
    message: str