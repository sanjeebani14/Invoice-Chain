"use client";
import { useEffect, useMemo } from "react";
import { useWallet as useWalletContext } from "../context/WalletContext";

export function useWallet() {
  const ctx = useWalletContext();

  /**
   * AUTO-REFRESH BALANCE
   * Keeps the UI in sync with the blockchain every 30 seconds.
   */
  useEffect(() => {
    // Check if we can actually fetch balance
    if (!ctx.currentAccount || !ctx.isConnected || !ctx.isCorrectNetwork) return;

    const tick = async () => {
      try {
        await ctx.refreshBalance();
      } catch (e) {
        // Background sync failure is silent
      }
    };

    const id = setInterval(tick, 30_000);
    tick(); // Immediate fetch on mount

    return () => clearInterval(id);
    // CRITICAL: Added dependency array back
  }, [ctx.currentAccount, ctx.isConnected, ctx.isCorrectNetwork, ctx.refreshBalance]);

  /**
   * FORMATTED HELPERS
   */
  const shortAddress = useMemo(() => {
    if (!ctx.currentAccount) return null;
    return `${ctx.currentAccount.slice(0, 6)}...${ctx.currentAccount.slice(-4)}`;
  }, [ctx.currentAccount]);

  return {
    ...ctx,
    shortAddress,
  };
}

export default useWallet;