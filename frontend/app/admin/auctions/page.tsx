"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closeAuction,
  getAdminAuctionInvoices,
  getInvoiceBids,
  type AdminAuctionInvoice,
  type CloseAuctionResponse,
  type InvoiceBidItem,
} from "@/lib/api";
import { openNotificationSocket } from "@/lib/realtime";
import type { NotificationSocketHandle } from "@/lib/realtime";
import { toast } from "sonner";

function money(value?: number | null) {
  if (value === undefined || value === null) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function bidStatusClasses(status?: string) {
  const normalized = (status || "").toLowerCase();
  if (normalized === "winning") {
    return "bg-emerald-100 text-emerald-700 border border-emerald-200";
  }
  if (normalized === "active") {
    return "bg-blue-100 text-blue-700 border border-blue-200";
  }
  if (normalized === "outbid") {
    return "bg-amber-100 text-amber-700 border border-amber-200";
  }
  if (normalized === "canceled") {
    return "bg-rose-100 text-rose-700 border border-rose-200";
  }
  return "bg-gray-100 text-gray-700 border border-gray-200";
}

export default function AdminAuctionsPage() {
  const [rows, setRows] = useState<AdminAuctionInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bids, setBids] = useState<InvoiceBidItem[]>([]);
  const [closeTarget, setCloseTarget] = useState<AdminAuctionInvoice | null>(null);
  const [closeNotes, setCloseNotes] = useState("Admin close");
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [lastCloseResult, setLastCloseResult] = useState<CloseAuctionResponse | null>(null);
  const realtimeRef = useRef<NotificationSocketHandle | null>(null);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) || null,
    [rows, selectedId],
  );
  const hasActiveBid = useMemo(
    () => bids.some((bid) => bid.status === "active"),
    [bids],
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAdminAuctionInvoices();
      setRows(data.invoices);
      setSelectedId((prev) => {
        if (data.invoices.length === 0) return null;
        if (prev !== null && data.invoices.some((row) => row.id === prev)) {
          return prev;
        }
        return data.invoices[0].id;
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load auction invoices.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBids = useCallback(async (invoiceId: number) => {
    try {
      const data = await getInvoiceBids(invoiceId);
      setBids(data.bids);
    } catch {
      setBids([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setBids([]);
      return;
    }
    void loadBids(selectedId);
  }, [selectedId, loadBids]);

  useEffect(() => {
    const handle = openNotificationSocket((msg) => {
      const payloadInvoiceId = Number(msg.payload?.invoice_id ?? 0);

      if (msg.event === "auction_bid_placed" || msg.event === "auction_bid_retracted") {
        if (selectedId && payloadInvoiceId === selectedId) {
          void loadBids(selectedId);
        }
        void load();
      }

      if (msg.event === "auction_closed") {
        const winnerName =
          (msg.payload?.winner_name as string | undefined) ||
          `Investor ${String(msg.payload?.winner_bidder_id ?? "-")}`;
        toast.success(
          `Auction closed for invoice #${payloadInvoiceId}. Winner: ${winnerName}.`,
        );
        void load();
      }
    });

    realtimeRef.current = handle;
    return () => {
      handle.close();
      realtimeRef.current = null;
    };
  }, [loadBids, load]);

  useEffect(() => {
    const handle = realtimeRef.current;
    if (!handle || !selectedId) return;

    handle.subscribeInvoice(selectedId);
    return () => {
      handle.unsubscribeInvoice(selectedId);
    };
  }, [selectedId]);

  const visibleAuctionIds = useMemo(
    () => rows.slice(0, 20).map((row) => row.id),
    [rows],
  );

  useEffect(() => {
    const handle = realtimeRef.current;
    if (!handle || visibleAuctionIds.length === 0) return;

    for (const invoiceId of visibleAuctionIds) {
      handle.subscribeInvoice(invoiceId);
    }

    return () => {
      for (const invoiceId of visibleAuctionIds) {
        handle.unsubscribeInvoice(invoiceId);
      }
    };
  }, [visibleAuctionIds]);

  useEffect(() => {
    if (!successToast) return;
    const timer = window.setTimeout(() => setSuccessToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [successToast]);

  useEffect(() => {
    if (!errorToast) return;
    const timer = window.setTimeout(() => setErrorToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [errorToast]);

  const handleCloseAuction = async (invoice: AdminAuctionInvoice, notes?: string) => {
    try {
      setWorkingId(invoice.id);
      const result = await closeAuction(invoice.id, { notes });
      setLastCloseResult(result);
      const winnerLabel = result.winner_name || `Investor ${result.winner_bidder_id}`;
      setSuccessToast(
        `Auction closed for invoice #${result.invoice_id}. Winner ${winnerLabel} at $${money(result.winning_bid)}.`,
      );
      setErrorToast(null);
      await load();
      if (selectedId === invoice.id) {
        setSelectedId(null);
      }
      setCloseTarget(null);
      setCloseNotes("Admin close");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : `Failed to close auction for invoice #${invoice.id}.`;
      setError(message);
      setErrorToast(message);
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Auction Management</h1>
          <p className="text-sm text-gray-600">
            View live auction bids and close an auction to select winner.
          </p>
        </div>
        <button
          onClick={load}
          className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {successToast ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {successToast}
        </div>
      ) : null}

      {errorToast ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorToast}
        </div>
      ) : null}

      {lastCloseResult ? (
        <div className="rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-semibold">Last Closed Auction Summary</p>
          <p>
            Invoice #{lastCloseResult.invoice_id} closed with winning bid ${money(lastCloseResult.winning_bid)} by {lastCloseResult.winner_name || `Investor ${lastCloseResult.winner_bidder_id}`}.
          </p>
          {lastCloseResult.winner_email ? (
            <p className="text-xs text-blue-700">Winner email: {lastCloseResult.winner_email}</p>
          ) : null}
          <p className="text-xs text-blue-700">
            Snapshot #{lastCloseResult.repayment_snapshot_id} • Tx {lastCloseResult.simulated_transaction_id}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded border border-gray-200 bg-white">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium text-gray-900">Auction Queue</p>
            <p className="text-xs text-gray-500">{rows.length} auction invoices</p>
          </div>

          <div className="max-h-[70vh] overflow-auto">
            {loading ? (
              <div className="px-4 py-8 text-sm text-gray-500">Loading auctions...</div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-8 text-sm text-gray-500">No auction invoices currently open.</div>
            ) : (
              rows.map((row) => (
                <button
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className={`w-full border-b px-4 py-3 text-left hover:bg-gray-50 ${
                    row.id === selectedId ? "bg-blue-50" : "bg-white"
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">
                    #{row.id} {row.invoice_number || "(No invoice no.)"}
                  </p>
                  <p className="text-xs text-gray-600">
                    {row.client_name || "Unknown buyer"} • Ask ${money(row.ask_price)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">Status: {row.status}</p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded border border-gray-200 bg-white p-4">
          {!selected ? (
            <div className="py-16 text-center text-sm text-gray-500">
              Select an auction invoice to inspect bids.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Invoice #{selected.id}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {selected.client_name || "Unknown buyer"} • Ask ${money(selected.ask_price)}
                  </p>
                  <p className="text-xs text-gray-500">
                    Min increment: ${money(selected.min_bid_increment || 100)}
                  </p>
                </div>
                <button
                  onClick={() => setCloseTarget(selected)}
                  disabled={workingId === selected.id || !hasActiveBid}
                  className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {workingId === selected.id ? "Closing..." : "Close Auction"}
                </button>
              </div>

              {!hasActiveBid ? (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  No active bids to close yet. Wait for at least one active bid.
                </div>
              ) : null}

              <div className="overflow-hidden rounded border border-gray-200">
                <div className="flex flex-wrap items-center gap-2 border-b bg-gray-50 px-4 py-2 text-xs">
                  <span className="font-medium text-gray-600">Legend:</span>
                  <span className="rounded border border-emerald-200 bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                    winning
                  </span>
                  <span className="rounded border border-blue-200 bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
                    active
                  </span>
                  <span className="rounded border border-amber-200 bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
                    outbid
                  </span>
                  <span className="rounded border border-rose-200 bg-rose-100 px-2 py-0.5 font-medium text-rose-700">
                    canceled
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-4 py-3 font-medium">Bidder</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bids.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                          No bids yet for this auction.
                        </td>
                      </tr>
                    ) : (
                      bids.map((bid) => (
                        <tr key={bid.id} className="border-t">
                          <td className="px-4 py-3">Investor {bid.bidder_id}</td>
                          <td className="px-4 py-3 font-medium">${money(bid.amount)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded px-2 py-1 text-xs font-medium ${bidStatusClasses(bid.status)}`}>
                                {bid.status}
                              </span>
                              {bid.status === "winning" ? (
                                <span className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">
                                  Winner
                                </span>
                              ) : null}
                              {bid.status === "active" ? (
                                <span className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                                  Leading
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {bid.created_at
                              ? new Date(bid.created_at).toLocaleString()
                              : "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {closeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Confirm Auction Close</h3>
            <p className="mt-1 text-sm text-gray-600">
              You are about to close auction for invoice #{closeTarget.id}. This will select the highest valid bid and mark the invoice as funded.
            </p>

            <div className="mt-4 space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="close-notes">
                Close Notes (optional)
              </label>
              <textarea
                id="close-notes"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                rows={3}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none ring-blue-400 focus:ring"
                placeholder="Reason for closing auction"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setCloseTarget(null);
                  setCloseNotes("Admin close");
                }}
                className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleCloseAuction(closeTarget, closeNotes.trim() || undefined)}
                disabled={workingId === closeTarget.id}
                className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {workingId === closeTarget.id ? "Closing..." : "Confirm Close"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
