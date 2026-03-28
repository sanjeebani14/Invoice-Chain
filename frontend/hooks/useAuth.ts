"use client";

import { useContext } from "react";
import { AuthContext, AuthContextType } from "@/context/AuthContext";

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

const AuctionABI = [
  {
    inputs: [{ internalType: "uint256", name: "auctionId", type: "uint256" }],
    name: "getAuction",
    outputs: [
      { internalType: "uint256", name: "auctionId", type: "uint256" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "address", name: "seller", type: "address" },
      { internalType: "uint256", name: "sharesOnAuction", type: "uint256" },
      { internalType: "uint256", name: "startingPrice", type: "uint256" },
      { internalType: "uint256", name: "highestBid", type: "uint256" },
      { internalType: "address", name: "highestBidder", type: "address" },
      { internalType: "uint256", name: "startTime", type: "uint256" },
      { internalType: "uint256", name: "endTime", type: "uint256" },
      { internalType: "uint8", name: "status", type: "uint8" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "auctionId", type: "uint256" }],
    name: "getTimeRemaining",
    outputs: [{ internalType: "int256", name: "", type: "int256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "bidder", type: "address" }],
    name: "getPendingRefund",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;