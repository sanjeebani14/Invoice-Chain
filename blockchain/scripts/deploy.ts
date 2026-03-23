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
`;
  fs.writeFileSync(path.join(outDir, "addresses.ts"), tsContent);
  console.log("TypeScript address file written to deployments/addresses.ts");

  console.log("\n✅ All contracts deployed successfully!");
  console.log("\nNext steps:");
  console.log("1. Copy deployments/baseSepolia.json to the frontend/backend");
  console.log("2. Run: npx hardhat verify --network baseSepolia", invoiceNFT.address, deployer.account.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});