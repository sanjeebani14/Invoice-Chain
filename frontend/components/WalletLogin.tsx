"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useWallet } from "@/context/WalletContext";
import { isMetaMaskAvailable } from "@/lib/web3";
import { Button } from "@/components/ui/button";
import { Loader2, Link as LinkIcon, Unlink, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { AxiosError } from "axios";

export default function WalletLogin() {
  const { 
    connectWallet, 
    currentAccount, 
    disconnectWallet, 
    linkWallet, 
    linkedWallets, 
    unlinkWallet,
    fetchLinkedWallets 
  } = useWallet();

  const [loading, setLoading] = useState(false);
  const [metaAvailable, setMetaAvailable] = useState<boolean>(false);

  // 1. Check for MetaMask on mount
  useEffect(() => {
    (async () => {
      const ok = await isMetaMaskAvailable();
      setMetaAvailable(!!ok);
    })();
  }, []);

  // 2. Determine if the currently active MetaMask account is already linked to the DB
  const isCurrentlyLinked = useMemo(() => {
    if (!currentAccount || !linkedWallets) return false;
    return linkedWallets.some(
      (w) => w.wallet_address.toLowerCase() === currentAccount.toLowerCase()
    );
  }, [currentAccount, linkedWallets]);

  // 3. Trigger the Connect -> Sign -> Link flow
  const handleConnectAndLink = async () => {
    setLoading(true);
    try {
      // Step A: Connect MetaMask (Browser Level)
      await connectWallet();
      
      // Step B: Signature Challenge (Database Level)
      // linkWallet() in your Context should handle the Nonce + Sign process
      if (linkWallet) {
        await linkWallet();
        toast.success("Wallet linked to your profile");
      }
      
      if (fetchLinkedWallets) await fetchLinkedWallets();
    } catch (e: unknown) {
      const message =
        (e as AxiosError<{ detail?: string }>).response?.data?.detail ||
        (e instanceof Error ? e.message : "Failed to link wallet");
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async () => {
    if (!currentAccount) return;
    setLoading(true);
    try {
      await unlinkWallet(currentAccount);
      toast.success("Wallet unlinked");
      if (fetchLinkedWallets) await fetchLinkedWallets();
    } catch (e: unknown) {
      const message =
        (e as AxiosError<{ detail?: string }>).response?.data?.detail ||
        (e instanceof Error ? e.message : "Failed to unlink");
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!metaAvailable) {
    return (
      <div className="text-sm text-red-500 flex items-center gap-2">
        <Wallet className="h-4 w-4" />
        Install MetaMask to continue
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection Status Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">
            {currentAccount ? 'MetaMask Connected' : 'MetaMask Disconnected'}
          </div>
          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
            {currentAccount ?? 'Connect to manage links'}
          </div>
        </div>
        <div className={`h-2 w-2 rounded-full ${currentAccount ? 'bg-green-500' : 'bg-slate-300'}`} />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2">
        {!currentAccount ? (
          <Button onClick={handleConnectAndLink} disabled={loading} className="w-full">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
            Connect MetaMask
          </Button>
        ) : isCurrentlyLinked ? (
          <div className="space-y-2">
            <div className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded w-fit font-bold uppercase">
              Linked to Profile
            </div>
            <Button onClick={handleUnlink} variant="outline" disabled={loading} className="w-full text-destructive hover:text-destructive">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlink className="mr-2 h-4 w-4" />}
              Unlink This Wallet
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded w-fit font-bold uppercase">
              Connected but Not Linked
            </div>
            <Button onClick={handleConnectAndLink} disabled={loading} className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
              Link to Profile
            </Button>
            <Button onClick={disconnectWallet} variant="ghost" size="sm" className="w-full text-xs">
              Switch Account
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}