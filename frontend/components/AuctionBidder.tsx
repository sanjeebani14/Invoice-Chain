"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useAuction } from "@/hooks/useAuction";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatEther, parseEther } from "viem";

interface AuctionBidderProps {
  auctionId: number;
  invoiceId: number;
  onBidPlaced?: (bidId: number) => void;
}

/**
 * Component for placing bids on invoices.
 * Integrates with backend API and smart contracts.
 */
export function AuctionBidder({ auctionId, invoiceId, onBidPlaced }: AuctionBidderProps) {
  const { currentAccount, isConnected, isCorrectNetwork } = useWallet();
  const { getAuctionData, getTimeRemaining, isWinningBidder } = useAuction();

  const [auctionData, setAuctionData] = useState<any>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [bidAmount, setBidAmount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load auction data
  useEffect(() => {
    const loadAuction = async () => {
      const result = await getAuctionData(auctionId);
      if (result.success) {
        setAuctionData(result.data);
      }
    };

    loadAuction();
    const interval = setInterval(loadAuction, 10000); // Refresh every 10s

    return () => clearInterval(interval);
  }, [auctionId, getAuctionData]);

  // Update time remaining
  useEffect(() => {
    const updateTime = async () => {
      const remaining = await getTimeRemaining(auctionId);
      setTimeRemaining(remaining);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [auctionId, getTimeRemaining]);

  const formattedHighestBid = useMemo(() => {
    if (!auctionData) return "0.00";
    return parseFloat(formatEther(BigInt(auctionData.highestBid))).toFixed(2);
  }, [auctionData]);

  const formattedStartingPrice = useMemo(() => {
    if (!auctionData) return "0.00";
    return parseFloat(formatEther(BigInt(auctionData.startingPrice))).toFixed(2);
  }, [auctionData]);

  const minimumBid = useMemo(() => {
    if (!auctionData) return 0;
    const highestBid = parseFloat(formatEther(BigInt(auctionData.highestBid)));
    const starting = parseFloat(formatEther(BigInt(auctionData.startingPrice)));

    if (highestBid === 0) return starting;

    // 5% increment minimum
    return highestBid * 1.05;
  }, [auctionData]);

  const timeRemainingFormatted = useMemo(() => {
    const hours = Math.floor(timeRemaining / 3600);
    const minutes = Math.floor((timeRemaining % 3600) / 60);
    const seconds = timeRemaining % 60;

    if (timeRemaining <= 0) return "Auction ended";
    return `${hours}h ${minutes}m ${seconds}s`;
  }, [timeRemaining]);

  const isAuctionActive = useMemo(() => {
    return auctionData && auctionData.status === "0" && timeRemaining > 0;
  }, [auctionData, timeRemaining]);

  const userIsWinner = useMemo(() => {
    return auctionData && isWinningBidder(auctionId, auctionData.highestBidder);
  }, [auctionData, isWinningBidder, auctionId]);

  const handlePlaceBid = async () => {
    if (!isConnected) {
      toast.error("Connect wallet first");
      return;
    }

    if (!isCorrectNetwork) {
      toast.error("Switch to correct network");
      return;
    }

    if (!bidAmount || parseFloat(bidAmount) <= 0) {
      setError("Enter valid bid amount");
      return;
    }

    const bidValue = parseFloat(bidAmount);
    if (bidValue < minimumBid) {
      setError(`Minimum bid is ${minimumBid.toFixed(4)} ETH`);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Call backend to place bid (which calls contract)
      const response = await api.post(`/api/v1/auctions/${auctionId}/bid`, {
        bid_amount: bidValue,
      });

      if (response.data.success) {
        toast.success("Bid placed successfully!");
        setBidAmount("");
        if (onBidPlaced) {
          onBidPlaced(response.data.bid_id);
        }

        // Reload auction
        const result = await getAuctionData(auctionId);
        if (result.success) {
          setAuctionData(result.data);
        }
      } else {
        setError(response.data.detail || "Bid placement failed");
        toast.error(response.data.detail || "Bid placement failed");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Error placing bid";
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (!auctionData) {
    return <div className="p-4 text-muted-foreground">Loading auction...</div>;
  }

  return (
    <div className="border rounded-lg p-6 bg-card">
      <h3 className="text-lg font-semibold mb-4">Place Your Bid</h3>

      {/* Auction Status */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <p className="text-sm text-muted-foreground">Current Bid</p>
          <p className="text-2xl font-bold">{formattedHighestBid} ETH</p>
          {userIsWinner && (
            <p className="text-xs text-green-600 mt-1">You're winning</p>
          )}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Time Remaining</p>
          <p className="text-xl font-mono">{timeRemainingFormatted}</p>
        </div>
      </div>

      {/* Bid Input */}
      {isAuctionActive ? (
        <>
          <div className="mb-4">
            <label className="text-sm font-medium">Your Bid (ETH)</label>
            <input
              type="number"
              step="0.01"
              min={minimumBid}
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              placeholder={`Minimum ${minimumBid.toFixed(4)} ETH`}
              className="w-full mt-2 px-3 py-2 border rounded-md bg-background"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Minimum: {minimumBid.toFixed(4)} ETH (5% increment)
            </p>
          </div>

          {error && <div className="text-sm text-red-500 mb-4">{error}</div>}

          <button
            onClick={handlePlaceBid}
            disabled={loading || !isAuctionActive}
            className="w-full bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Placing Bid..." : "Place Bid"}
          </button>
        </>
      ) : (
        <div className="p-4 bg-muted rounded-md text-center">
          <p className="text-sm text-muted-foreground">
            Auction {auctionData.status === "1" ? "settled" : "ended"}
          </p>
        </div>
      )}

      {/* Info */}
      <div className="mt-6 pt-4 border-t text-xs text-muted-foreground space-y-2">
        <p>✓ Your bid is secure in blockchain escrow</p>
        <p>✓ If outbid, your funds are refunded automatically</p>
        <p>✓ Settlement happens automatically when auction ends</p>
      </div>
    </div>
  );
}