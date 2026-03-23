import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { keccak256, toBytes, parseEther, getAddress } from "viem";

describe("Marketplace", async function () {

  // mints 1 whole invoice (supply=1) to SME,
  // and approves the Marketplace to transfer on SME's behalf.

  async function deployAndMintFixture() {
    const { viem } = await network.connect();
    const [admin, sme, investor, feeWallet, attacker] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

    const invoiceNFT = await viem.deployContract("InvoiceNFT", [
      admin.account.address,
    ]);

    const marketplace = await viem.deployContract("Marketplace", [
      invoiceNFT.address,
      feeWallet.account.address,
      250n, // fee
    ]);

    const invoiceHash = keccak256(toBytes("test-invoice-001"));
    const dueDate = BigInt(Math.floor(Date.now() / 1000) + 86400 * 30);
    const faceValue = parseEther("10000");

    await invoiceNFT.write.mint(
      [sme.account.address, invoiceHash, faceValue, dueDate, 1n, "ipfs://QmTestInvoice001"],
      { account: admin.account }
    );

    await invoiceNFT.write.setApprovalForAll(
      [marketplace.address, true],
      { account: sme.account }
    );

    return {
      invoiceNFT,
      marketplace,
      admin,
      sme,
      investor,
      feeWallet,
      attacker,
      publicClient,
      tokenId: 1n,
    };
  }

  // mints 100 fractional shares instead of 1 whole token.

  async function deployAndMintFractionalFixture() {
    const { viem } = await network.connect();
    const [admin, sme, investor, feeWallet, investor2] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

    const invoiceNFT = await viem.deployContract("InvoiceNFT", [
      admin.account.address,
    ]);

    const marketplace = await viem.deployContract("Marketplace", [
      invoiceNFT.address,
      feeWallet.account.address,
      250n,
    ]);

    const invoiceHash = keccak256(toBytes("fractional-invoice-001"));
    const dueDate = BigInt(Math.floor(Date.now() / 1000) + 86400 * 30);

    await invoiceNFT.write.mint(
      [sme.account.address, invoiceHash, parseEther("100000"), dueDate, 100n, "ipfs://QmFractional"],
      { account: admin.account }
    );

    await invoiceNFT.write.setApprovalForAll(
      [marketplace.address, true],
      { account: sme.account }
    );

    return {
      invoiceNFT,
      marketplace,
      admin,
      sme,
      investor,
      investor2,
      feeWallet,
      publicClient,
      tokenId: 1n,
    };
  }

  // deploy

  it("sets the correct InvoiceNFT address", async function () {
    const { marketplace, invoiceNFT } = await deployAndMintFixture();
    assert.equal(
      await marketplace.read.invoiceNFT(),
      getAddress(invoiceNFT.address)
    );
  });

  it("sets initial fee to 250 bps (2.5%)", async function () {
    const { marketplace } = await deployAndMintFixture();
    assert.equal(await marketplace.read.platformFeeBps(), 250n);
  });

  it("sets the feeRecipient correctly", async function () {
    const { marketplace, feeWallet } = await deployAndMintFixture();
    assert.equal(
      await marketplace.read.feeRecipient(),
      getAddress(feeWallet.account.address)
    );
  });

  it("reverts deployment if NFT address is zero", async function () {
    const { viem } = await network.connect();
    const [, feeWallet] = await viem.getWalletClients();

    await assert.rejects(
      viem.deployContract("Marketplace", [
        "0x0000000000000000000000000000000000000000",
        feeWallet.account.address,
        250n,
      ]),
      /zero NFT address/
    );
  });

  it("reverts deployment if initial fee exceeds MAX_FEE_BPS", async function () {
    const { viem } = await network.connect();
    const [admin, feeWallet] = await viem.getWalletClients();

    const invoiceNFT = await viem.deployContract("InvoiceNFT", [
      admin.account.address,
    ]);

    await assert.rejects(
      viem.deployContract("Marketplace", [
        invoiceNFT.address,
        feeWallet.account.address,
        1001n,
      ]),
      /fee too high/
    );
  });

  // listInvoice()

  it("creates a listing with correct fields", async function () {
    const { marketplace, sme, tokenId } = await deployAndMintFixture();
    const pricePerShare = parseEther("9000");

    await marketplace.write.listInvoice(
      [tokenId, pricePerShare, 1n],
      { account: sme.account }
    );

    const listing = await marketplace.read.getListing([1n]);
    assert.equal(listing.listingId, 1n);
    assert.equal(listing.tokenId, tokenId);
    assert.equal(listing.seller, getAddress(sme.account.address));
    assert.equal(listing.pricePerShare, pricePerShare);
    assert.equal(listing.sharesListed, 1n);
    assert.equal(listing.sharesAvailable, 1n);
    assert.equal(listing.active, true);
  });

  it("records the listing under the seller address", async function () {
    const { marketplace, sme, tokenId } = await deployAndMintFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("9000"), 1n],
      { account: sme.account }
    );

    const sellerListings = await marketplace.read.getSellerListings([
      sme.account.address,
    ]);
    assert.deepEqual(sellerListings, [1n]);
  });

  it("reverts if caller does not own enough shares", async function () {
    const { marketplace, sme, tokenId } = await deployAndMintFixture();

    await assert.rejects(
      marketplace.write.listInvoice(
        [tokenId, parseEther("9000"), 2n],
        { account: sme.account }
      ),
      /insufficient token balance/
    );
  });

  it("reverts if approval has not been granted", async function () {
    const { invoiceNFT, marketplace, sme, tokenId } = await deployAndMintFixture();

    await invoiceNFT.write.setApprovalForAll(
      [marketplace.address, false],
      { account: sme.account }
    );

    await assert.rejects(
      marketplace.write.listInvoice(
        [tokenId, parseEther("9000"), 1n],
        { account: sme.account }
      ),
      /approve this contract first/
    );
  });

  it("reverts if token already has an active listing", async function () {
    const { marketplace, sme, tokenId } = await deployAndMintFractionalFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("100"), 10n],
      { account: sme.account }
    );

    await assert.rejects(
      marketplace.write.listInvoice(
        [tokenId, parseEther("200"), 10n],
        { account: sme.account }
      ),
      /already has an active listing/
    );
  });

  it("allows re-listing after previous listing is cancelled", async function () {
    const { marketplace, sme, tokenId } = await deployAndMintFractionalFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("100"), 10n],
      { account: sme.account }
    );

    await marketplace.write.cancelListing([1n], { account: sme.account });

    await marketplace.write.listInvoice(
      [tokenId, parseEther("200"), 10n],
      { account: sme.account }
    );

    const listing = await marketplace.read.getListing([2n]);
    assert.equal(listing.active, true);
    assert.equal(listing.pricePerShare, parseEther("200"));
  });

  // buyShares()

  it("transfers the full token to buyer on a whole-invoice purchase", async function () {
    const { invoiceNFT, marketplace, sme, investor, tokenId } =
      await deployAndMintFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("9000"), 1n],
      { account: sme.account }
    );

    await marketplace.write.buyShares([1n, 1n], {
      account: investor.account,
      value: parseEther("9000"),
    });

    assert.equal(
      await invoiceNFT.read.balanceOf([investor.account.address, tokenId]),
      1n
    );
    assert.equal(
      await invoiceNFT.read.balanceOf([sme.account.address, tokenId]),
      0n
    );
  });

  it("supports partial purchases on fractional listings", async function () {
    const { invoiceNFT, marketplace, sme, investor, tokenId } =
      await deployAndMintFractionalFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("1"), 100n],
      { account: sme.account }
    );

    await marketplace.write.buyShares([1n, 30n], {
      account: investor.account,
      value: parseEther("30"),
    });

    assert.equal(
      await invoiceNFT.read.balanceOf([investor.account.address, tokenId]),
      30n
    );

    const listing = await marketplace.read.getListing([1n]);
    assert.equal(listing.sharesAvailable, 70n);
    assert.equal(listing.active, true);
  });

  it("marks listing inactive when all shares are purchased", async function () {
    const { marketplace, sme, investor, tokenId } =
      await deployAndMintFractionalFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("1"), 100n],
      { account: sme.account }
    );

    await marketplace.write.buyShares([1n, 100n], {
      account: investor.account,
      value: parseEther("100"),
    });

    const listing = await marketplace.read.getListing([1n]);
    assert.equal(listing.active, false);
    assert.equal(listing.sharesAvailable, 0n);
  });

  it("distributes ETH correctly — 2.5% fee to feeWallet, rest to seller", async function () {
    const { marketplace, sme, investor, feeWallet, tokenId, publicClient } =
      await deployAndMintFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("100"), 1n],
      { account: sme.account }
    );

    const smeBefore = await publicClient.getBalance({ address: sme.account.address });
    const feeBefore = await publicClient.getBalance({ address: feeWallet.account.address });

    await marketplace.write.buyShares([1n, 1n], {
      account: investor.account,
      value: parseEther("100"),
    });

    const smeAfter = await publicClient.getBalance({ address: sme.account.address });
    const feeAfter = await publicClient.getBalance({ address: feeWallet.account.address });

    assert.equal(feeAfter - feeBefore, parseEther("2.5"));
    assert.equal(smeAfter - smeBefore, parseEther("97.5"));
  });

  it("refunds overpayment to the buyer", async function () {
    const { marketplace, sme, investor, tokenId, publicClient } =
      await deployAndMintFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("100"), 1n],
      { account: sme.account }
    );

    const buyerBefore = await publicClient.getBalance({ address: investor.account.address });

    const txHash = await marketplace.write.buyShares([1n, 1n], {
      account: investor.account,
      value: parseEther("110"), // overpay by 10 ETH
    });

    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;

    const buyerAfter = await publicClient.getBalance({ address: investor.account.address });
    const netCost = buyerBefore - buyerAfter - gasUsed;

    assert.equal(netCost, parseEther("100")); // only 100 ETH deducted despite sending 110
  });

  it("reverts if seller tries to buy their own listing", async function () {
    const { marketplace, sme, tokenId } = await deployAndMintFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("100"), 1n],
      { account: sme.account }
    );

    await assert.rejects(
      marketplace.write.buyShares([1n, 1n], {
        account: sme.account,
        value: parseEther("100"),
      }),
      /seller cannot buy their own listing/
    );
  });

  it("reverts if insufficient ETH sent", async function () {
    const { marketplace, sme, investor, tokenId } = await deployAndMintFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("100"), 1n],
      { account: sme.account }
    );

    await assert.rejects(
      marketplace.write.buyShares([1n, 1n], {
        account: investor.account,
        value: parseEther("50"),
      }),
      /insufficient ETH sent/
    );
  });

  it("reverts if listing is not active", async function () {
    const { marketplace, sme, investor, tokenId } = await deployAndMintFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("100"), 1n],
      { account: sme.account }
    );

    await marketplace.write.cancelListing([1n], { account: sme.account });

    await assert.rejects(
      marketplace.write.buyShares([1n, 1n], {
        account: investor.account,
        value: parseEther("100"),
      }),
      /listing is not active/
    );
  });

  it("reverts if requesting more shares than available", async function () {
    const { marketplace, sme, investor, tokenId } =
      await deployAndMintFractionalFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("1"), 10n],
      { account: sme.account }
    );

    await assert.rejects(
      marketplace.write.buyShares([1n, 11n], {
        account: investor.account,
        value: parseEther("11"),
      }),
      /not enough shares available/
    );
  });

  // cancelListing()

  it("seller can cancel their own listing", async function () {
    const { marketplace, sme, tokenId } = await deployAndMintFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("100"), 1n],
      { account: sme.account }
    );

    await marketplace.write.cancelListing([1n], { account: sme.account });

    const listing = await marketplace.read.getListing([1n]);
    assert.equal(listing.active, false);
  });

  it("admin can cancel any listing", async function () {
    const { marketplace, sme, admin, tokenId } = await deployAndMintFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("100"), 1n],
      { account: sme.account }
    );

    await marketplace.write.cancelListing([1n], { account: admin.account });

    const listing = await marketplace.read.getListing([1n]);
    assert.equal(listing.active, false);
  });

  it("third party cannot cancel a listing", async function () {
    const { marketplace, sme, attacker, tokenId } = await deployAndMintFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("100"), 1n],
      { account: sme.account }
    );

    await assert.rejects(
      marketplace.write.cancelListing([1n], { account: attacker.account }),
      /not seller or admin/
    );
  });

  // quotePurchase()

  it("returns correct cost breakdown for a partial purchase", async function () {
    const { marketplace, sme, tokenId } = await deployAndMintFractionalFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("1"), 100n],
      { account: sme.account }
    );

    const [totalCost, fee, sellerProceeds] =
      await marketplace.read.quotePurchase([1n, 25n]);

    assert.equal(totalCost, parseEther("25"));
    assert.equal(fee, parseEther("0.625"));
    assert.equal(sellerProceeds, parseEther("24.375"));
  });

  // admin functions

  it("owner can update the platform fee", async function () {
    const { marketplace, admin } = await deployAndMintFixture();

    await marketplace.write.setFee([500n], { account: admin.account });
    assert.equal(await marketplace.read.platformFeeBps(), 500n);
  });

  it("reverts if fee update exceeds MAX_FEE_BPS", async function () {
    const { marketplace, admin } = await deployAndMintFixture();

    await assert.rejects(
      marketplace.write.setFee([1001n], { account: admin.account }),
      /fee exceeds maximum/
    );
  });

  it("owner can update the fee recipient", async function () {
    const { marketplace, admin, attacker } = await deployAndMintFixture();

    await marketplace.write.setFeeRecipient(
      [attacker.account.address],
      { account: admin.account }
    );

    assert.equal(
      await marketplace.read.feeRecipient(),
      getAddress(attacker.account.address)
    );
  });

  it("non-owner cannot change fee", async function () {
    const { marketplace, attacker } = await deployAndMintFixture();

    await assert.rejects(
      marketplace.write.setFee([100n], { account: attacker.account }),
      /OwnableUnauthorizedAccount/
    );
  });

  // pause

  it("paused contract blocks listInvoice", async function () {
    const { marketplace, sme, admin, tokenId } = await deployAndMintFixture();

    await marketplace.write.pause({ account: admin.account });

    await assert.rejects(
      marketplace.write.listInvoice(
        [tokenId, parseEther("100"), 1n],
        { account: sme.account }
      ),
      /EnforcedPause/
    );
  });

  it("cancelListing still works while paused", async function () {
    const { marketplace, sme, admin, tokenId } = await deployAndMintFixture();

    await marketplace.write.listInvoice(
      [tokenId, parseEther("100"), 1n],
      { account: sme.account }
    );

    await marketplace.write.pause({ account: admin.account });

    await marketplace.write.cancelListing([1n], { account: sme.account });

    const listing = await marketplace.read.getListing([1n]);
    assert.equal(listing.active, false);
  });

  it("operations resume after unpause", async function () {
    const { marketplace, sme, admin, tokenId } = await deployAndMintFixture();

    await marketplace.write.pause({ account: admin.account });
    await marketplace.write.unpause({ account: admin.account });

    await marketplace.write.listInvoice(
      [tokenId, parseEther("100"), 1n],
      { account: sme.account }
    );

    const listing = await marketplace.read.getListing([1n]);
    assert.equal(listing.active, true);
  });

});