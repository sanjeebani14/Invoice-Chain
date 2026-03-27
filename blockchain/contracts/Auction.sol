// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./InvoiceNFT.sol";

/**
 * @title Auction
 * @notice Decentralized auction mechanism for fractional invoice shares.
 *         Sellers create auctions, investors bid with ETH, and funds are held in escrow.
 */
contract Auction is ReentrancyGuard, Ownable, Pausable {

    InvoiceNFT public immutable invoiceNFT;

    uint256 public platformFeeBps = 250; // 2.5%
    address public feeRecipient;
    uint256 public minBidIncrementBps = 500; // 5% minimum bid increment

    uint256 private _nextAuctionId;

    // Auction states
    enum AuctionStatus { ACTIVE, SETTLED, CANCELLED }

    struct AuctionData {
        uint256 auctionId;
        uint256 tokenId;
        address seller;
        uint256 sharesOnAuction;
        uint256 startingPrice;      // minimum first bid in wei
        uint256 highestBid;
        address highestBidder;
        uint256 startTime;
        uint256 endTime;
        AuctionStatus status;
    }

    struct AuctionSettlement {
        uint256 auctionId;
        uint256 settledAt;
        uint256 settledPrice;
        address winner;
        uint256 platformFee;
        uint256 sellerProceeds;
        string txHash;              // blockchain tx hash reference
    }

    mapping(uint256 => AuctionData) public auctions;
    mapping(uint256 => AuctionSettlement) public settlements;
    mapping(uint256 => address[]) public auctionBidders; // all bidders for an auction

    // Refund escrow
    mapping(address => uint256) public pendingRefunds;

    // Events
    event AuctionCreated(
        uint256 indexed auctionId,
        uint256 indexed tokenId,
        address indexed seller,
        uint256 startingPrice,
        uint256 endTime,
        uint256 sharesOnAuction
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount,
        uint256 timestamp
    );

    event BidIncremented(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 newAmount,
        uint256 timestamp
    );

    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 winningBid,
        uint256 platformFee,
        uint256 sellerProceeds,
        uint256 timestamp
    );

    event AuctionCancelled(
        uint256 indexed auctionId,
        address indexed seller,
        uint256 timestamp,
        string reason
    );

    event BidderRefunded(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount,
        uint256 timestamp
    );

    event PendingRefundClaimed(
        address indexed bidder,
        uint256 amount,
        uint256 timestamp
    );

    // Constructor
    constructor(address _invoiceNFT, address _feeRecipient) Ownable(msg.sender) {
        require(_invoiceNFT != address(0), "Auction: invalid NFT address");
        require(_feeRecipient != address(0), "Auction: invalid fee recipient");

        invoiceNFT = InvoiceNFT(_invoiceNFT);
        feeRecipient = _feeRecipient;
        _nextAuctionId = 1;
    }

    // Auction creation

    /**
     * @notice Create a new auction for invoice shares.
     * @param tokenId          The invoice NFT token ID.
     * @param sharesOnAuction  Number of fractional shares to auction.
     * @param startingPrice    Minimum opening bid in wei.
     * @param duration         Auction duration in seconds (1 hour - 30 days).
     * @return auctionId       The newly created auction ID.
     */
    function createAuction(
        uint256 tokenId,
        uint256 sharesOnAuction,
        uint256 startingPrice,
        uint256 duration
    ) external whenNotPaused nonReentrant returns (uint256 auctionId) {
        require(sharesOnAuction > 0, "Auction: shares must be > 0");
        require(startingPrice > 0, "Auction: starting price must be > 0");
        require(duration >= 1 hours, "Auction: duration too short");
        require(duration <= 30 days, "Auction: duration too long");

        // Verify seller has sufficient balance
        require(
            invoiceNFT.balanceOf(msg.sender, tokenId) >= sharesOnAuction,
            "Auction: insufficient balance"
        );

        // Verify contract is approved to transfer
        require(
            invoiceNFT.isApprovedForAll(msg.sender, address(this)),
            "Auction: contract not approved"
        );

        // Transfer shares into contract escrow
        invoiceNFT.safeTransferFrom(
            msg.sender,
            address(this),
            tokenId,
            sharesOnAuction,
            ""
        );

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
            status: AuctionStatus.ACTIVE
        });

        emit AuctionCreated(
            auctionId,
            tokenId,
            msg.sender,
            startingPrice,
            block.timestamp + duration,
            sharesOnAuction
        );
    }

    // Bidding

    /**
     * @notice Place a bid on an active auction.
     * @param auctionId The auction ID.
     */
    function placeBid(uint256 auctionId) external payable whenNotPaused nonReentrant {
        AuctionData storage a = auctions[auctionId];

        require(a.status == AuctionStatus.ACTIVE, "Auction: not active");
        require(block.timestamp < a.endTime, "Auction: already ended");
        require(msg.sender != a.seller, "Auction: seller cannot bid");
        require(msg.value > 0, "Auction: bid must be > 0");

        // Validate bid amount
        if (a.highestBid == 0) {
            // First bid must meet starting price
            require(msg.value >= a.startingPrice, "Auction: below starting price");
        } else {
            // Subsequent bids must exceed previous by minimum increment
            uint256 minBidAmount = a.highestBid + (a.highestBid * minBidIncrementBps) / 10000;
            require(msg.value >= minBidAmount, "Auction: bid too low");
        }

        // Store previous bidder info for refund
        address previousBidder = a.highestBidder;
        uint256 previousBid = a.highestBid;

        // Update auction state
        a.highestBid = msg.value;
        a.highestBidder = msg.sender;

        // Track bidder for event emission
        if (previousBid == 0) {
            auctionBidders[auctionId].push(msg.sender);
        }

        // Refund previous highest bidder
        if (previousBidder != address(0)) {
            pendingRefunds[previousBidder] += previousBid;
            emit BidderRefunded(auctionId, previousBidder, previousBid, block.timestamp);
        }

        emit BidPlaced(auctionId, msg.sender, msg.value, block.timestamp);
    }

    /**
     * @notice Increment current bid (for existing highest bidder).
     * @param auctionId The auction ID.
     */
    function incrementBid(uint256 auctionId) external payable whenNotPaused nonReentrant {
        AuctionData storage a = auctions[auctionId];

        require(a.status == AuctionStatus.ACTIVE, "Auction: not active");
        require(block.timestamp < a.endTime, "Auction: already ended");
        require(msg.sender == a.highestBidder, "Auction: not current bidder");
        require(msg.value > 0, "Auction: increment must be > 0");

        a.highestBid += msg.value;

        emit BidIncremented(auctionId, msg.sender, a.highestBid, block.timestamp);
    }

    // Settlement

    /**
     * @notice Settle auction after it ends.
     *         Transfers shares to winner, holds funds in escrow, pays seller & platform fee.
     * @param auctionId The auction ID.
     */
    function settleAuction(uint256 auctionId) external nonReentrant {
        AuctionData storage a = auctions[auctionId];

        require(a.status == AuctionStatus.ACTIVE, "Auction: not active");
        require(block.timestamp >= a.endTime, "Auction: not yet ended");

        a.status = AuctionStatus.SETTLED;

        if (a.highestBidder == address(0)) {
            // No bids — return shares to seller
            invoiceNFT.safeTransferFrom(
                address(this),
                a.seller,
                a.tokenId,
                a.sharesOnAuction,
                ""
            );

            settlements[auctionId] = AuctionSettlement({
                auctionId: auctionId,
                settledAt: block.timestamp,
                settledPrice: 0,
                winner: address(0),
                platformFee: 0,
                sellerProceeds: 0,
                txHash: ""
            });

            emit AuctionSettled(auctionId, address(0), 0, 0, 0, block.timestamp);
        } else {
            // Winner exists — transfer shares to winner
            invoiceNFT.safeTransferFrom(
                address(this),
                a.highestBidder,
                a.tokenId,
                a.sharesOnAuction,
                ""
            );

            // Calculate fees
            uint256 platformFee = (a.highestBid * platformFeeBps) / 10000;
            uint256 sellerProceeds = a.highestBid - platformFee;

            // Transfer funds (held in this contract as escrow)
            // In production, integrate with Escrow contract for multi-sig release
            (bool feeTransferred, ) = feeRecipient.call{ value: platformFee }("");
            require(feeTransferred, "Auction: fee transfer failed");

            (bool sellerPaid, ) = a.seller.call{ value: sellerProceeds }("");
            require(sellerPaid, "Auction: seller payment failed");

            settlements[auctionId] = AuctionSettlement({
                auctionId: auctionId,
                settledAt: block.timestamp,
                settledPrice: a.highestBid,
                winner: a.highestBidder,
                platformFee: platformFee,
                sellerProceeds: sellerProceeds,
                txHash: ""
            });

            emit AuctionSettled(
                auctionId,
                a.highestBidder,
                a.highestBid,
                platformFee,
                sellerProceeds,
                block.timestamp
            );
        }
    }

    /**
     * @notice Claim pending refunds from outbid bids.
     */
    function claimRefund() external nonReentrant {
        uint256 refundAmount = pendingRefunds[msg.sender];
        require(refundAmount > 0, "Auction: no pending refunds");

        pendingRefunds[msg.sender] = 0;

        (bool success, ) = msg.sender.call{ value: refundAmount }("");
        require(success, "Auction: refund transfer failed");

        emit PendingRefundClaimed(msg.sender, refundAmount, block.timestamp);
    }

    /**
     * @notice Get pending refund balance for an address.
     */
    function getPendingRefund(address bidder) external view returns (uint256) {
        return pendingRefunds[bidder];
    }

    // Cancellation

    /**
     * @notice Cancel auction (seller only, only if no bids placed).
     * @param auctionId The auction ID.
     * @param reason    Reason for cancellation.
     */
    function cancelAuction(uint256 auctionId, string calldata reason) external nonReentrant {
        AuctionData storage a = auctions[auctionId];

        require(a.seller == msg.sender, "Auction: not seller");
        require(a.status == AuctionStatus.ACTIVE, "Auction: not active");
        require(a.highestBidder == address(0), "Auction: bids already placed");

        a.status = AuctionStatus.CANCELLED;

        // Return shares to seller
        invoiceNFT.safeTransferFrom(
            address(this),
            a.seller,
            a.tokenId,
            a.sharesOnAuction,
            ""
        );

        emit AuctionCancelled(auctionId, msg.sender, block.timestamp, reason);
    }

    // ERC1155 Receiver

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    // Admin

    /**
     * @notice Set platform fee (in basis points).
     */
    function setFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "Auction: fee too high (max 10%)");
        platformFeeBps = newFeeBps;
    }

    /**
     * @notice Set minimum bid increment percentage.
     */
    function setMinBidIncrement(uint256 newBps) external onlyOwner {
        require(newBps <= 10000, "Auction: increment too high");
        minBidIncrementBps = newBps;
    }

    /**
     * @notice Set fee recipient address.
     */
    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Auction: invalid recipient");
        feeRecipient = newRecipient;
    }

    /**
     * @notice Pause/unpause auctions.
     */
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Query

    /**
     * @notice Get full auction data.
     */
    function getAuction(uint256 auctionId) external view returns (AuctionData memory) {
        return auctions[auctionId];
    }

    /**
     * @notice Get settlement data for completed auction.
     */
    function getSettlement(uint256 auctionId) external view returns (AuctionSettlement memory) {
        return settlements[auctionId];
    }

    /**
     * @notice Get all bidders for an auction.
     */
    function getAuctionBidders(uint256 auctionId) external view returns (address[] memory) {
        return auctionBidders[auctionId];
    }

    /**
     * @notice Check if auction is active.
     */
    function isAuctionActive(uint256 auctionId) external view returns (bool) {
        return auctions[auctionId].status == AuctionStatus.ACTIVE &&
               block.timestamp < auctions[auctionId].endTime;
    }

    /**
     * @notice Get time remaining for auction.
     */
    function getTimeRemaining(uint256 auctionId) external view returns (int256) {
        return int256(auctions[auctionId].endTime) - int256(block.timestamp);
    }
}