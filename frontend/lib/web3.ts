/* Web3 utilities for MetaMask integration */
import { ethers } from "ethers";

// Errors
export class MetaMaskNotInstalledError extends Error {}
export class MetaMaskRejectedError extends Error {}
export class InvalidNetworkError extends Error {}
export class InvalidAddressError extends Error {}

type Eip1193Listener = (...args: unknown[]) => void;
type AccountsChangedHandler = (accounts: string[]) => void;
type ChainChangedHandler = (chainId: string) => void;
type WalletEventCallback =
  | AccountsChangedHandler
  | ChainChangedHandler
  | Eip1193Listener;

declare global {
  interface EthereumProvider {
    request(args: {
      method: string;
      params?: unknown[] | object;
    }): Promise<unknown>;
    on(event: string, callback: Eip1193Listener): void;
    removeListener(event: string, callback: Eip1193Listener): void;
  }
  interface Window {
    ethereum?: EthereumProvider;
  }
}

function getEthereumOrThrow(): EthereumProvider {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new MetaMaskNotInstalledError("MetaMask not installed");
  }
  return window.ethereum;
}

export async function isMetaMaskAvailable(): Promise<boolean> {
  return typeof window !== "undefined" && !!window.ethereum;
}

export async function requestAccounts(): Promise<string[]> {
  if (!(await isMetaMaskAvailable()))
    throw new MetaMaskNotInstalledError("MetaMask not installed");
  try {
    const ethereum = getEthereumOrThrow();
    const result = await ethereum.request({ method: "eth_requestAccounts" });
    return Array.isArray(result) ? (result as string[]) : [];
  } catch (err: unknown) {
    throw new MetaMaskRejectedError(
      err instanceof Error ? err.message : "User rejected request",
    );
  }
}

export async function getConnectedAccounts(): Promise<string[]> {
  if (!(await isMetaMaskAvailable())) return [];
  const ethereum = getEthereumOrThrow();
  const result = await ethereum.request({ method: "eth_accounts" });
  return Array.isArray(result) ? (result as string[]) : [];
}

export async function getChainId(): Promise<number> {
  if (!(await isMetaMaskAvailable())) throw new MetaMaskNotInstalledError();
  const ethereum = getEthereumOrThrow();
  const result = await ethereum.request({ method: "eth_chainId" });
  const hex = String(result);
  return Number(hex);
}

export async function getNetworkName(chainId: number): Promise<string> {
  const map: Record<number, string> = {
    80001: "Polygon Mumbai",
    137: "Polygon Mainnet",
    1: "Ethereum Mainnet",
    84532: "Base Sepolia",
    8453: "Base Mainnet",
  };
  return map[chainId] || `Chain ${chainId}`;
}

export async function switchNetwork(chainId: number): Promise<boolean> {
  if (!(await isMetaMaskAvailable())) throw new MetaMaskNotInstalledError();
  const hex = "0x" + chainId.toString(16);
  try {
    const ethereum = getEthereumOrThrow();
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
    return true;
  } catch (err: unknown) {
    // error code 4001 = user rejected
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: number }).code === 4001
    ) {
      throw new MetaMaskRejectedError(
        err instanceof Error ? err.message : "User rejected request",
      );
    }
    throw err;
  }
}

export async function getBalance(
  address: string,
  providerUrl: string,
): Promise<string> {
  if (!/^(0x)?[0-9a-fA-F]{40}$/.test(address))
    throw new InvalidAddressError("Invalid address format");
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getBalance",
    params: [address, "latest"],
  };
  const res = await fetch(providerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("RPC request failed");
  const json = await res.json();
  return json.result as string;
}

export function convertWeiToMatic(weiString: string): string {
  try {
    const wei = BigInt(weiString);
    const ether = Number(wei) / 1e18; // safe for display only
    return ether.toString();
  } catch {
    // fallback using ethers
    try {
      return ethers.formatEther(weiString);
    } catch {
      return "0";
    }
  }
}

export function formatBalance(balanceWei: string): string {
  const m = convertWeiToMatic(balanceWei);
  const num = Number(m);
  const decimals = num < 0.01 ? 4 : num < 1 ? 3 : 2;
  return `${num.toFixed(decimals)} MATIC`;
}

export async function signMessage(
  message: string,
  account?: string,
): Promise<string> {
  if (!(await isMetaMaskAvailable())) throw new MetaMaskNotInstalledError();
  const accounts = account ? [account] : await getConnectedAccounts();
  if (!accounts || accounts.length === 0)
    throw new MetaMaskRejectedError("No accounts connected");
  const from = accounts[0];
  try {
    const ethereum = getEthereumOrThrow();
    const signature = await ethereum.request({
      method: "personal_sign",
      params: [message, from],
    });
    return String(signature);
  } catch (err: unknown) {
    throw new MetaMaskRejectedError(
      err instanceof Error ? err.message : "User rejected signature request",
    );
  }
}

export function onAccountsChanged(callback: AccountsChangedHandler): void {
  if (typeof window === "undefined" || !window.ethereum) return;
  window.ethereum.on("accountsChanged", callback as Eip1193Listener);
}

export function onChainChanged(callback: ChainChangedHandler): void {
  if (typeof window === "undefined" || !window.ethereum) return;
  window.ethereum.on("chainChanged", callback as Eip1193Listener);
}

export function removeListener(
  eventName: "accountsChanged",
  callback: AccountsChangedHandler,
): void;
export function removeListener(
  eventName: "chainChanged",
  callback: ChainChangedHandler,
): void;
export function removeListener(
  eventName: string,
  callback: Eip1193Listener,
): void;
export function removeListener(
  eventName: string,
  callback: WalletEventCallback,
): void {
  if (typeof window === "undefined" || !window.ethereum) return;
  window.ethereum.removeListener(eventName, callback as Eip1193Listener);
}

export function isValidAddress(address: string): boolean {
  return /^(0x)?[0-9a-fA-F]{40}$/.test(address);
}

export function toChecksumAddress(address: string): string {
  try {
    return ethers.getAddress(address);
  } catch {
    throw new InvalidAddressError("Invalid address for checksum conversion");
  }
}

export default {
  isMetaMaskAvailable,
  requestAccounts,
  getConnectedAccounts,
  getChainId,
  getNetworkName,
  switchNetwork,
  getBalance,
  convertWeiToMatic,
  formatBalance,
  signMessage,
  onAccountsChanged,
  onChainChanged,
  removeListener,
  isValidAddress,
  toChecksumAddress,
};
