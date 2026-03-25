"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useWallet } from "@/context/WalletContext";
import { isMetaMaskAvailable } from "@/lib/web3";
import { Button } from "@/components/ui/button";
import { Loader2, Link as LinkIcon, Unlink, Wallet, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function WalletLogin() {
  const { 
    connectWallet, 
    currentAccount, 
    disconnectWallet, 
    linkWallet, 
    linkedWallets, 
    unlinkWallet 
  } = useWallet();

  const [loading, setLoading] = useState(false);
  const [metaAvailable, setMetaAvailable] = useState<boolean>(true);

  useEffect(() => {
    isMetaMaskAvailable().then(ok => setMetaAvailable(!!ok));
  }, []);

  const isCurrentlyLinked = useMemo(() => {
    if (!currentAccount || !linkedWallets) return false;
    return linkedWallets.some(
      (w) => w.wallet_address.toLowerCase() === currentAccount.toLowerCase()
    );
  }, [currentAccount, linkedWallets]);

  const handleConnectAndLink = async () => {
    setLoading(true);
    try {
      // Step A: Browser-level connection
      if (!currentAccount) {
        await connectWallet();
      }
      
      // Step B: Backend-level linking (Nonce -> Sign -> Verify)
      // Note: Success toast is handled inside the Context
      await linkWallet();
      
    } catch (e: any) {
      // Only show error if it wasn't a user rejection (prevents annoying error toasts)
      if (e?.code !== 4001) {
        const message = e.response?.data?.detail || e.message || "Failed to link wallet";
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async () => {
    if (!currentAccount) return;
    setLoading(true);
    try {
      await unlinkWallet(currentAccount);
    } catch (e: any) {
      toast.error(e.response?.data?.detail || "Unlink failed");
    } finally {
      setLoading(false);
    }
  };

  if (!metaAvailable) {
    return (
      <Button variant="outline" className="w-full text-amber-600 border-amber-200 bg-amber-50" asChild>
        <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
          <ExternalLink className="mr-2 h-4 w-4" />
          Install MetaMask
        </a>
      </Button>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-bold leading-none">
            {currentAccount ? 'MetaMask Active' : 'Wallet Status'}
          </p>
          <p className="text-[11px] font-mono text-muted-foreground truncate max-w-[180px]">
            {currentAccount ?? 'No wallet detected'}
          </p>
        </div>
        <div className={`h-2.5 w-2.5 rounded-full animate-pulse ${currentAccount ? 'bg-green-500' : 'bg-slate-300'}`} />
      </div>

      <div className="flex flex-col gap-2">
        {!currentAccount ? (
          <Button onClick={handleConnectAndLink} disabled={loading} className="w-full font-bold">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
            Connect Wallet
          </Button>
        ) : isCurrentlyLinked ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-green-50 border border-green-100 rounded-lg">
              <span className="text-[10px] text-green-700 font-black uppercase tracking-widest">
                Verified Link
              </span>
            </div>
            <Button onClick={handleUnlink} variant="ghost" disabled={loading} className="w-full text-xs text-muted-foreground hover:text-destructive">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlink className="mr-2 h-4 w-4" />}
              Remove Link
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="py-2 px-3 bg-amber-50 border border-amber-100 rounded-lg text-center">
              <p className="text-[10px] text-amber-700 font-bold uppercase">Signature Required</p>
              <p className="text-[9px] text-amber-600">Link this wallet to start bidding.</p>
            </div>
            <Button onClick={handleConnectAndLink} disabled={loading} className="w-full font-bold">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
              Verify & Link
            </Button>
            <Button onClick={disconnectWallet} variant="ghost" size="sm" className="w-full text-[10px] uppercase tracking-tighter opacity-50">
              Switch Account
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}