"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { toast } from "sonner";
import { EXPECTED_CHAIN_ID } from "@/lib/config";
import * as web3 from "@/lib/web3";

// Import our master engine and wallet services
import {
  api,
  getWalletNonce,
  linkWallet as linkWalletService,
  unlinkWallet as unlinkWalletService,
} from "@/lib/api";

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

export const WalletProvider: React.FC<{
  children: React.ReactNode;
  rpcProvider: string;
}> = ({ children, rpcProvider }) => {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [currentAccount, setCurrentAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [networkName, setNetworkName] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceWei, setBalanceWei] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [linkedWallets, setLinkedWallets] = useState<
    Array<{ wallet_address: string; is_primary: boolean }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = accounts.length > 0;
  const isCorrectNetwork = chainId === EXPECTED_CHAIN_ID;

  // 1. Fetch linked wallets
  const fetchLinkedWallets = useCallback(async () => {
    try {
      // Using base api since /wallet/wallets might not be in our specialized walletApi yet
      const { data } = await api.get("/wallet/wallets");
      setLinkedWallets(data.wallets || []);
    } catch (e) {
      console.error("Wallet sync failed", e);
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
    } catch (e: any) {
      setError(e.message || "Failed to fetch balance");
    } finally {
      setBalanceLoading(false);
    }
  }, [currentAccount, rpcProvider]);

  // 3. Initialize & Listeners
  // 3. Initialize & Listeners
  useEffect(() => {
    const init = async () => {
      // A. Check for MetaMask state (Browser-only, no API call)
      if (await web3.isMetaMaskAvailable()) {
        const accs = await web3.getConnectedAccounts();
        setAccounts(accs);
        setCurrentAccount(accs[0] ?? null);
        try {
          const cid = await web3.getChainId();
          setChainId(cid);
          const name = await web3.getNetworkName(cid);
          setNetworkName(name);
        } catch {}
      }

      // B. THE FIX: Only fetch linked wallets if we have a session hint
      // This stops the 401 -> Interceptor -> Redirect loop for guests
      const hasSessionHint = sessionStorage.getItem("is_logged_in") === "true";
      if (hasSessionHint) {
        await fetchLinkedWallets();
      }
    };

    init();

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
      web3.removeWalletListener("accountsChanged", onAcc);
      web3.removeWalletListener("chainChanged", onChain);
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

      const hasSessionHint = sessionStorage.getItem("is_logged_in") === "true";
      if (hasSessionHint) {
        await fetchLinkedWallets();
      }
    } catch (e: any) {
      toast.error(e.message || "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  // 5. Link Wallet (Signature flow)
  const linkWallet = async () => {
    if (!currentAccount) throw new Error("No wallet connected");
    setLoading(true);
    try {
      // Step A: Get nonce/message via our service
      const { nonce } = await getWalletNonce(currentAccount);

      // Use the backend's message if it exists, otherwise fallback to our default
      const signTarget = `Sign this message to link your wallet: ${nonce}`;

      // Step B: Sign the message
      const signature = await web3.signMessage(signTarget, currentAccount);

      // Step C: Link via backend service
      await linkWalletService({
        wallet_address: currentAccount,
        nonce,
        signature,
      });

      await fetchLinkedWallets();
      toast.success("Wallet linked successfully");
    } catch (e: any) {
      const msg = e.response?.data?.detail || e.message || "Linking failed";
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
      await unlinkWalletService(target);
      await fetchLinkedWallets();
      toast.success("Wallet unlinked");
    } catch (e: any) {
      toast.error(e.response?.data?.detail || "Unlink failed");
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

  const value = {
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

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
};

export const useWallet = () => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
};
