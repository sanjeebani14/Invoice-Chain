import { api } from "./client";

export const walletService = {
  // 1. Get Nonce for Signature
  getNonce: async (walletAddress: string) => {
    const { data } = await api.post("/wallet/nonce", { wallet_address: walletAddress });
    return data; // { nonce: "..." }
  },

  // 2. Verify and Login via Wallet
  verifySignature: async (payload: { wallet_address: string; nonce: string; signature: string }) => {
    const { data } = await api.post("/wallet/verify-signature", payload);
    return data;
  },

  // 3. Link Wallet to Logged-in Account
  linkWallet: async (payload: { wallet_address: string; nonce: string; signature: string }) => {
    const { data } = await api.post("/wallet/link", payload);
    return data;
  },

  // 4. Unlink (Delete) a Wallet
  unlinkWallet: async (address: string) => {
    const { data } = await api.delete(`/wallet/${address}`);
    return data;
  },

  // 5. Update/Fetch Balance from RPC
  refreshBalance: async (address: string) => {
    const { data } = await api.post(`/wallet/${address}/balance`);
    return data;
  }
};