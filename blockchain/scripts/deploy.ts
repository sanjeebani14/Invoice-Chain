import { network } from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const { viem } = await network.connect();
    const [deployer] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

  console.log("Deploying with account:", deployer.account.address);

  const balance = await publicClient.getBalance({ address: deployer.account.address });
  console.log("Account balance:", balance.toString(), "wei");

  // deploy project
  console.log("\ndeploying invoicenft");
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
  // deploy marketplace
  console.log("\ndeploying marketplace");
  const marketplace = await viem.deployContract("Marketplace", [
    invoiceNFT.address,
    deployer.account.address, // fee recipient — update to multisig in prod
    250n,
  ]);
  console.log("Marketplace deployed to:", marketplace.address);

  // deploy auction
  console.log("\ndeploying auction");
  const auction = await viem.deployContract("Auction", [
    invoiceNFT.address,
    deployer.account.address,
  ]);
  console.log("Auction deployed to:", auction.address);

  // grants minter_role to backend deployer address
  // in production, will grant this to the fastapi backend wallet
  console.log("\nconfiguring roles");
  await invoiceNFT.write.grantMinterRole([deployer.account.address]);
  console.log("MINTER_ROLE granted to deployer");

  // exports addresses and ABIs for frontend/backend
  const deploymentInfo = {
    network: "baseSepolia" ,
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    contracts: {
      InvoiceNFT: {
        address: invoiceNFT.address,
        abi: JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/InvoiceNFT.sol/InvoiceNFT.json"), "utf8")).abi,
      },
      Marketplace: {
        address: marketplace.address,
        abi: JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/Marketplace.sol/Marketplace.json"), "utf8")).abi,
      },
      Auction: {
        address: auction.address,
        abi: JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/Auction.sol/Auction.json"), "utf8")).abi,
      },
    },
  };

  // writes to a shared location both frontend and backend can read
  const outDir = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "baseSepolia.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`\nDeployment info written to deployments/baseSepolia.json`);

  // typescript file with typed addresses for frontend import
  const tsContent = `// AUTO-GENERATED — do not edit manually
// Generated at: ${new Date().toISOString()}

export const CONTRACT_ADDRESSES = {
  InvoiceNFT: "${invoiceNFT.address}" as const,
  Marketplace: "${marketplace.address}" as const,
  Auction: "${auction.address}" as const,
} as const;

export const CHAIN_ID = 84532; // Base Sepolia

  fs.writeFileSync(path.join(outDir, "addresses.ts"), tsContent);
  console.log("TypeScript address file written to deployments/addresses.ts");

  console.log("\nAll contracts deployed successfully!");
  console.log("\nNext steps:");
  console.log("1. Copy deployments/baseSepolia.json to the frontend/backend");
  console.log("2. Run: npx hardhat verify --network baseSepolia", invoiceNFT.address, deployer.account.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});