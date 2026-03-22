"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  cancelMarketplaceListing,
  getMarketplaceListings,
  updateMarketplaceListing,
  type MarketplaceListingItem,
} from "@/lib/api";

type ListingStatusFilter = "all" | "active" | "paused" | "sold" | "canceled";

function formatMoney(value?: number | null): string {
  if (value === undefined || value === null) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function AdminListingsPage() {
  const [rows, setRows] = useState<MarketplaceListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ListingStatusFilter>("all");
  const [workingListingId, setWorkingListingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const payload = await getMarketplaceListings({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 200,
      });
      setRows(payload.items);
    } catch {
      setError("Failed to load marketplace listings.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const active = rows.filter((row) => row.status === "active").length;
    const paused = rows.filter((row) => row.status === "paused").length;
    const sold = rows.filter((row) => row.status === "sold").length;
    return { active, paused, sold, total: rows.length };
  }, [rows]);

  const setStatus = async (
    listing: MarketplaceListingItem,
    nextStatus: "active" | "paused" | "sold" | "canceled",
  ) => {
    try {
      setWorkingListingId(listing.id);
      await updateMarketplaceListing(listing.id, { status: nextStatus });
      toast.success(`Listing #${listing.id} updated to ${nextStatus}.`);
      await load();
    } catch {
      toast.error(`Unable to update listing #${listing.id}.`);
    } finally {
      setWorkingListingId(null);
    }
  };

  const editPrice = async (listing: MarketplaceListingItem) => {
    const current = listing.ask_price ?? undefined;
    const input = window.prompt(
      `Set ask price for listing #${listing.id}:`,
      current !== undefined ? String(current) : "",
    );
    if (input === null) return;

    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Ask price must be a positive number.");
      return;
    }

    try {
      setWorkingListingId(listing.id);
      await updateMarketplaceListing(listing.id, { ask_price: parsed });
      toast.success(`Ask price updated for listing #${listing.id}.`);
      await load();
    } catch {
      toast.error(`Unable to update ask price for listing #${listing.id}.`);
    } finally {
      setWorkingListingId(null);
    }
  };

  const editShares = async (listing: MarketplaceListingItem) => {
    const input = window.prompt(
      `Set available shares for listing #${listing.id}:`,
      listing.available_shares !== undefined && listing.available_shares !== null
        ? String(listing.available_shares)
        : "",
    );
    if (input === null) return;

    const parsed = Number(input);
    if (!Number.isInteger(parsed) || parsed < 0) {
      toast.error("Available shares must be a non-negative integer.");
      return;
    }

    try {
      setWorkingListingId(listing.id);
      await updateMarketplaceListing(listing.id, { available_shares: parsed });
      toast.success(`Shares updated for listing #${listing.id}.`);
      await load();
    } catch {
      toast.error(`Unable to update shares for listing #${listing.id}.`);
    } finally {
      setWorkingListingId(null);
    }
  };

  const cancelListing = async (listing: MarketplaceListingItem) => {
    const confirmed = window.confirm(`Cancel listing #${listing.id}? This will remove it from active marketplace view.`);
    if (!confirmed) return;

    try {
      setWorkingListingId(listing.id);
      await cancelMarketplaceListing(listing.id);
      toast.success(`Listing #${listing.id} canceled.`);
      await load();
    } catch {
      toast.error(`Unable to cancel listing #${listing.id}.`);
    } finally {
      setWorkingListingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Marketplace Listings</h1>
          <p className="text-sm text-gray-600">
            Manage listing status, pricing, and share inventory across invoice market inventory.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ListingStatusFilter)}
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="sold">Sold</option>
            <option value="canceled">Canceled</option>
          </select>
          <button
            onClick={load}
            className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{totals.total}</p>
        </div>
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Active</p>
          <p className="mt-1 text-xl font-semibold text-emerald-900">{totals.active}</p>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs uppercase tracking-wide text-amber-700">Paused</p>
          <p className="mt-1 text-xl font-semibold text-amber-900">{totals.paused}</p>
        </div>
        <div className="rounded border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs uppercase tracking-wide text-blue-700">Sold</p>
          <p className="mt-1 text-xl font-semibold text-blue-900">{totals.sold}</p>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">Listing</th>
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Ask Price</th>
              <th className="px-4 py-3 font-medium">Shares</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Loading listings...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No listings found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3 font-medium text-gray-900">#{row.id}</td>
                  <td className="px-4 py-3 text-gray-700">#{row.invoice_id}</td>
                  <td className="px-4 py-3 text-gray-700">{row.listing_type}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {row.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{formatMoney(row.ask_price)}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.available_shares ?? "-"}
                    {row.total_shares ? ` / ${row.total_shares}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        disabled={workingListingId === row.id}
                        onClick={() => setStatus(row, row.status === "paused" ? "active" : "paused")}
                        className="rounded border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                      >
                        {row.status === "paused" ? "Activate" : "Pause"}
                      </button>
                      <button
                        disabled={workingListingId === row.id}
                        onClick={() => editPrice(row)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                      >
                        Edit price
                      </button>
                      {row.listing_type === "fractional" && (
                        <button
                          disabled={workingListingId === row.id}
                          onClick={() => editShares(row)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                        >
                          Edit shares
                        </button>
                      )}
                      <button
                        disabled={workingListingId === row.id || row.status === "canceled"}
                        onClick={() => cancelListing(row)}
                        className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
