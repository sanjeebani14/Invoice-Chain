import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { keccak256, toBytes, parseEther } from "viem";
describe("InvoiceNFT", async function () {

  async function deployInvoiceNFT() {
    const { viem } = await network.connect();
    const [admin, sme, investor, attacker] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

      const invoiceNFT = await viem.deployContract("InvoiceNFT", [
      admin.account.address,
    ]);

    const thirtyDaysFromNow = BigInt(
      Math.floor(Date.now() / 1000) + 86400 * 30
    );

    return { viem, invoiceNFT, admin, sme, investor, attacker, publicClient, thirtyDaysFromNow };
  }

  // deployment

  it("grants MINTER_ROLE to admin at deploy", async function () {
    const { invoiceNFT, admin } = await deployInvoiceNFT();
    const MINTER_ROLE = keccak256(toBytes("MINTER_ROLE"));
    const hasRole = await invoiceNFT.read.hasRole([MINTER_ROLE, admin.account.address]);
    assert.equal(hasRole, true);
  });

  it("starts token ID counter at 1 (first minted token is ID 1)", async function () {
    const { viem, invoiceNFT, admin, sme, thirtyDaysFromNow } = await deployInvoiceNFT();
    const hash = keccak256(toBytes("first-invoice"));

    await invoiceNFT.write.mint(
      [sme.account.address, hash, parseEther("1000"), thirtyDaysFromNow, 1n, "ipfs://QmFirst"],
      { account: admin.account }
    );

    const balance = await invoiceNFT.read.balanceOf([sme.account.address, 1n]);
    assert.equal(balance, 1n);
  });

  // minting
  it("mints a whole invoice (supply=1) to the SME wallet", async function () {
    const { invoiceNFT, admin, sme, thirtyDaysFromNow } = await deployInvoiceNFT();
    const hash = keccak256(toBytes("invoice-001"));

    await invoiceNFT.write.mint(
      [sme.account.address, hash, parseEther("5000"), thirtyDaysFromNow, 1n, "ipfs://QmInvoice001"],
      { account: admin.account }
    );

    const balance = await invoiceNFT.read.balanceOf([sme.account.address, 1n]);
    assert.equal(balance, 1n);
  });

  it("stores all invoice metadata correctly on-chain", async function () {
    const { invoiceNFT, admin, sme, thirtyDaysFromNow } = await deployInvoiceNFT();
    const hash = keccak256(toBytes("invoice-metadata-test"));
    const faceValue = parseEther("2500");

    await invoiceNFT.write.mint(
      [sme.account.address, hash, faceValue, thirtyDaysFromNow, 1n, "ipfs://QmMetadata"],
      { account: admin.account }
    );

    assert.equal(await invoiceNFT.read.hashToTokenId([hash]), 1n);
    assert.equal(await invoiceNFT.read.tokenIdToHash([1n]), hash);
    assert.equal(await invoiceNFT.read.invoiceFaceValue([1n]), faceValue);
    assert.equal(await invoiceNFT.read.invoiceDueDate([1n]), thirtyDaysFromNow);
    assert.equal(await invoiceNFT.read.tokenSupply([1n]), 1n);
  });

  it("returns the correct IPFS URI via uri()", async function () {
    const { invoiceNFT, admin, sme, thirtyDaysFromNow } = await deployInvoiceNFT();
    const hash = keccak256(toBytes("invoice-uri-test"));

    await invoiceNFT.write.mint(
      [sme.account.address, hash, parseEther("100"), thirtyDaysFromNow, 1n, "ipfs://QmTestCID123"],
      { account: admin.account }
    );

    assert.equal(await invoiceNFT.read.uri([1n]), "ipfs://QmTestCID123");
  });

  it("mints fractional shares (supply=100) correctly", async function () {
    const { invoiceNFT, admin, sme, thirtyDaysFromNow } = await deployInvoiceNFT();
    const hash = keccak256(toBytes("fractional-invoice-001"));

    await invoiceNFT.write.mint(
      [sme.account.address, hash, parseEther("100000"), thirtyDaysFromNow, 100n, "ipfs://QmFractional"],
      { account: admin.account }
    );

    assert.equal(await invoiceNFT.read.balanceOf([sme.account.address, 1n]), 100n);
    assert.equal(await invoiceNFT.read.tokenSupply([1n]), 100n);
  });

  // duplicate detection

  it("rejects a second mint with the same invoice hash", async function () {
    const { invoiceNFT, admin, sme, thirtyDaysFromNow } = await deployInvoiceNFT();
    const hash = keccak256(toBytes("duplicate-invoice"));
  
    await invoiceNFT.write.mint(
      [sme.account.address, hash, parseEther("1000"), thirtyDaysFromNow, 1n, "ipfs://QmFirst"],
      { account: admin.account }
    );
  
    await assert.rejects(
      invoiceNFT.write.mint(
        [sme.account.address, hash, parseEther("1000"), thirtyDaysFromNow, 1n, "ipfs://QmSecond"],
        { account: admin.account }
      ),
      /duplicate invoice hash/
    );
  });

  it("isHashRegistered() returns false before mint", async function () {
    const { invoiceNFT } = await deployInvoiceNFT();
    const hash = keccak256(toBytes("not-yet-minted"));
    assert.equal(await invoiceNFT.read.isHashRegistered([hash]), false);
  });

  it("isHashRegistered() returns true after mint", async function () {
    const { invoiceNFT, admin, sme, thirtyDaysFromNow } = await deployInvoiceNFT();
    const hash = keccak256(toBytes("already-minted"));

    await invoiceNFT.write.mint(
      [sme.account.address, hash, parseEther("500"), thirtyDaysFromNow, 1n, "ipfs://Qm"],
      { account: admin.account }
    );

    assert.equal(await invoiceNFT.read.isHashRegistered([hash]), true);
  });

  // access control

  it("reverts if a non-minter tries to mint", async function () {
    const { invoiceNFT, attacker, sme, thirtyDaysFromNow } = await deployInvoiceNFT();
    const hash = keccak256(toBytes("attacker-attempt"));
  
    await assert.rejects(
      invoiceNFT.write.mint(
        [sme.account.address, hash, parseEther("1000"), thirtyDaysFromNow, 1n, "ipfs://Qm"],
        { account: attacker.account }
      )
    );
  });

  it("admin can grant MINTER_ROLE to another account", async function () {
    const { invoiceNFT, admin, investor } = await deployInvoiceNFT();
    const MINTER_ROLE = keccak256(toBytes("MINTER_ROLE"));

    await invoiceNFT.write.grantMinterRole([investor.account.address], {
      account: admin.account,
    });

    assert.equal(
      await invoiceNFT.read.hasRole([MINTER_ROLE, investor.account.address]),
      true
    );
  });

  // pause

  it("admin can pause and minting reverts while paused", async function () {
    const { invoiceNFT, admin, sme, thirtyDaysFromNow } = await deployInvoiceNFT();
    const hash = keccak256(toBytes("pause-test"));
  
    await invoiceNFT.write.pause({ account: admin.account });
  
    await assert.rejects(
      invoiceNFT.write.mint(
        [sme.account.address, hash, parseEther("1000"), thirtyDaysFromNow, 1n, "ipfs://Qm"],
        { account: admin.account }
      )
    );
  });

  it("minting works again after unpause", async function () {
    const { invoiceNFT, admin, sme, thirtyDaysFromNow } = await deployInvoiceNFT();
    const hash = keccak256(toBytes("unpause-test"));

    await invoiceNFT.write.pause({ account: admin.account });
    await invoiceNFT.write.unpause({ account: admin.account });

    await invoiceNFT.write.mint(
      [sme.account.address, hash, parseEther("1000"), thirtyDaysFromNow, 1n, "ipfs://Qm"],
      { account: admin.account }
    );

    assert.equal(await invoiceNFT.read.balanceOf([sme.account.address, 1n]), 1n);
  });
});