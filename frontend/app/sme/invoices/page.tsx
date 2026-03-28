"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { RepaymentSidebar } from "@/components/sme/RepaymentSidebar";
import { EXPECTED_CHAIN_ID } from "@/lib/config";
import { getSellerInvoices, repayInvoice, type SellerInvoiceItem } from "@/lib/api";
import { useWallet } from "@/hooks/useWallet";
import { getChainId, getConnectedAccounts } from "@/lib/web3";

function formatMoney(value?: number | null, currency = "INR") {
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function shortAddress(value?: string | null) {
  if (!value) return "Not connected";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function statusBadge(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "funded" || normalized === "active") {
    return "bg-blue-100 text-blue-800";
  }
  if (normalized === "repayment_processing") {
    return "bg-amber-100 text-amber-800";
  }
  if (normalized === "settled") {
    return "bg-green-100 text-green-800";
  }
  if (normalized === "approved") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (normalized === "pending_review") {
    return "bg-yellow-100 text-yellow-800";
  }
  if (normalized === "flagged") {
    return "bg-red-100 text-red-800";
  }
  return "bg-gray-100 text-gray-800";
}

export default function SmeInvoicesPage() {
  const [invoices, setInvoices] = useState<SellerInvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<SellerInvoiceItem | null>(null);

  const {
    currentAccount,
    isConnected,
    networkName,
    connectWallet,
    switchNetwork,
  } = useWallet();

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getSellerInvoices({ limit: 200 });
      setInvoices(data.invoices || []);
    } catch (err) {
      console.error("Failed to fetch invoices:", err);
      toast.error("Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const handleRepaymentSubmit = useCallback(
    async (
      invoice: SellerInvoiceItem,
      payload: { repayment_amount: number; notes?: string },
    ) => {
      let walletAddress = currentAccount;
      if (!walletAddress) {
        await connectWallet();
        const accounts = await getConnectedAccounts();
        walletAddress = accounts[0] ?? null;
      }

      if (!walletAddress) {
        throw new Error("Connect your wallet before initiating repayment.");
      }

      const chainId = await getChainId();
      if (chainId !== EXPECTED_CHAIN_ID) {
        await switchNetwork(EXPECTED_CHAIN_ID);
      }

      await repayInvoice(invoice.id, {
        repayment_amount: payload.repayment_amount,
        wallet_address: walletAddress,
        notes: payload.notes,
      });

      toast.success(
        `Repayment initiated for invoice #${invoice.id}. Awaiting admin confirmation.`,
      );
      await loadInvoices();
    },
    [
      connectWallet,
      currentAccount,
      loadInvoices,
      switchNetwork,
    ],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-8 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Track invoice funding and repay investors with the same guided transaction flow used in checkout.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isConnected && currentAccount ? (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <div>Wallet: {shortAddress(currentAccount)}</div>
              <div>Network: {networkName || "Connected"}</div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => void connectWallet()}>
              Connect Wallet
            </Button>
          )}
          <Button asChild>
            <Link href="/sme/upload">
              <Plus className="mr-2 h-4 w-4" /> New Invoice
            </Link>
          </Button>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-20 text-center">
          <p className="text-muted-foreground">
            No invoices found. Start by uploading one.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-semibold">Invoice #</th>
                <th className="px-4 py-3 text-left font-semibold">Client</th>
                <th className="px-4 py-3 text-left font-semibold">Amount</th>
                <th className="px-4 py-3 text-left font-semibold">Due</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Escrow</th>
                <th className="px-4 py-3 text-left font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const canRepay = invoice.status === "funded" || invoice.status === "active";
                const awaitingConfirmation = invoice.status === "repayment_processing";
                const isSettled = invoice.status === "settled";

                return (
                  <tr key={invoice.id} className="border-b transition hover:bg-muted/30">
                    <td className="px-4 py-3">{invoice.invoice_number || "-"}</td>
                    <td className="px-4 py-3">{invoice.client_name || "-"}</td>
                    <td className="px-4 py-3">
                      {formatMoney(invoice.amount, invoice.currency || "INR")}
                    </td>
                    <td className="px-4 py-3">{invoice.due_date || "-"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded px-2 py-1 text-xs font-medium ${statusBadge(
                          invoice.status,
                        )}`}
                      >
                        {invoice.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div>{(invoice.escrow_status || "not_applicable").replace(/_/g, " ")}</div>
                      <div>{invoice.escrow_reference || "-"}</div>
                    </td>
                    <td className="px-4 py-3">
                      {canRepay ? (
                        <Button size="sm" onClick={() => setSelectedInvoice(invoice)}>
                          Repay Investor
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled>
                          {isSettled
                            ? "Settled"
                            : awaitingConfirmation
                              ? "Awaiting Admin"
                              : "Not Available"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RepaymentSidebar
        key={selectedInvoice?.id ?? "repayment-sidebar"}
        open={!!selectedInvoice}
        invoice={selectedInvoice}
        walletLabel={shortAddress(currentAccount)}
        networkLabel={networkName || "Not connected"}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedInvoice(null);
          }
        }}
        onConfirmRepayment={handleRepaymentSubmit}
      />
    </div>
  );
}
