import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("InvoiceNFTModule", (m) => {
  const admin = m.getAccount(0);
  const invoiceNFT = m.contract("InvoiceNFT", [admin]);

  return { invoiceNFT };
});
