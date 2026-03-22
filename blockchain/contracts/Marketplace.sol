// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./InvoiceNFT.sol";

contract Marketplace is ReentrancyGuard, Ownable, Pausable {

    // state

    InvoiceNFT public immutable invoiceNFT;

    uint256 public constant MAX_FEE_BPS = 1000;
    uint256 public platformFeeBps;
    address public feeRecipient;

    uint256 private _nextListingId;

    struct Listing {
        uint256 listingId;
        uint256 tokenId;
        address seller;
        uint256 pricePerShare;
        uint256 sharesListed;      // original amount listed
        uint256 sharesAvailable;   // decrements on purchase
        uint256 listedAt;
        bool active;
    }

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => uint256) public activeListingByToken;
    mapping(address => uint256[]) private _sellerListings;

    // events

    event InvoiceListed(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed seller,
        uint256 pricePerShare,
        uint256 sharesListed,
        uint256 listedAt
    );

    event InvoiceSold(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed buyer,
        address seller,
        uint256 sharesPurchased,
        uint256 totalPaid,
        uint256 fee,
        uint256 sellerProceeds
    );

    event ListingCancelled(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address cancelledBy
    );

    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);

    // constructor

    constructor(
        address _invoiceNFT,
        address _feeRecipient,
        uint256 _initialFeeBps
    ) Ownable(msg.sender) {
        require(_invoiceNFT != address(0), "Marketplace: zero NFT address");
        require(_feeRecipient != address(0), "Marketplace: zero fee recipient");
        require(_initialFeeBps <= MAX_FEE_BPS, "Marketplace: fee too high");

        invoiceNFT = InvoiceNFT(_invoiceNFT);
        feeRecipient = _feeRecipient;
        platformFeeBps = _initialFeeBps;
        _nextListingId = 1;
    }

    // list

    function listInvoice(
        uint256 tokenId,
        uint256 pricePerShare,
        uint256 sharesToList
    ) external whenNotPaused nonReentrant returns (uint256 listingId) {
        require(pricePerShare > 0, "Marketplace: price must be > 0");
        require(sharesToList > 0, "Marketplace: shares must be > 0");
        require(
            invoiceNFT.balanceOf(msg.sender, tokenId) >= sharesToList,
            "Marketplace: insufficient token balance"
        );
        require(
            invoiceNFT.isApprovedForAll(msg.sender, address(this)),
            "Marketplace: approve this contract first via setApprovalForAll"
        );

        // one active listing per token at a time
        uint256 existingId = activeListingByToken[tokenId];
        if (existingId != 0) {
            require(
                !listings[existingId].active,
                "Marketplace: token already has an active listing"
            );
        }

        listingId = _nextListingId;
        _nextListingId++;

        listings[listingId] = Listing({
            listingId: listingId,
            tokenId: tokenId,
            seller: msg.sender,
            pricePerShare: pricePerShare,
            sharesListed: sharesToList,
            sharesAvailable: sharesToList,
            listedAt: block.timestamp,
            active: true
        });

        activeListingByToken[tokenId] = listingId;
        _sellerListings[msg.sender].push(listingId);

        emit InvoiceListed(listingId, tokenId, msg.sender, pricePerShare, sharesToList, block.timestamp);

        return listingId;
    }

    // buy

    function buyShares(
        uint256 listingId,
        uint256 sharesToBuy
    ) external payable whenNotPaused nonReentrant {
        Listing storage listing = listings[listingId];

        require(listing.active, "Marketplace: listing is not active");
        require(sharesToBuy > 0, "Marketplace: must buy at least 1 share");
        require(
            sharesToBuy <= listing.sharesAvailable,
            "Marketplace: not enough shares available"
        );
        require(
            msg.sender != listing.seller,
            "Marketplace: seller cannot buy their own listing"
        );

        uint256 totalCost = listing.pricePerShare * sharesToBuy;
        require(msg.value >= totalCost, "Marketplace: insufficient ETH sent");

        // update state before external calls
        listing.sharesAvailable -= sharesToBuy;
        if (listing.sharesAvailable == 0) {
            listing.active = false;
        }

        uint256 fee = (totalCost * platformFeeBps) / 10_000;
        uint256 sellerProceeds = totalCost - fee;

        invoiceNFT.safeTransferFrom(
            listing.seller,
            msg.sender,
            listing.tokenId,
            sharesToBuy,
            ""
        );

        (bool feeOk, ) = feeRecipient.call{value: fee}("");
        require(feeOk, "Marketplace: fee transfer failed");

        (bool sellerOk, ) = listing.seller.call{value: sellerProceeds}("");
        require(sellerOk, "Marketplace: seller payment failed");

        if (msg.value > totalCost) {
            (bool refundOk, ) = msg.sender.call{value: msg.value - totalCost}("");
            require(refundOk, "Marketplace: refund failed");
        }

        emit InvoiceSold(
            listingId,
            listing.tokenId,
            msg.sender,
            listing.seller,
            sharesToBuy,
            totalCost,
            fee,
            sellerProceeds
        );
    }

    // cancel

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];

        require(listing.active, "Marketplace: listing is not active");
        require(
            msg.sender == listing.seller || msg.sender == owner(),
            "Marketplace: not seller or admin"
        );

        listing.active = false;

        if (activeListingByToken[listing.tokenId] == listingId) {
            activeListingByToken[listing.tokenId] = 0;
        }

        emit ListingCancelled(listingId, listing.tokenId, msg.sender);
    }

    // view helpers

    function getListing(uint256 listingId)
        external view returns (Listing memory)
    {
        return listings[listingId];
    }

    function getSellerListings(address seller)
        external view returns (uint256[] memory)
    {
        return _sellerListings[seller];
    }

    function quotePurchase(uint256 listingId, uint256 sharesToBuy)
        external view
        returns (uint256 totalCost, uint256 fee, uint256 sellerProceeds)
    {
        Listing storage listing = listings[listingId];
        require(listing.active, "Marketplace: listing not active");
        require(sharesToBuy <= listing.sharesAvailable, "Marketplace: not enough shares");

        totalCost = listing.pricePerShare * sharesToBuy;
        fee = (totalCost * platformFeeBps) / 10_000;
        sellerProceeds = totalCost - fee;
    }

    function totalListings() external view returns (uint256) {
        return _nextListingId - 1;
    }

    // admin

    function setFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "Marketplace: fee exceeds maximum");
        uint256 old = platformFeeBps;
        platformFeeBps = newFeeBps;
        emit FeeUpdated(old, newFeeBps);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Marketplace: zero address");
        address old = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(old, newRecipient);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}