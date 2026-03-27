import { network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const { viem } = await network.connect();
  const [deployer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  console.log("Deploying with account:", deployer.account.address);

  const balance = await publicClient.getBalance({ address: deployer.account.address });
  console.log("Account balance:", balance.toString(), "wei");

  // Deploy InvoiceNFT
  console.log("\nDeploying InvoiceNFT");
  const invoiceNFT = await viem.deployContract("InvoiceNFT", [
    deployer.account.address,
  ]);
  console.log("InvoiceNFT deployed to:", invoiceNFT.address);

  // Deploy Escrow
  console.log("\nDeploying Escrow");
  const escrow = await viem.deployContract("Escrow", [
    invoiceNFT.address,
    deployer.account.address, // multisig address (update in production)
  ]);
  console.log("Escrow deployed to:", escrow.address);

  // Deploy Marketplace
  console.log("\nDeploying Marketplace");
  const marketplace = await viem.deployContract("Marketplace", [
    invoiceNFT.address,
    deployer.account.address, // fee recipient — update to multisig in prod
    250n, // 2.5% fee
  ]);
  console.log("Marketplace deployed to:", marketplace.address);

  // Deploy Auction
  console.log("\n🔨 Deploying Auction...");
  const auction = await viem.deployContract("Auction", [
    invoiceNFT.address,
    deployer.account.address, // fee recipient
  ]);
  console.log("Auction deployed to:", auction.address);

  // Configure Roles
  console.log("\nConfiguring roles");

  // Grant MINTER_ROLE to deployer (backend)
  await invoiceNFT.write.grantMinterRole([deployer.account.address]);
  console.log("✓ MINTER_ROLE granted to deployer");

  // Grant BURNER_ROLE to deployer (backend settlement service)
  await invoiceNFT.write.grantBurnerRole([deployer.account.address]);
  console.log("✓ BURNER_ROLE granted to deployer");

  // Grant BURNER_ROLE to Escrow contract (for burn after settlement)
  await invoiceNFT.write.grantBurnerRole([escrow.address]);
  console.log("✓ BURNER_ROLE granted to Escrow contract");

  // Grant PAUSER_ROLE to deployer
  await invoiceNFT.write.grantPauserRole([deployer.account.address]);
  console.log("✓ PAUSER_ROLE granted to deployer");

  // Export Deployment Info
  console.log("\nExporting deployment artifacts");

  const deploymentInfo = {
    network: "baseSepolia",
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    deployer: deployer.account.address,
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
        description: "Multi-sig escrow for fund management and settlement",
      },
      Marketplace: {
        address: marketplace.address,
        abi: JSON.parse(
          fs.readFileSync(
            path.join(__dirname, "../artifacts/contracts/Marketplace.sol/Marketplace.json"),
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
        description: "Auction mechanism for price discovery",
      },
    },
  };

  const outDir = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });

  // Write JSON deployment info
  fs.writeFileSync(
    path.join(outDir, "baseSepolia.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("✓ Deployment info written to deployments/baseSepolia.json");

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
} as const;
`;
  fs.writeFileSync(path.join(outDir, "addresses.ts"), tsContent);
  console.log("✓ TypeScript address file written to deployments/addresses.ts");

  // Write environment template
  const envTemplate = `# Auto-generated environment template
# Generated: ${new Date().toISOString()}

# Blockchain
BLOCKCHAIN_RPC_URL=https://sepolia.base.org
INVOICE_NFT_CONTRACT_ADDRESS=${invoiceNFT.address}
ESCROW_CONTRACT_ADDRESS=${escrow.address}
MARKETPLACE_CONTRACT_ADDRESS=${marketplace.address}
AUCTION_CONTRACT_ADDRESS=${auction.address}

# Backend wallet (for minting and burning)
MINTER_PRIVATE_KEY=<your-backend-private-key>

# Multisig/Fee recipient
FEE_RECIPIENT_ADDRESS=${deployer.account.address}

# Blockchain sync
BLOCKCHAIN_SYNC_ENABLED=true
BLOCKCHAIN_SYNC_INTERVAL_SECONDS=30
BLOCKCHAIN_SYNC_START_BLOCK=latest
`;
  fs.writeFileSync(path.join(outDir, ".env.example"), envTemplate);
  console.log("✓ Environment template written to deployments/.env.example");

  console.log("\n" + "=".repeat(60));
  console.log("Deployment Complete");
  console.log("=".repeat(60));
  console.log("\nDeployed Contracts:");
  console.log(`  InvoiceNFT:  ${invoiceNFT.address}`);
  console.log(`  Escrow:      ${escrow.address}`);
  console.log(`  Marketplace: ${marketplace.address}`);
  console.log(`  Auction:     ${auction.address}`);

  console.log("\nNext Steps:");
  console.log("1. Copy deployments/baseSepolia.json to frontend/public/ and backend/");
  console.log("2. Update .env with MINTER_PRIVATE_KEY");
  console.log("3. Deploy additional backend wallet with MINTER_ROLE (optional):");
  console.log(`   npx hardhat --network baseSepolia eval "console.log('Deploy your backend wallet')" `);
  console.log("4. Verify contracts on Basescan:");
  console.log(`   npx hardhat verify --network baseSepolia ${invoiceNFT.address} ${deployer.account.address}`);
  console.log("\nDocumentation: See deployments/baseSepolia.json for ABI references");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});