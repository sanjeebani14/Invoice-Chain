// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./InvoiceNFT.sol";

contract Auction is ReentrancyGuard, Ownable, Pausable {

    InvoiceNFT public immutable invoiceNFT;

    uint256 public platformFeeBps = 250;
    address public feeRecipient;
    uint256 public minBidIncrementBps = 500; // 5% minimum bid increment

    uint256 private _nextAuctionId;

    struct AuctionData {
        uint256 auctionId;
        uint256 tokenId;
        address seller;
        uint256 sharesOnAuction;
        uint256 startingPrice;    // minimum first bid
        uint256 highestBid;
        address highestBidder;
        uint256 startTime;
        uint256 endTime;
        bool settled;
        bool cancelled;
    }

    mapping(uint256 => AuctionData) public auctions;

    // events
    event AuctionCreated(
        uint256 indexed auctionId,
        uint256 indexed tokenId,
        address indexed seller,
        uint256 startingPrice,
        uint256 endTime
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );

    event AuctionEnded(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 winningBid
    );

    event AuctionCancelled(uint256 indexed auctionId);

    // constructor
    constructor(address _invoiceNFT, address _feeRecipient) Ownable(msg.sender) {
        invoiceNFT = InvoiceNFT(_invoiceNFT);
        feeRecipient = _feeRecipient;
        _nextAuctionId = 1;
    }

    // create auction

    function createAuction(
        uint256 tokenId,
        uint256 sharesOnAuction,
        uint256 startingPrice,
        uint256 duration // in seconds
    ) external whenNotPaused nonReentrant returns (uint256 auctionId) {
        require(sharesOnAuction > 0, "Auction: shares must be > 0");
        require(startingPrice > 0, "Auction: starting price must be > 0");
        require(duration >= 1 hours, "Auction: duration too short");
        require(duration <= 30 days, "Auction: duration too long");
        require(
            invoiceNFT.balanceOf(msg.sender, tokenId) >= sharesOnAuction,
            "Auction: insufficient balance"
        );
        require(
            invoiceNFT.isApprovedForAll(msg.sender, address(this)),
            "Auction: contract not approved"
        );

        // locks tokens into contract
        invoiceNFT.safeTransferFrom(msg.sender, address(this), tokenId, sharesOnAuction, "");

        auctionId = _nextAuctionId++;

        auctions[auctionId] = AuctionData({
            auctionId: auctionId,
            tokenId: tokenId,
            seller: msg.sender,
            sharesOnAuction: sharesOnAuction,
            startingPrice: startingPrice,
            highestBid: 0,
            highestBidder: address(0),
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            settled: false,
            cancelled: false
        });

        emit AuctionCreated(auctionId, tokenId, msg.sender, startingPrice, block.timestamp + duration);
    }

    // placing bids

    function placeBid(uint256 auctionId) external payable whenNotPaused nonReentrant {
        AuctionData storage a = auctions[auctionId];

        require(!a.settled && !a.cancelled, "Auction: not active");
        require(block.timestamp < a.endTime, "Auction: ended");
        require(msg.sender != a.seller, "Auction: seller cannot bid");

        if (a.highestBid == 0) {
            require(msg.value >= a.startingPrice, "Auction: below starting price");
        } else {
            uint256 minBid = a.highestBid + (a.highestBid * minBidIncrementBps) / 10000;
            require(msg.value >= minBid, "Auction: bid too low");
        }

        // refunds previous highest bidder
        address previousBidder = a.highestBidder;
        uint256 previousBid = a.highestBid;

        a.highestBid = msg.value;
        a.highestBidder = msg.sender;

        if (previousBidder != address(0)) {
            (bool refunded, ) = previousBidder.call{ value: previousBid }("");
            require(refunded, "Auction: refund failed");
        }

        emit BidPlaced(auctionId, msg.sender, msg.value);
    }

    // settle/claim

    function settleAuction(uint256 auctionId) external nonReentrant {
        AuctionData storage a = auctions[auctionId];

        require(!a.settled && !a.cancelled, "Auction: already settled/cancelled");
        require(block.timestamp >= a.endTime, "Auction: not yet ended");

        a.settled = true;

        if (a.highestBidder == address(0)) {
            // No bids — return tokens to seller
            invoiceNFT.safeTransferFrom(address(this), a.seller, a.tokenId, a.sharesOnAuction, "");
        } else {
            // Transfer tokens to winner
            invoiceNFT.safeTransferFrom(address(this), a.highestBidder, a.tokenId, a.sharesOnAuction, "");

            // Fee and seller payment
            uint256 fee = (a.highestBid * platformFeeBps) / 10000;
            uint256 sellerProceeds = a.highestBid - fee;

            (bool feeOk, ) = feeRecipient.call{ value: fee }("");
            require(feeOk, "Auction: fee transfer failed");

            (bool sellerOk, ) = a.seller.call{ value: sellerProceeds }("");
            require(sellerOk, "Auction: seller payment failed");

            emit AuctionEnded(auctionId, a.highestBidder, a.highestBid);
        }
    }

    function cancelAuction(uint256 auctionId) external nonReentrant {
        AuctionData storage a = auctions[auctionId];

        require(a.seller == msg.sender, "Auction: not seller");
        require(!a.settled && !a.cancelled, "Auction: already done");
        require(a.highestBidder == address(0), "Auction: bids already placed");

        a.cancelled = true;

        invoiceNFT.safeTransferFrom(address(this), a.seller, a.tokenId, a.sharesOnAuction, "");

        emit AuctionCancelled(auctionId);
    }

    // erc1155 receiver

    function onERC1155Received(
        address, address, uint256, uint256, bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address, address, uint256[] calldata, uint256[] calldata, bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    // admin

    function setFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "Auction: fee too high");
        platformFeeBps = newFeeBps;
    }

    function setMinBidIncrement(uint256 newBps) external onlyOwner {
        minBidIncrementBps = newBps;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function getAuction(uint256 auctionId) external view returns (AuctionData memory) {
        return auctions[auctionId];
    }
}