// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title InvoiceNFT
 * @notice ERC-1155 token representing invoices on InvoiceChain.
 *         Each tokenId = one invoice. Supply of 1 = whole ownership.
 *         Supply > 1 = fractional (handled by FractionalVault).
 *         The keccak256 hash of the invoice is stored on-chain to
 *         prevent duplicate submissions.
 */
contract InvoiceNFT is ERC1155, AccessControl, ReentrancyGuard, Pausable {

    // roles
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // state
    uint256 private _nextTokenId;

    // invoice hash → tokenId (prevents duplicates)
    mapping(bytes32 => uint256) public hashToTokenId;

    // tokenId → invoice hash (for lookup)
    mapping(uint256 => bytes32) public tokenIdToHash;

    // tokenId → metadata URI (IPFS CID of invoice document)
    mapping(uint256 => string) private _tokenURIs;

    // tokenId → original minter / SME address
    mapping(uint256 => address) public originalMinter;

    // tokenId → invoice face value in wei (for marketplace reference)
    mapping(uint256 => uint256) public invoiceFaceValue;

    // tokenId → due date (unix timestamp)
    mapping(uint256 => uint256) public invoiceDueDate;

    // tokenId → total supply minted (1 for whole, N for fractional)
    mapping(uint256 => uint256) public tokenSupply;

    // events
    event InvoiceMinted(
        uint256 indexed tokenId,
        address indexed minter,
        bytes32 indexed invoiceHash,
        uint256 faceValue,
        uint256 dueDate,
        uint256 supply,
        string uri
    );

    event InvoiceBurned(uint256 indexed tokenId, address indexed burner);

    // constructor
    constructor(address admin) ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _nextTokenId = 1; // start token IDs at 1
    }

    // minting

    /**
     * @notice Mint an invoice NFT.
     * @param to          The SME wallet receiving the token.
     * @param invoiceHash keccak256 hash of the canonical invoice string
     *                    (computed off-chain by Kavya's pipeline).
     * @param faceValue   Invoice amount in wei.
     * @param dueDate     Unix timestamp of invoice due date.
     * @param supply      1 for whole ownership; N for fractional shares.
     * @param uri         IPFS URI of the invoice document.
     */
    function mint(
        address to,
        bytes32 invoiceHash,
        uint256 faceValue,
        uint256 dueDate,
        uint256 supply,
        string calldata uri
    ) external onlyRole(MINTER_ROLE) nonReentrant whenNotPaused returns (uint256) {
        require(hashToTokenId[invoiceHash] == 0, "InvoiceNFT: duplicate invoice hash");
        require(to != address(0), "InvoiceNFT: mint to zero address");
        require(supply >= 1, "InvoiceNFT: supply must be >= 1");
        require(faceValue > 0, "InvoiceNFT: face value must be > 0");
        require(dueDate > block.timestamp, "InvoiceNFT: due date must be in the future");

        uint256 tokenId = _nextTokenId++;

        hashToTokenId[invoiceHash] = tokenId;
        tokenIdToHash[tokenId] = invoiceHash;
        _tokenURIs[tokenId] = uri;
        originalMinter[tokenId] = to;
        invoiceFaceValue[tokenId] = faceValue;
        invoiceDueDate[tokenId] = dueDate;
        tokenSupply[tokenId] = supply;

        _mint(to, tokenId, supply, "");

        emit InvoiceMinted(tokenId, to, invoiceHash, faceValue, dueDate, supply, uri);

        return tokenId;
    }

    // uri

    function uri(uint256 tokenId) public view override returns (string memory) {
        require(tokenSupply[tokenId] > 0, "InvoiceNFT: token does not exist");
        return _tokenURIs[tokenId];
    }

    // ─── Hash Registry (for Kavya's duplicate detection) ─────────────────────

    /**
     * @notice Check if an invoice hash is already registered on-chain.
     *         Called by Kavya's backend before minting.
     */
    function isHashRegistered(bytes32 invoiceHash) external view returns (bool) {
        return hashToTokenId[invoiceHash] != 0;
    }

    // role management

    function grantMinterRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MINTER_ROLE, account);
    }

    function revokeMinterRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(MINTER_ROLE, account);
    }

    // pause

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // overrides

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}