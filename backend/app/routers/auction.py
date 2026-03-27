import logging
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from ..database import SessionLocal
from ..models import Invoice, User, MarketplaceAuction
from ..auth.dependencies import get_current_user, require_seller, require_investor
from ..services.auction_service import get_auction_service
from ..services.escrow_service import get_escrow_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/auctions", tags=["auctions"])

auction_service = get_auction_service()
escrow_service = get_escrow_service()


# Schemas

class CreateAuctionRequest(BaseModel):
    invoice_id: int
    starting_price: float  # in ETH
    duration_hours: int  # 1-720 (30 days)
    total_shares: int  # Number of shares to auction


class PlaceBidRequest(BaseModel):
    bid_amount: float  # in ETH


class SettleAuctionRequest(BaseModel):
    notes: Optional[str] = None


class AuctionResponse(BaseModel):
    id: int
    invoice_id: int
    seller_id: int
    status: str
    start_price: float
    current_bid: Optional[float]
    highest_bidder_id: Optional[int]
    blockchain_auction_id: Optional[int]
    tx_hash: Optional[str]
    created_at: str
    end_time: Optional[str]

    class Config:
        from_attributes = True


# Endpoints

@router.post("/", response_model=AuctionResponse, status_code=201)
async def create_auction(
    payload: CreateAuctionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(lambda: SessionLocal()),
):
    """
    Create a new auction for an invoice.
    Seller only. Invoice must be minted and approved.
    """
    # Authorize
    if current_user.role.value != "seller":
        raise HTTPException(status_code=403, detail="Only sellers can create auctions")

    # Validate
    if payload.starting_price <= 0:
        raise HTTPException(status_code=400, detail="Starting price must be > 0")

    if not (1 <= payload.duration_hours <= 720):
        raise HTTPException(status_code=400, detail="Duration must be 1-720 hours")

    if payload.total_shares <= 0:
        raise HTTPException(status_code=400, detail="Total shares must be > 0")

    # Get invoice
    invoice = db.query(Invoice).filter(
        Invoice.id == payload.invoice_id,
        Invoice.seller_id == current_user.id,
    ).first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.token_id is None:
        raise HTTPException(status_code=400, detail="Invoice must be minted first")

    if invoice.status != "minted":
        raise HTTPException(status_code=400, detail="Invoice must be in minted status")

    # Create on-chain
    result = auction_service.create_auction(
        db=db,
        invoice_id=invoice.id,
        seller_id=current_user.id,
        starting_price=payload.starting_price,
        duration_hours=payload.duration_hours,
        total_shares=payload.total_shares,
    )

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Auction creation failed"))

    # created auction
    auction = db.query(MarketplaceAuction).filter(
        MarketplaceAuction.id == result["auction_id"]
    ).first()

    logger.info(f"Auction created: {auction.id} by seller {current_user.id}")

    return AuctionResponse.model_validate(auction)


@router.post("/{auction_id}/bid", status_code=200)
async def place_bid(
    auction_id: int,
    payload: PlaceBidRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(lambda: SessionLocal()),
):
    """
    Place a bid on an active auction.
    Investor only.
    """
    # Authorize
    if current_user.role.value != "investor":
        raise HTTPException(status_code=403, detail="Only investors can bid")

    # auction
    auction = db.query(MarketplaceAuction).filter(
        MarketplaceAuction.id == auction_id
    ).first()

    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")

    if auction.status != "open":
        raise HTTPException(status_code=400, detail="Auction is not active")

    if payload.bid_amount <= 0:
        raise HTTPException(status_code=400, detail="Bid must be > 0")

    # Place bid on-chain
    result = auction_service.place_bid(
        db=db,
        auction_id=auction.id,
        blockchain_auction_id=int(auction.blockchain_auction_id or 0),
        bidder_id=current_user.id,
        bid_amount=payload.bid_amount,
    )

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Bid placement failed"))

    logger.info(f"Bid placed: {result['bid_id']} by investor {current_user.id} on auction {auction_id}")

    return {
        "success": True,
        "bid_id": result["bid_id"],
        "tx_hash": result["tx_hash"],
        "message": "Bid placed successfully",
    }


@router.post("/{auction_id}/settle", status_code=200)
async def settle_auction(
    auction_id: int,
    payload: SettleAuctionRequest,
    current_user: User = Depends(lambda: (Depends(get_current_user))),
    db: Session = Depends(lambda: SessionLocal()),
):
    """
    Settle completed auction.
    Transfers shares to winner, releases funds.
    Admin/backend operation.
    """
    # Authorize (admin only)
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Only admins can settle auctions")

    # auction
    auction = db.query(MarketplaceAuction).filter(
        MarketplaceAuction.id == auction_id
    ).first()

    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")

    if auction.status != "open":
        raise HTTPException(status_code=400, detail="Auction already settled or cancelled")

    # Settle on-chain
    result = auction_service.blockchain.settle_auction_on_chain(
        auction_id=int(auction.blockchain_auction_id or 0),
        settler_private_key=__import__("os").getenv("MINTER_PRIVATE_KEY"),
    )

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Settlement failed"))

    # Update DB
    auction.status = "settled"
    db.commit()

    logger.info(f"Auction {auction_id} settled")

    return {
        "success": True,
        "auction_id": auction_id,
        "tx_hash": result["tx_hash"],
        "message": "Auction settled successfully",
    }


@router.get("/{auction_id}", response_model=AuctionResponse)
async def get_auction(
    auction_id: int,
    db: Session = Depends(lambda: SessionLocal()),
):
    """Get auction details."""
    auction = db.query(MarketplaceAuction).filter(
        MarketplaceAuction.id == auction_id
    ).first()

    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")

    return AuctionResponse.model_validate(auction)


@router.get("/invoice/{invoice_id}/active")
async def get_invoice_active_auction(
    invoice_id: int,
    db: Session = Depends(lambda: SessionLocal()),
):
    """Get active auction for an invoice."""
    auction = db.query(MarketplaceAuction).filter(
        MarketplaceAuction.invoice_id == invoice_id,
        MarketplaceAuction.status == "open",
    ).first()

    if not auction:
        return {"auction": None}

    return {"auction": AuctionResponse.model_validate(auction)}