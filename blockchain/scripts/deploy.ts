import { network } from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to retry transactions with exponential backoff
async function retryTransaction(
  fn: () => Promise<any>,
  retries: number = 3,
  delay: number = 5000
) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`  ⚠️ Attempt ${i + 1} failed, retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2; // exponential backoff
    }
  }
}

async function main() {
  const { viem } = await network.connect();
  const [deployer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  console.log("\n" + "=".repeat(70));
  console.log("INVOICE CHAIN SMART CONTRACT DEPLOYMENT");
  console.log("=".repeat(70));

  console.log("\nDeployer Account:", deployer.account.address);

  const balance = await publicClient.getBalance({
    address: deployer.account.address,
  });
  console.log("Account Balance:", (Number(balance) / 1e18).toFixed(4), "ETH");

  // Deploy InvoiceNFT
  console.log("\nDeploying InvoiceNFT Contract");
  const invoiceNFT = await viem.deployContract("InvoiceNFT", [
    deployer.account.address,
  ]);
  console.log("InvoiceNFT deployed to:", invoiceNFT.address);

  // Deploy Escrow
  console.log("\nDeploying Escrow Contract");
  const escrow = await viem.deployContract("Escrow", [
    invoiceNFT.address,
    deployer.account.address, // multisig address (update in production)
  ]);
  console.log("Escrow deployed to:", escrow.address);

  // Deploy Marketplace
  console.log("\nDeploying Marketplace Contract");
  const marketplace = await viem.deployContract("Marketplace", [
    invoiceNFT.address,
    deployer.account.address, // fee recipient — update to multisig in prod
    250n, // 2.5% fee
  ]);
  console.log("Marketplace deployed to:", marketplace.address);

  // Deploy Auction
  console.log("\nDeploying Auction Contract");
  const auction = await viem.deployContract("Auction", [
    invoiceNFT.address,
    deployer.account.address, // fee recipient
  ]);
  console.log("Auction deployed to:", auction.address);

  // Configure Roles
  console.log("\nConfiguring Contract Roles");

  // Grant MINTER_ROLE to deployer (backend)
  console.log("  • Granting MINTER_ROLE to deployer");
  await retryTransaction(() =>
    invoiceNFT.write.grantMinterRole([deployer.account.address])
  );
  console.log("    MINTER_ROLE granted to deployer");
  await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s between transactions

  // Grant BURNER_ROLE to deployer (backend settlement service)
  console.log("  • Granting BURNER_ROLE to deployer");
  await retryTransaction(() =>
    invoiceNFT.write.grantBurnerRole([deployer.account.address])
  );
  console.log("    BURNER_ROLE granted to deployer");
  await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s between transactions

  // Grant BURNER_ROLE to Escrow contract (for burn after settlement)
  console.log("  • Granting BURNER_ROLE to Escrow contract");
  await retryTransaction(() =>
    invoiceNFT.write.grantBurnerRole([escrow.address])
  );
  console.log("    BURNER_ROLE granted to Escrow contract");
  await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s between transactions

  // Grant PAUSER_ROLE to deployer
  console.log("  • Granting PAUSER_ROLE to deployer");
  await retryTransaction(() =>
    invoiceNFT.write.grantPauserRole([deployer.account.address])
  );
  console.log("   PAUSER_ROLE granted to deployer");

  // Export Deployment Info
  console.log("\nExporting Deployment Artifacts");

  const deploymentInfo = {
    network: "baseSepolia",
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    deployer: deployer.account.address,
    version: "1.0.0",
    contracts: {
      InvoiceNFT: {
        address: invoiceNFT.address,
        abi: JSON.parse(
          fs.readFileSync(
            path.join(__dirname, "../artifacts/contracts/InvoiceNFT.sol/InvoiceNFT.json"),
            "utf8"
          )
        ).abi,
        description: "ERC1155 token for invoice NFTs with burn/settlement support",
      },
      Escrow: {
        address: escrow.address,
        abi: JSON.parse(
          fs.readFileSync(
            path.join(__dirname, "../artifacts/contracts/Escrow.sol/Escrow.json"),
            "utf8"
          )
        ).abi,
        description:
          "Multi-sig escrow for secure fund management and settlement",
      },
      Marketplace: {
        address: marketplace.address,
        abi: JSON.parse(
          fs.readFileSync(
            path.join(
              __dirname,
              "../artifacts/contracts/Marketplace.sol/Marketplace.json"
            ),
            "utf8"
          )
        ).abi,
        description: "Fixed-price marketplace for invoice share trading",
      },
      Auction: {
        address: auction.address,
        abi: JSON.parse(
          fs.readFileSync(
            path.join(__dirname, "../artifacts/contracts/Auction.sol/Auction.json"),
            "utf8"
          )
        ).abi,
        description:
          "Auction mechanism for price discovery and competitive bidding",
      },
    },
  };

  // Write to deployments directory
  const outDir = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });

  // Write JSON deployment info
  fs.writeFileSync(
    path.join(outDir, "baseSepolia.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("  Deployment info written to deployments/baseSepolia.json");

  // Write TypeScript address constants
  const tsContent = `// AUTO-GENERATED — do not edit manually
// Generated at: ${new Date().toISOString()}

