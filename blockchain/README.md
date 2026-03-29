# Invoice-Chain Smart Contracts

This directory contains the smart contracts that power the Invoice-Chain platform. The project is built using Hardhat, Solidity, and `viem`.

## Core Contracts
- **InvoiceNFT.sol**: Represents an invoice on the blockchain with fractional share support.
- **Escrow.sol**: Holds user funds securely until transactions are settled.
- **Marketplace.sol**: Facilitates buying and selling of fractional invoice shares.
- **Auction.sol**: Manages bidding and settlement for high-demand invoice shares.

---

## Environment Setup & API Keys

Before you can deploy these contracts or verify them on Blockscout/Basescan, you must configure your local environment.

1. Create a `.env` file in this directory (you can use your `deployments/.env.example` as a template).
2. **Obtain your required keys:**

   * **`BASE_SEPOLIA_RPC_URL`**: You need a connection to the Base Sepolia testnet blockchain. Go to an RPC provider like [Alchemy](https://alchemy.com/) or [QuickNode](https://quicknode.com/), create an account, spin up a new "Base Sepolia" application, and copy the HTTPS API Key URL.
   * **`DEPLOYER_PRIVATE_KEY`**: This is the private key of the exact wallet that will deploy and own the smart contracts. You can create a fresh wallet in [MetaMask](https://metamask.io/), go to Account Details, and click "Export Private Key". **NEVER commit this key to GitHub or share it publicly.**
   * **`BASESCAN_API_KEY`**: This is required so Hardhat can automatically upload your source code to the block explorer for public transparency. Go to [Basescan.org](https://basescan.org/), create an account, and generate a new API key under your profile settings.

*(Optional Production Governance Keys)*
   * **`MULTISIG_ADDRESS` & `FEE_RECIPIENT_ADDRESS`**: For production deployments, governance powers and protocol fees should not be handled by a single person. Create a Multi-Signature wallet on [Safe](https://app.safe.global/) (e.g. 2 out of 3 founders). Set this Safe address as your protocol's fee recipient to securely collect marketplace revenue into a decentralized treasury. For local testing, any standard wallet address will work.

---

## Usage Guide

### 1. Compile
Compile the smart contracts (this will generate the needed `.json` ABIs):
```bash
npx hardhat clean
npx hardhat compile
```

### 2. Test
Run the full test suite locally. *(Note: Testing runs on a local hardhat node and does not require setting up the `.env` keys above)*
```bash
npx hardhat test
```

### 3. Deploy
Deploy the smart contracts to the Base Sepolia testnet using real test-ETH:
```bash
npx hardhat run scripts/deploy.ts --network baseSepolia
```

### 4. Verify
If verification failed during the deployment script, you can manually trigger a verification request:
```bash
npx hardhat verify --network baseSepolia <NEW_CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```
