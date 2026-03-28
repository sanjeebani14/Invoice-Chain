/* Web3 utilities for MetaMask integration */
import { ethers } from "ethers";

// --- CUSTOM ERRORS ---
export class MetaMaskNotInstalledError extends Error { name = "MetaMaskNotInstalledError"; }
export class MetaMaskRejectedError extends Error { name = "MetaMaskRejectedError"; }
export class InvalidNetworkError extends Error { name = "InvalidNetworkError"; }
export class InvalidAddressError extends Error { name = "InvalidAddressError"; }

// --- TYPES ---
type AccountsChangedHandler = (accounts: string[]) => void;
type ChainChangedHandler = (chainId: string) => void;
type WalletEvent = "accountsChanged" | "chainChanged";

type AddEthereumChainParameter = {
  chainId: string;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
};

type EthereumRequestArgs = {
  method: string;
  params?: unknown[] | object;
};

type EthereumProvider = {
  isMetaMask?: boolean;
  request: (args: EthereumRequestArgs) => Promise<unknown>;
  on: (event: WalletEvent, callback: (...args: unknown[]) => void) => void;
  removeListener: (
    event: WalletEvent,
    callback: (...args: unknown[]) => void,
  ) => void;
};

type ProviderRpcError = Error & {
  code?: number;
  data?: unknown;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

/**
 * PROVIDER HELPERS
 */

const getEthereum = () => {
  if (typeof window !== "undefined" && window.ethereum) return window.ethereum;
  return null;
};

const asProviderError = (error: unknown): ProviderRpcError => {
  if (error instanceof Error) {
    return error as ProviderRpcError;
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      message?: unknown;
      reason?: unknown;
      code?: unknown;
      data?: unknown;
    };

    const rawMessage =
      typeof candidate.message === "string"
        ? candidate.message
        : typeof candidate.reason === "string"
          ? candidate.reason
          : typeof candidate.data === "object" &&
              candidate.data !== null &&
              "message" in candidate.data &&
              typeof (candidate.data as { message?: unknown }).message === "string"
            ? ((candidate.data as { message?: string }).message ?? "")
            : "";

    const normalized = new Error(
      rawMessage || "Wallet request failed",
    ) as ProviderRpcError;

    if (typeof candidate.code === "number") {
      normalized.code = candidate.code;
    }
    if (candidate.data !== undefined) {
      normalized.data = candidate.data;
    }

    return normalized;
  }

  if (typeof error === "string" && error.trim()) {
    return new Error(error) as ProviderRpcError;
  }

  return new Error("Wallet request failed") as ProviderRpcError;
};

const CHAIN_CONFIG: Record<number, AddEthereumChainParameter> = {
  84532: {
    chainId: "0x14a34",
    chainName: "Base Sepolia",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: ["https://sepolia.base.org"],
    blockExplorerUrls: ["https://sepolia.basescan.org"],
  },
  8453: {
    chainId: "0x2105",
    chainName: "Base Mainnet",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
  },
};

export const isMetaMaskAvailable = async (): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  
  // Give the browser a millisecond to inject the provider
  return !!(window.ethereum && window.ethereum.isMetaMask);
};

export const requestAccounts = async (): Promise<string[]> => {
  const eth = getEthereum();
  if (!eth) throw new MetaMaskNotInstalledError();
  try {
    return (await eth.request({ method: "eth_requestAccounts" })) as string[];
  } catch (error: unknown) {
    const err = asProviderError(error);
    throw new MetaMaskRejectedError(err.message || "User rejected request");
  }
};

export const getConnectedAccounts = async (): Promise<string[]> => {
  const eth = getEthereum();
  if (!eth) return [];
  return (await eth.request({ method: "eth_accounts" })) as string[];
};

export const getChainId = async (): Promise<number> => {
  const eth = getEthereum();
  if (!eth) throw new MetaMaskNotInstalledError();
  const hex = (await eth.request({ method: "eth_chainId" })) as string;
  return Number(hex);
};

/**
 * NETWORK & SIGNING
 */

export const switchNetwork = async (chainId: number): Promise<boolean> => {
  const eth = getEthereum();
  if (!eth) throw new MetaMaskNotInstalledError();
  const hex = "0x" + chainId.toString(16);
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
    return true;
  } catch (error: unknown) {
    const err = asProviderError(error);
    if (err.code === 4902) {
      const chainConfig = CHAIN_CONFIG[chainId];
      if (!chainConfig) {
        throw new InvalidNetworkError(`Unsupported chain ID: ${chainId}`);
      }

      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [chainConfig],
        });
        return true;
      } catch (addError: unknown) {
        const addErr = asProviderError(addError);
        if (addErr.code === 4001) {
          throw new MetaMaskRejectedError(addErr.message);
        }
        throw addErr;
      }
    }

    // 4001 is the standard code for user rejection
    if (err.code === 4001) throw new MetaMaskRejectedError(err.message);
    throw err;
  }
};

export const signMessage = async (message: string, account?: string): Promise<string> => {
  const eth = getEthereum();
  if (!eth) throw new MetaMaskNotInstalledError();
  
  const accounts = account ? [account] : await getConnectedAccounts();
  if (!accounts?.length) throw new MetaMaskRejectedError("No accounts connected");
  
  try {
    const signature = await eth.request({
      method: "personal_sign",
      params: [message, accounts[0]],
    });
    return String(signature);
  } catch (error: unknown) {
    const err = asProviderError(error);
    throw new MetaMaskRejectedError(err.message || "User rejected signature request");
  }
};

/**
 * FORMATTING & VALIDATION
 */

export const isValidAddress = (address: string): boolean => {
  return /^(0x)?[0-9a-fA-F]{40}$/.test(address);
};

export const formatBalance = (balanceWei: string): string => {
  try {
    const ethValue = ethers.formatEther(balanceWei);
    const num = Number(ethValue);
    const decimals = num < 0.01 ? 4 : num < 1 ? 3 : 2;
    return `${num.toFixed(decimals)} MATIC`;
  } catch {
    return "0 MATIC";
  }
};

/**
 * EVENT LISTENERS
 */

export const onAccountsChanged = (callback: AccountsChangedHandler) => {
  getEthereum()?.on("accountsChanged", callback);
};

export const onChainChanged = (callback: ChainChangedHandler) => {
  getEthereum()?.on("chainChanged", callback);
};

export const removeWalletListener = (
  event: WalletEvent,
  callback: (...args: unknown[]) => void,
) => {
  getEthereum()?.removeListener(event, callback);
};

/**
 * NETWORK & DATA FETCHING
 */

export const getNetworkName = async (chainId: number): Promise<string> => {
  const map: Record<number, string> = {
    80001: "Polygon Mumbai",
    137: "Polygon Mainnet",
    1: "Ethereum Mainnet",
    84532: "Base Sepolia",
    8453: "Base Mainnet",
  };
  return map[chainId] || `Chain ${chainId}`;
};

export const getBalance = async (
  address: string,
  providerUrl: string
): Promise<string> => {
  if (!isValidAddress(address)) throw new InvalidAddressError();

  // We use a clean fetch call to the RPC to avoid needing a heavy Ethers provider instance
  const res = await fetch(providerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [address, "latest"],
    }),
  });

  if (!res.ok) throw new Error("RPC Balance request failed");
  const json = await res.json();
  
  if (json.error) throw new Error(json.error.message || "RPC Error");
  
  return json.result; // Returns the hex string of the balance in Wei
};


export const toChecksumAddress = (address: string): string => {
  try {
    return ethers.getAddress(address);
  } catch {
    throw new InvalidAddressError("Invalid address format for checksum conversion");
  }
};
