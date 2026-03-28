"use client";
import { useCallback } from "react";
import { api } from "@/lib/api";

export function useAuction() {
  const getAuctionData = useCallback(async (auctionId: number) => {
    try {
      const response = await api.get(`/auctions/${auctionId}`);
      return { success: true, data: response.data };
    } catch (error) {
      console.error("Failed to fetch auction data:", error);
      return { success: false, error: "Failed to load auction" };
    }
  }, []);

  const getTimeRemaining = useCallback(async (auctionId: number) => {
    try {
      const response = await api.get(`/auctions/${auctionId}/time-remaining`);
      return response.data.remainingSeconds || 0;
    } catch (error) {
      console.error("Failed to fetch time remaining:", error);
      return 0;
    }
  }, []);

  const isWinningBidder = useCallback(async (auctionId: number, bidderAddress: string) => {
    try {
      const response = await api.get(`/auctions/${auctionId}/bids/winning`);
      return response.data.winningBidder?.toLowerCase() === bidderAddress?.toLowerCase();
    } catch (error) {
      console.error("Failed to check winning bidder:", error);
      return false;
    }
  }, []);

  return {
    getAuctionData,
    getTimeRemaining,
    isWinningBidder,
  };
}