import { walletApi } from "./api";
import type { MessageResponse } from "./types";

/**
 * WALLET AUTH & CONNECTION
 */

// 1. Get Nonce for Signature (First step of Web3 login/link)
export const getWalletNonce = async (
  walletAddress: string
): Promise<{ nonce: string; message: string }> => {
  const { data } = await walletApi.post<{ nonce: string; message: string }>(
    "/nonce", 
    { wallet_address: walletAddress }
  );
  return data;
};

// 2. Verify and Login via Wallet (For guest users logging in via Web3)
export const verifySignature = async (payload: { 
  wallet_address: string; 
  nonce: string; 
  signature: string 
}): Promise<any> => {
  const { data } = await walletApi.post("/verify-signature", payload);
  return data;
};

/**
 * WALLET MANAGEMENT
 */

// 3. Link a new wallet to the currently logged-in account
export const linkWallet = async (payload: {
  wallet_address: string;
  nonce: string;
  signature: string;
}): Promise<MessageResponse> => {
  const { data } = await walletApi.post("/link", payload);
  return data;
};

// 4. Remove a wallet link from the account
export const unlinkWallet = async (address: string): Promise<MessageResponse> => {
  const { data } = await walletApi.delete(`/${address}`);
  return data;
};

// 5. Trigger a balance refresh from the blockchain RPC
export const refreshWalletBalance = async (address: string): Promise<any> => {
  const { data } = await walletApi.post(`/${address}/balance`);
  return data;
};