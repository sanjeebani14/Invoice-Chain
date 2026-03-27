import { network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

// ─── Update this with Kavya's backend wallet address ─────────────────────────
// Kavya: run `python -c "from eth_account import Account; a = Account.create(); print(a.address, a.key.hex())"` 
// in her backend environment to generate a wallet, then paste the address here
const BACKEND_WALLET_ADDRESS = "0x_PASTE_KAVYAS_BACKEND_WALLET_HERE";

// InvoiceNFT contract address from deployments/addresses.ts
const INVOICE_NFT_ADDRESS = "0xd41e3dda44cb512f3f8e7c410b93ad50e8c53df8";

async function main() {
  if (BACKEND_WALLET_ADDRESS === "0x_PASTE_KAVYAS_BACKEND_WALLET_HERE") {
    throw new Error("Update BACKEND_WALLET_ADDRESS with the backend's actual wallet address first");
  }

  const { viem } = await network.connect();
  const [deployer] = await viem.getWalletClients();

  console.log("Granting MINTER_ROLE");
  console.log("  InvoiceNFT:     ", INVOICE_NFT_ADDRESS);
  console.log("  Backend wallet: ", BACKEND_WALLET_ADDRESS);
  console.log("  Deployer:       ", deployer.account.address);

  const invoiceNFT = await viem.getContractAt(
    "InvoiceNFT",
    INVOICE_NFT_ADDRESS as `0x${string}`
  );

  await invoiceNFT.write.grantMinterRole([
    BACKEND_WALLET_ADDRESS as `0x${string}`,
  ]);

  console.log("\nMINTER_ROLE granted to backend wallet");
  console.log("backend can now call InvoiceNFT.mint() from the FastAPI backend");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});