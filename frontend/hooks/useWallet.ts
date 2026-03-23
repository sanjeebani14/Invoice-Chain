"use client";
import { useEffect, useMemo, useCallback } from "react";
// Import the context we verified in the previous step
import { useWallet as useWalletContext } from "../context/WalletContext";

export function useWallet() {
  const ctx = useWalletContext();

  /**
   * AUTO-REFRESH BALANCE
   * Keeps the UI in sync with the blockchain every 30 seconds.
   */
  useEffect(() => {
    if (!ctx.currentAccount || !ctx.isConnected) return;

    const tick = async () => {
      try {
        await ctx.refreshBalance();
      } catch (e) {
        // Silently fail to avoid spamming the console during background sync
      }
    };

    const id = setInterval(tick, 30_000);
    tick(); // Initial fetch

    return () => clearInterval(id);
  }, [ctx.currentAccount, ctx.isConnected, ctx.refreshBalance]);

  /**
   * FORMATTED HELPERS
   */
  const shortAddress = useMemo(() => {
    if (!ctx.currentAccount) return null;
    return `${ctx.currentAccount.slice(0, 6)}...${ctx.currentAccount.slice(-4)}`;
  }, [ctx.currentAccount]);

  // Merge context and helpers
  return {
    // Connection State
    isConnected: ctx.isConnected,
    currentAccount: ctx.currentAccount,
    balance: ctx.balance,
    chainId: ctx.chainId,
    isCorrectNetwork: ctx.isCorrectNetwork,
    
    // Actions
    connectWallet: ctx.connectWallet,
    switchNetwork: ctx.switchNetwork,
    disconnectWallet: ctx.disconnectWallet,
    refreshBalance: ctx.refreshBalance,
    
    // LINKING LOGIC (Added these back!)
    linkedWallets: ctx.linkedWallets,
    linkWallet: ctx.linkWallet,
    unlinkWallet: ctx.unlinkWallet,
    fetchLinkedWallets: ctx.fetchLinkedWallets,

    // UI Helpers
    loading: ctx.loading,
    error: ctx.error,
    shortAddress,
    balanceLoading: ctx.balanceLoading
  };
}

export default useWallet;