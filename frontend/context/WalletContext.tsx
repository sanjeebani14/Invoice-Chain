"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as web3 from "../lib/web3";
import { toast } from "sonner";
import { EXPECTED_CHAIN_ID } from "@/lib/config";
// Use our centralized API instead of raw fetch
import { api, withAuthRefreshRetry } from "@/lib/api";
import type { AxiosError } from "axios";

type WalletContextShape = {
  isConnected: boolean;
  accounts: string[];
  currentAccount: string | null;
  chainId: number | null;
  networkName: string | null;
  isCorrectNetwork: boolean;
  balance: string | null;
  balanceWei: string | null;
  balanceLoading: boolean;
  linkedWallets: Array<{ wallet_address: string; is_primary: boolean }>;
  fetchLinkedWallets: () => Promise<void>;
  connectWallet: () => Promise<void>;
  switchNetwork: (chainId: number) => Promise<void>;
  disconnectWallet: () => void;
  linkWallet: () => Promise<void>;
  unlinkWallet: (address: string) => Promise<void>;
  refreshBalance: () => Promise<void>;
  loading: boolean;
  error: string | null;
};

const WalletContext = createContext<WalletContextShape | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode; rpcProvider: string }> = ({ children, rpcProvider }) => {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [currentAccount, setCurrentAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [networkName, setNetworkName] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceWei, setBalanceWei] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [linkedWallets, setLinkedWallets] = useState<Array<{ wallet_address: string; is_primary: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = accounts && accounts.length > 0;
  const isCorrectNetwork = chainId === EXPECTED_CHAIN_ID;

  // 1. Fetch linked wallets from backend
  const fetchLinkedWallets = useCallback(async () => {
    try {
      const call = async () => await api.get("/wallet/wallets");
      const { data } = await withAuthRefreshRetry(call);
      setLinkedWallets(data.wallets || []);
    } catch (e) {
      console.error("Failed to fetch linked wallets", e);
      setError(e instanceof Error ? e.message : "Failed to fetch linked wallets");
    }
  }, []);

  // 2. Refresh Balance
  const refreshBalance = useCallback(async () => {
    if (!currentAccount) return;
    setBalanceLoading(true);
    try {
      const wei = await web3.getBalance(currentAccount, rpcProvider);
      setBalanceWei(wei);
      setBalance(web3.formatBalance(wei));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch balance");
    } finally {
      setBalanceLoading(false);
    }
  }, [currentAccount, rpcProvider]);

  // 3. Initialize & Listeners
  useEffect(() => {
    const init = async () => {
      if (await web3.isMetaMaskAvailable()) {
        const accs = await web3.getConnectedAccounts();
        setAccounts(accs);
        setCurrentAccount(accs[0] ?? null);
        try {
          const cid = await web3.getChainId();
          setChainId(cid);
          setNetworkName(await web3.getNetworkName(cid));
        } catch {}
      }
      await fetchLinkedWallets();
    };

    init();

    // Listeners
    const onAcc = (accs: string[]) => {
      setAccounts(accs);
      setCurrentAccount(accs[0] ?? null);
    };
    const onChain = (hex: string) => {
      const n = Number(hex);
      setChainId(n);
      web3.getNetworkName(n).then(setNetworkName);
    };

    web3.onAccountsChanged(onAcc);
    web3.onChainChanged(onChain);

    return () => {
      web3.removeListener("accountsChanged", onAcc);
      web3.removeListener("chainChanged", onChain);
    };
  }, [fetchLinkedWallets]);

  // 4. Connect Wallet
  const connectWallet = async () => {
    setLoading(true);
    setError(null);
    try {
      const accs = await web3.requestAccounts();
      setAccounts(accs);
      setCurrentAccount(accs[0] ?? null);
      const cid = await web3.getChainId();
      setChainId(cid);
      setNetworkName(await web3.getNetworkName(cid));
      await fetchLinkedWallets();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  // 5. Link Wallet (Signature flow)
  const linkWallet = async () => {
    if (!currentAccount) throw new Error("No wallet connected");
    setLoading(true);
    try {
      // Step A: Get nonce
      const { message, nonce } = await api.post("/wallet/nonce", { 
        wallet_address: currentAccount 
      }).then(res => res.data);

      // Step B: Sign message
      const signature = await web3.signMessage(message, currentAccount);

      // Step C: Link via backend
      await api.post("/wallet/link", { 
        wallet_address: currentAccount, 
        nonce, 
        signature 
      });

      await fetchLinkedWallets();
      toast.success("Wallet linked successfully");
    } catch (e: unknown) {
      const msg =
        (e as AxiosError<{ detail?: string }>).response?.data?.detail ||
        (e instanceof Error ? e.message : "Linking failed");
      toast.error(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  // 6. Unlink Wallet
  const unlinkWallet = async (address: string) => {
    setLoading(true);
    try {
      const target = web3.toChecksumAddress(address);
      await api.delete(`/wallet/${encodeURIComponent(target)}`);
      await fetchLinkedWallets();
      toast.success("Wallet unlinked");
    } catch (e: unknown) {
      const msg =
        (e as AxiosError<{ detail?: string }>).response?.data?.detail ||
        (e instanceof Error ? e.message : "Unlink failed");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const disconnectWallet = () => {
    setAccounts([]);
    setCurrentAccount(null);
    setBalance(null);
  };

  const switchNetwork = async (targetChainId: number) => {
    setLoading(true);
    try {
      await web3.switchNetwork(targetChainId);
    } finally {
      setLoading(false);
    }
  };

  const value: WalletContextShape = {
    isConnected,
    accounts,
    currentAccount,
    chainId,
    networkName,
    isCorrectNetwork,
    balance,
    balanceWei,
    balanceLoading,
    linkedWallets,
    connectWallet,
    switchNetwork,
    disconnectWallet,
    linkWallet,
    fetchLinkedWallets,
    unlinkWallet,
    refreshBalance,
    loading,
    error,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}