export const CONTRACT_ADDRESSES = {
  InvoiceNFT: "${invoiceNFT.address}" as const,
  Escrow: "${escrow.address}" as const,
  Marketplace: "${marketplace.address}" as const,
  Auction: "${auction.address}" as const,
} as const;

export const CHAIN_ID = 84532; // Base Sepolia

export const DEPLOYER = "${deployer.account.address}" as const;

export const DEPLOYMENT_INFO = {
  network: "baseSepolia" as const,
  chainId: 84532 as const,
  deployedAt: "${new Date().toISOString()}",
  deployer: DEPLOYER,
  version: "1.0.0",
} as const;
`;
  fs.writeFileSync(path.join(outDir, "addresses.ts"), tsContent);
  console.log("  ✓ TypeScript address file written to deployments/addresses.ts");

  // Write environment template
  const envTemplate = `# Auto-generated environment template
# Generated: ${new Date().toISOString()}
# Copy this to .env and fill in your values

# Blockchain RPC
BLOCKCHAIN_RPC_URL=https://sepolia.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Smart Contracts
INVOICE_NFT_CONTRACT_ADDRESS=${invoiceNFT.address}
ESCROW_CONTRACT_ADDRESS=${escrow.address}
MARKETPLACE_CONTRACT_ADDRESS=${marketplace.address}
AUCTION_CONTRACT_ADDRESS=${auction.address}

# Backend Wallet (for minting and burning)
# IMPORTANT: Keep this private key secret!
# Generate with: python -c "from eth_account import Account; a = Account.create(); print(a.address, a.key.hex())"
MINTER_PRIVATE_KEY=<your-backend-private-key-here>
DEPLOYER_PRIVATE_KEY=<your-deployer-private-key-here>

# Fee Recipient
FEE_RECIPIENT_ADDRESS=${deployer.account.address}

# Blockchain Sync
BLOCKCHAIN_SYNC_ENABLED=true
BLOCKCHAIN_SYNC_INTERVAL_SECONDS=30
BLOCKCHAIN_SYNC_START_BLOCK=latest

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/invoice_chain

# Redis (for caching/queues)
REDIS_URL=redis://localhost:6379

# AWS S3 (for document storage)
AWS_ACCESS_KEY_ID=<your-aws-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret>
S3_BUCKET_NAME=invoice-chain-docs

# Multisig (for production)
# Update these in production for decentralized governance
MULTISIG_ADDRESS=${deployer.account.address}
`;
  fs.writeFileSync(path.join(outDir, ".env.example"), envTemplate);
  console.log("  ✓ Environment template written to deployments/.env.example");

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(70));

  console.log("\nDeployed Contracts:");
  console.log(`  InvoiceNFT:  ${invoiceNFT.address}`);
  console.log(`  Escrow:      ${escrow.address}`);
  console.log(`  Marketplace: ${marketplace.address}`);
  console.log(`  Auction:     ${auction.address}`);

  console.log("\nContract Roles:");
  console.log(`  MINTER_ROLE:  Granted to ${deployer.account.address}`);
  console.log(`  BURNER_ROLE:  Granted to ${deployer.account.address} and Escrow`);
  console.log(`  PAUSER_ROLE:  Granted to ${deployer.account.address}`);

  console.log("\nExported Artifacts:");
  console.log("  deployments/baseSepolia.json");
  console.log("  deployments/addresses.ts");
  console.log("  deployments/.env.example");

  console.log("\nNext Steps:");
  console.log("  1. Copy deployments/baseSepolia.json to frontend/public/");
  console.log("  2. Copy deployments/baseSepolia.json to backend/");
  console.log("  3. Update .env with MINTER_PRIVATE_KEY and DEPLOYER_PRIVATE_KEY");
  console.log(
    "  4. Grant additional roles using: npx hardhat run scripts/grantRole.ts --network baseSepolia -- minter|burner|pauser <address>"
  );
  console.log("  5. Start backend: cd backend && uvicorn main:app --reload");
  console.log("  6. Start frontend: cd frontend && npm run dev");
  console.log("  7. (Optional) Verify contracts on Basescan:");
  console.log(
    `     npx hardhat verify --network baseSepolia ${invoiceNFT.address} ${deployer.account.address}`
  );

  console.log("\nDocumentation:");
  console.log("  • Contract ABIs: deployments/baseSepolia.json");
  console.log("  • Addresses: deployments/addresses.ts");
  console.log("  • Config: deployments/.env.example");

  console.log("\nImportant Notes:");
  console.log("  • Update MULTISIG_ADDRESS for production governance");
  console.log("  • Update FEE_RECIPIENT_ADDRESS to governance multisig");
  console.log("  • Never commit private keys to version control");
  console.log("  • Test thoroughly on testnet before mainnet deployment");

  console.log("\n" + "=".repeat(70));
}

main().catch((error) => {
  console.error("\n❌ Deployment failed:");
  console.error(error.message || error);
  console.error("\nTroubleshooting:");
  console.error("  • Ensure you have enough ETH in your account for gas fees");
  console.error("  • Check your RPC endpoint is accessible");
  console.error("  • Wait a few seconds and try again (RPC rate limit)");
  console.error("  • Run: npx hardhat run scripts/deploy.ts --network baseSepolia");
  process.exitCode = 1;
});