import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { keccak256, toBytes, parseEther, getAddress } from "viem";

describe("Auction", async function () {

  async function deployAuctionFixture() {
    const { viem } = await network.connect();
    const [admin, seller, investor1, investor2, investor3, feeWallet] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

    const invoiceNFT = await viem.deployContract("InvoiceNFT", [admin.account.address]);
    const auction = await viem.deployContract("Auction", [invoiceNFT.address, feeWallet.account.address]);

    const thirtyDaysFromNow = BigInt(Math.floor(Date.now() / 1000) + 86400 * 30);

    // Mint invoice to seller
    const invoiceHash = keccak256(toBytes("auction-test-001"));
    const faceValue = parseEther("10000");

    await invoiceNFT.write.mint(
      [seller.account.address, invoiceHash, faceValue, thirtyDaysFromNow, 100n, "ipfs://QmAuction001"],
      { account: admin.account }
    );

    // Approve auction contract
    await invoiceNFT.write.setApprovalForAll([auction.address, true], { account: seller.account });

    return {
      viem,
      invoiceNFT,
      auction,
      admin,
      seller,
      investor1,
      investor2,
      investor3,
      feeWallet,
      publicClient,
      thirtyDaysFromNow,
      tokenId: 1n,
      faceValue,
    };
  }

  // Auction Creation

  describe("Auction Creation", () => {
    it("creates auction with correct initial state", async () => {
      const { auction, seller, tokenId } = await deployAuctionFixture();

      const auctionId = 1n;
      const startPrice = parseEther("100");
      const duration = BigInt(7 * 24 * 60 * 60); // 7 days

      await auction.write.createAuction(
        [tokenId, 50n, startPrice, duration],
        { account: seller.account }
      );

      const auctionData = await auction.read.getAuction([auctionId]);

      assert.equal(auctionData.auctionId, auctionId);
      assert.equal(auctionData.tokenId, tokenId);
      assert.equal(auctionData.seller, getAddress(seller.account.address));
      assert.equal(auctionData.sharesOnAuction, 50n);
      assert.equal(auctionData.startingPrice, startPrice);
      assert.equal(auctionData.highestBid, 0n);
      assert.equal(auctionData.highestBidder, "0x0000000000000000000000000000000000000000");
      assert.equal(auctionData.status, 0n); // Active
    });

    it("transfers shares into contract escrow on creation", async () => {
      const { invoiceNFT, auction, seller, tokenId } = await deployAuctionFixture();

      const balanceBefore = await invoiceNFT.read.balanceOf([seller.account.address, tokenId]);
      assert.equal(balanceBefore, 100n);

      const duration = BigInt(7 * 24 * 60 * 60);
      await auction.write.createAuction(
        [tokenId, 50n, parseEther("100"), duration],
        { account: seller.account }
      );

      const balanceAfter = await invoiceNFT.read.balanceOf([seller.account.address, tokenId]);
      const escrowBalance = await invoiceNFT.read.balanceOf([auction.address, tokenId]);

      assert.equal(balanceAfter, 50n);
      assert.equal(escrowBalance, 50n);
    });

    it("rejects auction with zero shares", async () => {
      const { auction, seller, tokenId } = await deployAuctionFixture();

      await assert.rejects(
        () =>
          auction.write.createAuction(
            [tokenId, 0n, parseEther("100"), BigInt(7 * 24 * 60 * 60)],
            { account: seller.account }
          ),
        /Auction: shares must be > 0/
      );
    });

    it("rejects auction with zero starting price", async () => {
      const { auction, seller, tokenId } = await deployAuctionFixture();

      await assert.rejects(
        () =>
          auction.write.createAuction(
            [tokenId, 50n, 0n, BigInt(7 * 24 * 60 * 60)],
            { account: seller.account }
          ),
        /Auction: starting price must be > 0/
      );
    });

    it("rejects auction with duration < 1 hour", async () => {
      const { auction, seller, tokenId } = await deployAuctionFixture();

      await assert.rejects(
        () =>
          auction.write.createAuction(
            [tokenId, 50n, parseEther("100"), 30n * 60n], // 30 minutes
            { account: seller.account }
          ),
        /Auction: duration too short/
      );
    });

    it("rejects auction with duration > 30 days", async () => {
      const { auction, seller, tokenId } = await deployAuctionFixture();

      await assert.rejects(
        () =>
          auction.write.createAuction(
            [tokenId, 50n, parseEther("100"), BigInt(31 * 24 * 60 * 60)],
            { account: seller.account }
          ),
        /Auction: duration too long/
      );
    });

    it("rejects if seller not approved contract", async () => {
      const { viem, invoiceNFT, auction, admin, seller } = await deployAuctionFixture();
      const thirtyDaysFromNow = BigInt(Math.floor(Date.now() / 1000) + 86400 * 30);

      // Create new token without approval
      const invoiceHash = keccak256(toBytes("no-approval-test"));
      await invoiceNFT.write.mint(
        [seller.account.address, invoiceHash, parseEther("5000"), thirtyDaysFromNow, 100n, "ipfs://QmTest"],
        { account: admin.account }
      );

      const tokenId = 2n;

      await assert.rejects(
        () =>
          auction.write.createAuction(
            [tokenId, 50n, parseEther("100"), BigInt(7 * 24 * 60 * 60)],
            { account: seller.account }
          ),
        /Auction: contract not approved/
      );
    });
  });

  // Bidding

  describe("Bidding", () => {
    it("places opening bid at or above starting price", async () => {
      const { auction, seller, investor1, tokenId } = await deployAuctionFixture();

      const duration = BigInt(7 * 24 * 60 * 60);
      const startPrice = parseEther("100");

      await auction.write.createAuction(
        [tokenId, 50n, startPrice, duration],
        { account: seller.account }
      );

      const bidAmount = parseEther("150");
      await auction.write.placeBid([1n], { account: investor1.account, value: bidAmount });

      const auctionData = await auction.read.getAuction([1n]);
      assert.equal(auctionData.highestBid, bidAmount);
      assert.equal(auctionData.highestBidder, getAddress(investor1.account.address));
    });

    it("rejects opening bid below starting price", async () => {
      const { auction, seller, investor1, tokenId } = await deployAuctionFixture();

      const duration = BigInt(7 * 24 * 60 * 60);
      const startPrice = parseEther("100");

      await auction.write.createAuction(
        [tokenId, 50n, startPrice, duration],
        { account: seller.account }
      );

      await assert.rejects(
        () =>
          auction.write.placeBid([1n], { account: investor1.account, value: parseEther("50") }),
        /Auction: below starting price/
      );
    });

    it("places subsequent bid with minimum increment", async () => {
      const { auction, seller, investor1, investor2, tokenId } = await deployAuctionFixture();

      const duration = BigInt(7 * 24 * 60 * 60);
      await auction.write.createAuction(
        [tokenId, 50n, parseEther("100"), duration],
        { account: seller.account }
      );

      const bid1 = parseEther("100");
      await auction.write.placeBid([1n], { account: investor1.account, value: bid1 });

      // Minimum increment is 5% (105 ETH)
      const bid2 = parseEther("105");
      await auction.write.placeBid([1n], { account: investor2.account, value: bid2 });

      const auctionData = await auction.read.getAuction([1n]);
      assert.equal(auctionData.highestBidder, getAddress(investor2.account.address));
      assert.equal(auctionData.highestBid, bid2);
    });

    it("refunds previous highest bidder", async () => {
      const { auction, seller, investor1, investor2, publicClient, tokenId } = await deployAuctionFixture();

      const duration = BigInt(7 * 24 * 60 * 60);
      await auction.write.createAuction(
        [tokenId, 50n, parseEther("100"), duration],
        { account: seller.account }
      );

      const bid1 = parseEther("100");
      await auction.write.placeBid([1n], { account: investor1.account, value: bid1 });

      const bid2 = parseEther("105");
      await auction.write.placeBid([1n], { account: investor2.account, value: bid2 });

      const pendingRefund = await auction.read.getPendingRefund([investor1.account.address]);
      assert.equal(pendingRefund, bid1);
    });

    it("allows bidder to claim refund", async () => {
      const { auction, seller, investor1, investor2, tokenId } = await deployAuctionFixture();

      const duration = BigInt(7 * 24 * 60 * 60);
      await auction.write.createAuction(
        [tokenId, 50n, parseEther("100"), duration],
        { account: seller.account }
      );

      await auction.write.placeBid([1n], { account: investor1.account, value: parseEther("100") });
      await auction.write.placeBid([1n], { account: investor2.account, value: parseEther("105") });

      // Claim refund
      await auction.write.claimRefund([], { account: investor1.account });

      const pendingRefund = await auction.read.getPendingRefund([investor1.account.address]);
      assert.equal(pendingRefund, 0n);
    });

    it("rejects bid with insufficient increment", async () => {
      const { auction, seller, investor1, investor2, tokenId } = await deployAuctionFixture();

      const duration = BigInt(7 * 24 * 60 * 60);
      await auction.write.createAuction(
        [tokenId, 50n, parseEther("100"), duration],
        { account: seller.account }
      );

      await auction.write.placeBid([1n], { account: investor1.account, value: parseEther("100") });

      // Try to bid 102 (only 2% increase but as define before, needs 5%)
      await assert.rejects(
        () =>
          auction.write.placeBid([1n], { account: investor2.account, value: parseEther("102") }),
        /Auction: bid too low/
      );
    });

    it("rejects seller bidding on own auction", async () => {
      const { auction, seller, tokenId } = await deployAuctionFixture();

      const duration = BigInt(7 * 24 * 60 * 60);
      await auction.write.createAuction(
        [tokenId, 50n, parseEther("100"), duration],
        { account: seller.account }
      );

      await assert.rejects(
        () =>
          auction.write.placeBid([1n], { account: seller.account, value: parseEther("150") }),
        /Auction: seller cannot bid/
      );
    });
  });

  // Settlement

  describe("Settlement", () => {
    it("settles auction with winner and transfers funds", async () => {
      const { viem, auction, invoiceNFT, seller, investor1, feeWallet, tokenId, publicClient } =
        await deployAuctionFixture();

      const duration = 2n; // 2 seconds for quick test
      await auction.write.createAuction(
        [tokenId, 50n, parseEther("100"), duration],
        { account: seller.account }
      );

      const bidAmount = parseEther("150");
      await auction.write.placeBid([1n], { account: investor1.account, value: bidAmount });

      // Wait for auction to end
      await publicClient.waitForBlockChange();
      await publicClient.waitForBlockChange();

      // Settle
      await auction.write.settleAuction([1n]);

      const auctionData = await auction.read.getAuction([1n]);
      assert.equal(auctionData.status, 1n); // Settled

      // Winner should have shares
      const winnerBalance = await invoiceNFT.read.balanceOf([investor1.account.address, tokenId]);
      assert.equal(winnerBalance, 50n);

      // Check settlement record
      const settlement = await auction.read.getSettlement([1n]);
      assert.equal(settlement.winner, getAddress(investor1.account.address));
      assert.equal(settlement.settledPrice, bidAmount);
    });

    it("returns shares to seller if no bids", async () => {
      const { auction, invoiceNFT, seller, tokenId, publicClient } = await deployAuctionFixture();

      const duration = 2n;
      await auction.write.createAuction(
        [tokenId, 50n, parseEther("100"), duration],
        { account: seller.account }
      );

      // Wait for end
      await publicClient.waitForBlockChange();
      await publicClient.waitForBlockChange();

      // Settle
      await auction.write.settleAuction([1n]);

      const auctionData = await auction.read.getAuction([1n]);
      assert.equal(auctionData.status, 1n); // Settled

      // Seller should have all shares back
      const sellerBalance = await invoiceNFT.read.balanceOf([seller.account.address, tokenId]);
      assert.equal(sellerBalance, 100n); // 100 - 50 locked + 50 returned
    });

    it("calculates and deducts platform fee on settlement", async () => {
      const { auction, seller, investor1, feeWallet, tokenId, publicClient } = await deployAuctionFixture();

      const duration = 2n;
      await auction.write.createAuction(
        [tokenId, 50n, parseEther("100"), duration],
        { account: seller.account }
      );

      const bidAmount = parseEther("1000");
      await auction.write.placeBid([1n], { account: investor1.account, value: bidAmount });

      await publicClient.waitForBlockChange();
      await publicClient.waitForBlockChange();

      await auction.write.settleAuction([1n]);

      const settlement = await auction.read.getSettlement([1n]);

      // Fee is 2.5% (25 ETH (250 bps))
      const expectedFee = (bidAmount * 250n) / 10000n;
      const expectedSellerProceeds = bidAmount - expectedFee;

      assert.equal(settlement.platformFee, expectedFee);
      assert.equal(settlement.sellerProceeds, expectedSellerProceeds);
    });

    it("rejects settlement before auction ends", async () => {
      const { auction, seller, tokenId } = await deployAuctionFixture();

      const duration = BigInt(7 * 24 * 60 * 60);
      await auction.write.createAuction(
        [tokenId, 50n, parseEther("100"), duration],
        { account: seller.account }
      );

      await assert.rejects(
        () => auction.write.settleAuction([1n]),
        /Auction: not yet ended/
      );
    });

    it("allows anyone to settle (not just seller)", async () => {
      const { auction, investor2, tokenId, publicClient } = await deployAuctionFixture();

      const duration = 2n;
      await auction.write.createAuction(
        [tokenId, 50n, parseEther("100"), duration],
        { account: (await (await network.connect()).viem.getWalletClients())[1].account }
      );

      await publicClient.waitForBlockChange();
      await publicClient.waitForBlockChange();

      // Investor2 settles (not seller)
      await auction.write.settleAuction([1n], { account: investor2.account });

      const auctionData = await auction.read.getAuction([1n]);
      assert.equal(auctionData.status, 1n); // Settled
    });
  });

  // Cancellation

  describe("Cancellation", () => {
    it("seller can cancel auction with no bids", async () => {
      const { auction, seller, tokenId, invoiceNFT } = await deployAuctionFixture();

      const duration = BigInt(7 * 24 * 60 * 60);
      await auction.write.createAuction(
        [tokenId, 50n, parseEther("100"), duration],
        { account: seller.account }
      );

      await auction.write.cancelAuction([1n, "test cancellation"], { account: seller.account });

      const auctionData = await auction.read.getAuction([1n]);
      assert.equal(auctionData.status, 2n); // Cancelled

      // Shares returned to seller
      const balance = await invoiceNFT.read.balanceOf([seller.account.address, tokenId]);
      assert.equal(balance, 100n);
    });

    it("rejects cancel from non-seller", async () => {
      const { auction, seller, investor1, tokenId } = await deployAuctionFixture();

      const duration = BigInt(7 * 24 * 60 * 60);
      await auction.write.createAuction(
        [tokenId, 50n, parseEther("100"), duration],
        { account: seller.account }
      );

      await assert.rejects(
        () =>
          auction.write.cancelAuction([1n, "unauthorized"], { account: investor1.account }),
        /Auction: not seller/
      );
    });

    it("rejects cancel after bids placed", async () => {
      const { auction, seller, investor1, tokenId } = await deployAuctionFixture();

      const duration = BigInt(7 * 24 * 60 * 60);
      await auction.write.createAuction(
        [tokenId, 50n, parseEther("100"), duration],
        { account: seller.account }
      );

      await auction.write.placeBid([1n], { account: investor1.account, value: parseEther("150") });

      await assert.rejects(
        () =>
          auction.write.cancelAuction([1n, "test"], { account: seller.account }),
        /Auction: bids already placed/
      );
    });
  });

  // Admin

  describe("Admin Controls", () => {
    it("admin can set platform fee", async () => {
      const { auction, admin } = await deployAuctionFixture();

      await auction.write.setFee([500n], { account: admin.account }); // 5%

      const fee = await auction.read.platformFeeBps();
      assert.equal(fee, 500n);
    });

    it("rejects fee > 10%", async () => {
      const { auction, admin } = await deployAuctionFixture();

      await assert.rejects(
        () => auction.write.setFee([1001n], { account: admin.account }),
        /Auction: fee too high/
      );
    });

    it("admin can set bid increment", async () => {
      const { auction, admin } = await deployAuctionFixture();

      await auction.write.setMinBidIncrement([1000n], { account: admin.account }); // 10%

      const increment = await auction.read.minBidIncrementBps();
      assert.equal(increment, 1000n);
    });

    it("admin can pause/unpause", async () => {
      const { auction, admin, seller, tokenId } = await deployAuctionFixture();

      await auction.write.pause([], { account: admin.account });

      const duration = BigInt(7 * 24 * 60 * 60);

      await assert.rejects(
        () =>
          auction.write.createAuction(
            [tokenId, 50n, parseEther("100"), duration],
            { account: seller.account }
          ),
        /EnforcedPause/
      );

      await auction.write.unpause([], { account: admin.account });

      await auction.write.createAuction(
        [tokenId, 50n, parseEther("100"), duration],
        { account: seller.account }
      );
    });
  });
});