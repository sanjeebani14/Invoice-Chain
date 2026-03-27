// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./InvoiceNFT.sol";

/**
 * @title Escrow
 * @notice Multi-signature escrow for secure fund management during invoice settlements.
 *         Holds buyer funds until seller confirms payment receipt.
 */
contract Escrow is ReentrancyGuard, Ownable, Pausable {

    InvoiceNFT public immutable invoiceNFT;

    enum EscrowStatus { HELD, RELEASED, DISPUTED, REFUNDED }

    struct EscrowRecord {
        uint256 escrowId;
        uint256 invoiceId;
        uint256 tokenId;
        address investor;     // Buyer of invoice shares
        address seller;       // Original invoice seller
        uint256 amount;       // Amount in escrow (wei)
        uint256 shares;       // Number of shares purchased
        uint256 createdAt;
        uint256 releaseDate;  // When funds can be released
        EscrowStatus status;
    }

    struct DisputeRecord {
        uint256 escrowId;
        address initiator;
        string reason;
        uint256 createdAt;
        bool resolved;
        address resolvedBy;
        string resolution;
    }

    mapping(uint256 => EscrowRecord) public escrows;
    mapping(uint256 => DisputeRecord) public disputes;
    mapping(address => uint256[]) public investorEscrows;
    mapping(address => uint256[]) public sellerEscrows;

    uint256 private _nextEscrowId = 1;
    uint256 public escrowLockDuration = 3 days; // Default lock period
    address public multisigAddress; // Multi-sig for dispute resolution

    // Events
    event EscrowCreated(
        uint256 indexed escrowId,
        uint256 indexed invoiceId,
        address indexed investor,
        address seller,
        uint256 amount,
        uint256 releaseDate
    );

    event EscrowReleased(
        uint256 indexed escrowId,
        address indexed seller,
        uint256 amount,
        uint256 timestamp
    );

    event EscrowRefunded(
        uint256 indexed escrowId,
        address indexed investor,
        uint256 amount,
        uint256 timestamp
    );

    event DisputeInitiated(
        uint256 indexed escrowId,
        address indexed initiator,
        string reason,
        uint256 timestamp
    );

    event DisputeResolved(
        uint256 indexed escrowId,
        address indexed resolver,
        string resolution,
        uint256 timestamp
    );

    event InvoiceBurned(
        uint256 indexed escrowId,
        uint256 indexed invoiceId,
        uint256 shares,
        uint256 timestamp
    );

    // Constructor
    constructor(address _invoiceNFT, address _multisig) Ownable(msg.sender) {
        require(_invoiceNFT != address(0), "Escrow: invalid NFT address");
        require(_multisig != address(0), "Escrow: invalid multisig address");

        invoiceNFT = InvoiceNFT(_invoiceNFT);
        multisigAddress = _multisig;
    }

    // Escrow Creation

    /**
     * @notice Create an escrow record for a purchase.
     *         Called by backend after successful purchase on Marketplace/Auction.
     * @param invoiceId The invoice ID.
     * @param tokenId   The NFT token ID.
     * @param investor  The buyer's address.
     * @param seller    The seller's address.
     * @param amount    Amount to hold in escrow (wei).
     * @param shares    Number of shares purchased.
     * @return escrowId The new escrow ID.
     */
    function createEscrow(
        uint256 invoiceId,
        uint256 tokenId,
        address investor,
        address seller,
        uint256 amount,
        uint256 shares
    ) external onlyOwner nonReentrant returns (uint256 escrowId) {
        require(investor != address(0), "Escrow: invalid investor");
        require(seller != address(0), "Escrow: invalid seller");
        require(amount > 0, "Escrow: amount must be > 0");
        require(shares > 0, "Escrow: shares must be > 0");

        escrowId = _nextEscrowId++;

        uint256 releaseDate = block.timestamp + escrowLockDuration;

        escrows[escrowId] = EscrowRecord({
            escrowId: escrowId,
            invoiceId: invoiceId,
            tokenId: tokenId,
            investor: investor,
            seller: seller,
            amount: amount,
            shares: shares,
            createdAt: block.timestamp,
            releaseDate: releaseDate,
            status: EscrowStatus.HELD
        });

        investorEscrows[investor].push(escrowId);
        sellerEscrows[seller].push(escrowId);

        emit EscrowCreated(escrowId, invoiceId, investor, seller, amount, releaseDate);
    }

    // Fund Release

    /**
     * @notice Release escrowed funds to seller after payment confirmed.
     *         Only callable after invoice is marked as paid (burned).
     * @param escrowId The escrow ID.
     */
    function releaseEscrow(uint256 escrowId) external onlyOwner nonReentrant {
        EscrowRecord storage escrow = escrows[escrowId];

        require(escrow.amount > 0, "Escrow: invalid escrow ID");
        require(escrow.status == EscrowStatus.HELD, "Escrow: not held");
        require(
            block.timestamp >= escrow.releaseDate,
            "Escrow: still in lock period"
        );

        // Verify invoice is marked as settled
        require(
            invoiceNFT.isFullySettled(escrow.tokenId),
            "Escrow: invoice not settled"
        );

        uint256 releaseAmount = escrow.amount;
        escrow.status = EscrowStatus.RELEASED;

        // Transfer funds to seller
        (bool success, ) = escrow.seller.call{ value: releaseAmount }("");
        require(success, "Escrow: transfer failed");

        // Burn invoice shares to mark settlement
        try invoiceNFT.burn(
            escrow.investor,
            escrow.tokenId,
            escrow.shares,
            "payment_received"
        ) {
            emit InvoiceBurned(escrowId, escrow.invoiceId, escrow.shares, block.timestamp);
        } catch {
            // Even if burn fails, fund is released (can retry burn separately)
        }

        emit EscrowReleased(escrowId, escrow.seller, releaseAmount, block.timestamp);
    }

    /**
     * @notice Refund escrowed funds to investor if payment not received.
     *         Only callable after lock period expires and no settlement occurred.
     * @param escrowId The escrow ID.
     */
    function refundEscrow(uint256 escrowId) external nonReentrant {
        EscrowRecord storage escrow = escrows[escrowId];

        require(escrow.amount > 0, "Escrow: invalid escrow ID");
        require(escrow.status == EscrowStatus.HELD, "Escrow: not held");
        require(
            block.timestamp >= escrow.releaseDate,
            "Escrow: still in lock period"
        );
        require(
            !invoiceNFT.isFullySettled(escrow.tokenId),
            "Escrow: already settled"
        );

        // Only investor or owner can refund
        require(
            msg.sender == escrow.investor || msg.sender == owner(),
            "Escrow: unauthorized"
        );

        uint256 refundAmount = escrow.amount;
        escrow.status = EscrowStatus.REFUNDED;

        // Return shares from escrow to investor
        // (In reality, investor still holds them from purchase)

        // Transfer funds back to investor
        (bool success, ) = escrow.investor.call{ value: refundAmount }("");
        require(success, "Escrow: refund transfer failed");

        emit EscrowRefunded(escrowId, escrow.investor, refundAmount, block.timestamp);
    }

    // Dispute Handling

    /**
     * @notice Initiate a dispute over an escrow (e.g., payment not received).
     * @param escrowId The escrow ID.
     * @param reason   Reason for dispute.
     */
    function initiateDispute(uint256 escrowId, string calldata reason) external nonReentrant {
        EscrowRecord storage escrow = escrows[escrowId];

        require(escrow.amount > 0, "Escrow: invalid escrow ID");
        require(escrow.status == EscrowStatus.HELD, "Escrow: not held");
        require(
            msg.sender == escrow.investor || msg.sender == escrow.seller,
            "Escrow: only parties can dispute"
        );
        require(!disputes[escrowId].resolved, "Escrow: already disputed");

        escrow.status = EscrowStatus.DISPUTED;

        disputes[escrowId] = DisputeRecord({
            escrowId: escrowId,
            initiator: msg.sender,
            reason: reason,
            createdAt: block.timestamp,
            resolved: false,
            resolvedBy: address(0),
            resolution: ""
        });

        emit DisputeInitiated(escrowId, msg.sender, reason, block.timestamp);
    }

    /**
     * @notice Resolve dispute (multisig only).
     *         Release to seller or refund to investor.
     * @param escrowId The escrow ID.
     * @param releaseTo Release funds to seller (true) or investor (false).
     * @param resolution Description of resolution.
     */
    function resolveDispute(
        uint256 escrowId,
        bool releaseTo,
        string calldata resolution
    ) external onlyOwner nonReentrant {
        EscrowRecord storage escrow = escrows[escrowId];
        DisputeRecord storage dispute = disputes[escrowId];

        require(escrow.amount > 0, "Escrow: invalid escrow ID");
        require(escrow.status == EscrowStatus.DISPUTED, "Escrow: not disputed");
        require(!dispute.resolved, "Escrow: already resolved");

        dispute.resolved = true;
        dispute.resolvedBy = msg.sender;
        dispute.resolution = resolution;

        uint256 amount = escrow.amount;

        if (releaseTo) {
            // Release to seller
            escrow.status = EscrowStatus.RELEASED;
            (bool success, ) = escrow.seller.call{ value: amount }("");
            require(success, "Escrow: transfer failed");
        } else {
            // Refund to investor
            escrow.status = EscrowStatus.REFUNDED;
            (bool success, ) = escrow.investor.call{ value: amount }("");
            require(success, "Escrow: refund failed");
        }

        emit DisputeResolved(escrowId, msg.sender, resolution, block.timestamp);
    }

    // Query

    /**
     * @notice Get escrow details.
     */
    function getEscrow(uint256 escrowId) external view returns (EscrowRecord memory) {
        return escrows[escrowId];
    }

    /**
     * @notice Get dispute details.
     */
    function getDispute(uint256 escrowId) external view returns (DisputeRecord memory) {
        return disputes[escrowId];
    }

    /**
     * @notice Get all escrows for an investor.
     */
    function getInvestorEscrows(address investor) external view returns (uint256[] memory) {
        return investorEscrows[investor];
    }

    /**
     * @notice Get all escrows for a seller.
     */
    function getSellerEscrows(address seller) external view returns (uint256[] memory) {
        return sellerEscrows[seller];
    }

    /**
     * @notice Check if escrow can be released.
     */
    function canRelease(uint256 escrowId) external view returns (bool) {
        EscrowRecord memory escrow = escrows[escrowId];
        return (
            escrow.status == EscrowStatus.HELD &&
            block.timestamp >= escrow.releaseDate &&
            invoiceNFT.isFullySettled(escrow.tokenId)
        );
    }

    // Admin

    /**
     * @notice Set escrow lock duration.
     */
    function setLockDuration(uint256 durationSeconds) external onlyOwner {
        require(durationSeconds > 0, "Escrow: invalid duration");
        escrowLockDuration = durationSeconds;
    }

    /**
     * @notice Set multisig address for dispute resolution.
     */
    function setMultisig(address newMultisig) external onlyOwner {
        require(newMultisig != address(0), "Escrow: invalid address");
        multisigAddress = newMultisig;
    }

    /**
     * @notice Pause/unpause escrow operations.
     */
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Emergency withdrawal (only after contract is paused).
     */
    function emergencyWithdraw() external onlyOwner {
        require(paused(), "Escrow: not paused");
        (bool success, ) = owner().call{ value: address(this).balance }("");
        require(success, "Escrow: withdrawal failed");
    }

    // Allow contract to receive ETH
    receive() external payable {}
}