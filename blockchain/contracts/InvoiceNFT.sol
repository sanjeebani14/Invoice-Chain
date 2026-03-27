// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract InvoiceNFT is ERC1155, AccessControl, ReentrancyGuard, Pausable {

    // roles
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

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

    // tokenId → amount burned (for settlement tracking)
    mapping(uint256 => uint256) public amountBurned;

    // tokenId → settled (prevents double settlement)
    mapping(uint256 => bool) public isSettled;

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

    event InvoiceBurned(
        uint256 indexed tokenId,
        address indexed burner,
        uint256 amount,
        string reason
    );

    event InvoiceSettled(
        uint256 indexed tokenId,
        address indexed settler,
        uint256 amountSettled,
        uint256 timestamp
    );

    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);

    // constructor
    constructor(address admin) ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(BURNER_ROLE, admin);
        _nextTokenId = 1; // start token IDs at 1
    }

    // Minting

    /**
<<<<<<< Updated upstream
     * @notice Mint an invoice NFT.
     * @param to          The SME wallet receiving the token.
     * @param invoiceHash keccak256 hash of the canonical invoice string
     *                    (computed off-chain).
=======
     * @notice Mint an invoice NFT with fractional share support.
     * @param to          The seller wallet receiving the token.
     * @param invoiceHash keccak256 hash of the canonical invoice string (computed off-chain).
>>>>>>> Stashed changes
     * @param faceValue   Invoice amount in wei.
     * @param dueDate     Unix timestamp of invoice due date.
     * @param supply      1 for whole ownership; N for fractional shares.
     * @param tokenURI    IPFS URI of the invoice document.
     * @return tokenId    The newly minted token ID.
     */
    function mint(
        address to,
        bytes32 invoiceHash,
        uint256 faceValue,
        uint256 dueDate,
        uint256 supply,
        string calldata tokenURI
    ) external onlyRole(MINTER_ROLE) nonReentrant whenNotPaused returns (uint256) {
        require(hashToTokenId[invoiceHash] == 0, "InvoiceNFT: duplicate invoice hash");
        require(to != address(0), "InvoiceNFT: mint to zero address");
        require(supply >= 1, "InvoiceNFT: supply must be >= 1");
        require(faceValue > 0, "InvoiceNFT: face value must be > 0");
        require(dueDate > block.timestamp, "InvoiceNFT: due date must be in the future");

        uint256 tokenId = _nextTokenId++;

        hashToTokenId[invoiceHash] = tokenId;
        tokenIdToHash[tokenId] = invoiceHash;
        _tokenURIs[tokenId] = tokenURI;
        originalMinter[tokenId] = to;
        invoiceFaceValue[tokenId] = faceValue;
        invoiceDueDate[tokenId] = dueDate;
        tokenSupply[tokenId] = supply;
        amountBurned[tokenId] = 0;
        isSettled[tokenId] = false;

        _mint(to, tokenId, supply, "");

        emit InvoiceMinted(tokenId, to, invoiceHash, faceValue, dueDate, supply, tokenURI);

        return tokenId;
    }

    // Burning (Settlement)

    /**
     * @notice Burn invoice shares after settlement/payment.
     *         Only BURNER_ROLE (backend) can burn to mark invoices as settled.
     * @param from    The address whose shares are being burned.
     * @param tokenId The invoice token ID.
     * @param amount  Number of shares to burn.
     * @param reason  Description of burn reason (e.g., paid_in_full, partial_payment).
     */
    function burn(
        address from,
        uint256 tokenId,
        uint256 amount,
        string calldata reason
    ) external onlyRole(BURNER_ROLE) nonReentrant {
        require(tokenSupply[tokenId] > 0, "InvoiceNFT: token does not exist");
        require(amount > 0, "InvoiceNFT: burn amount must be > 0");
        require(balanceOf(from, tokenId) >= amount, "InvoiceNFT: insufficient balance to burn");

        amountBurned[tokenId] += amount;

        // Mark as settled if all shares burned
        if (amountBurned[tokenId] >= tokenSupply[tokenId]) {
            isSettled[tokenId] = true;
        }

        _burn(from, tokenId, amount);

        emit InvoiceBurned(tokenId, from, amount, reason);
    }

    /**
     * @notice Burn shares from msg.sender for self-settlement.
     * @param tokenId The invoice token ID.
     * @param amount  Number of shares to burn.
     * @param reason  Description of burn reason.
     */
    function burnSelf(
        uint256 tokenId,
        uint256 amount,
        string calldata reason
    ) external nonReentrant {
        require(tokenSupply[tokenId] > 0, "InvoiceNFT: token does not exist");
        require(amount > 0, "InvoiceNFT: burn amount must be > 0");
        require(balanceOf(msg.sender, tokenId) >= amount, "InvoiceNFT: insufficient balance");

        amountBurned[tokenId] += amount;

        if (amountBurned[tokenId] >= tokenSupply[tokenId]) {
            isSettled[tokenId] = true;
        }

        _burn(msg.sender, tokenId, amount);

        emit InvoiceBurned(tokenId, msg.sender, amount, reason);
    }

    /**
     * @notice Mark invoice as settled (for final settlement record).
     * @param tokenId The invoice token ID.
     */
    function markAsSettled(uint256 tokenId) external onlyRole(BURNER_ROLE) {
        require(tokenSupply[tokenId] > 0, "InvoiceNFT: token does not exist");
        require(!isSettled[tokenId], "InvoiceNFT: already settled");

        isSettled[tokenId] = true;

        emit InvoiceSettled(tokenId, msg.sender, invoiceFaceValue[tokenId], block.timestamp);
    }

    // Metadata and Lookup

    /**
     * @notice Get the IPFS URI for an invoice token.
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        require(tokenSupply[tokenId] > 0, "InvoiceNFT: token does not exist");
        return _tokenURIs[tokenId];
    }

    /**
     * @notice Check if an invoice hash is already registered on-chain.
     *         Called by backend before minting to prevent duplicates.
     */
    function isHashRegistered(bytes32 invoiceHash) external view returns (bool) {
        return hashToTokenId[invoiceHash] != 0;
    }

    /**
     * @notice Get settlement percentage (amount burned / total supply).
     */
    function getSettlementPercentage(uint256 tokenId) external view returns (uint256) {
        require(tokenSupply[tokenId] > 0, "InvoiceNFT: token does not exist");
        if (tokenSupply[tokenId] == 0) return 0;
        return (amountBurned[tokenId] * 100) / tokenSupply[tokenId];
    }

    /**
     * @notice Check if invoice is fully settled.
     */
    function isFullySettled(uint256 tokenId) external view returns (bool) {
        return isSettled[tokenId];
    }

    /**
     * @notice Get full invoice metadata.
     */
    function getInvoiceMetadata(uint256 tokenId)
        external
        view
        returns (
            bytes32 hash,
            address minter,
            uint256 faceValue,
            uint256 dueDate,
            uint256 totalSupply,
            uint256 burned,
            bool settled,
            string memory ipfsUri
        )
    {
        require(tokenSupply[tokenId] > 0, "InvoiceNFT: token does not exist");
        return (
            tokenIdToHash[tokenId],
            originalMinter[tokenId],
            invoiceFaceValue[tokenId],
            invoiceDueDate[tokenId],
            tokenSupply[tokenId],
            amountBurned[tokenId],
            isSettled[tokenId],
            _tokenURIs[tokenId]
        );
    }

    // Role Management

    /**
     * @notice Grant MINTER_ROLE to an account.
     */
    function grantMinterRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MINTER_ROLE, account);
        emit RoleGranted(MINTER_ROLE, account, msg.sender);
    }

    /**
     * @notice Revoke MINTER_ROLE from an account.
     */
    function revokeMinterRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(MINTER_ROLE, account);
        emit RoleRevoked(MINTER_ROLE, account, msg.sender);
    }

    /**
     * @notice Grant BURNER_ROLE to an account.
     */
    function grantBurnerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(BURNER_ROLE, account);
        emit RoleGranted(BURNER_ROLE, account, msg.sender);
    }

    /**
     * @notice Revoke BURNER_ROLE from an account.
     */
    function revokeBurnerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(BURNER_ROLE, account);
        emit RoleRevoked(BURNER_ROLE, account, msg.sender);
    }

    /**
     * @notice Grant PAUSER_ROLE to an account.
     */
    function grantPauserRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(PAUSER_ROLE, account);
        emit RoleGranted(PAUSER_ROLE, account, msg.sender);
    }

    /**
     * @notice Revoke PAUSER_ROLE from an account.
     */
    function revokePauserRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(PAUSER_ROLE, account);
        emit RoleRevoked(PAUSER_ROLE, account, msg.sender);
    }

    /**
     * @notice Check if an account has a specific role.
     */
    function hasRole(bytes32 role, address account) public view override returns (bool) {
        return super.hasRole(role, account);
    }

    // Pause/Unpause

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // Overrides

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}