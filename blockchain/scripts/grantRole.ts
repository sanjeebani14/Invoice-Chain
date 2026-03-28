import { network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

const rawArgs = process.argv.slice(2);
const cleanedArgs = rawArgs.filter((arg) =>
  !["--", "run", "scripts/grantRole.ts", "--network", "baseSepolia", "localhost", "hardhat"].includes(arg)
);
const roleType = cleanedArgs[0] || process.env.ROLE; // minter, burner, pauser
const accountAddress = cleanedArgs[1] || process.env.ACCOUNT;

const INVOICE_NFT_ADDRESS = process.env.INVOICE_NFT_CONTRACT_ADDRESS;

function redactAddress(value: string | undefined | null): string {
  if (!value) return "<redacted>";
  const str = String(value);
  if (str.length <= 10) return "<redacted>";
  return `${str.slice(0, 6)}...${str.slice(-4)}`;
}

if (!INVOICE_NFT_ADDRESS) {
  throw new Error("INVOICE_NFT_CONTRACT_ADDRESS not set");
}

if (!roleType || !accountAddress) {
  throw new Error(
    "Usage: ROLE=minter|burner|pauser ACCOUNT=0x... npx hardhat run scripts/grantRole.ts --network baseSepolia " +
    "\nor with positional args after --: npx hardhat run scripts/grantRole.ts --network baseSepolia -- minter 0x..."
  );
}

async function main() {
  const { viem } = await network.connect();
  const [deployer] = await viem.getWalletClients();

  console.log(`\nGranting ${roleType.toUpperCase()}_ROLE`);
  console.log(`  Contract:  ${INVOICE_NFT_ADDRESS}`);
  console.log(`  Account:   ${redactAddress(accountAddress)}`);
  console.log(`  Deployer:  ${deployer.account.address}\n`);

  const invoiceNFT = await viem.getContractAt(
    "InvoiceNFT",
    INVOICE_NFT_ADDRESS as `0x${string}`
  );

  const account = accountAddress as `0x${string}`;

  switch (roleType.toLowerCase()) {
    case "minter":
      await invoiceNFT.write.grantMinterRole([account]);
      console.log("MINTER_ROLE granted");
      break;
    case "burner":
      await invoiceNFT.write.grantBurnerRole([account]);
      console.log("BURNER_ROLE granted");
      break;
    case "pauser":
      await invoiceNFT.write.grantPauserRole([account]);
      console.log("PAUSER_ROLE granted");
      break;
    default:
      throw new Error(`Unknown role: ${roleType}`);
  }

  console.log();
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exitCode = 1;
});
