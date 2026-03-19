"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getSettlementTracker,
  settleInvoice,
  type AdminSettlementItem,
} from "@/lib/api";

function money(value?: number | null) {
  if (value === undefined || value === null) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function SettlementTrackerPage() {
  const [rows, setRows] = useState<AdminSettlementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSettlementTracker({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 200,
      });
      setRows(data.items);
    } catch {
      setError("Failed to load settlement tracker.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const overdueCount = useMemo(
    () =>
      rows.filter((row) => row.is_overdue && row.status !== "settled").length,
    [rows],
  );

  const dueTodayCount = useMemo(
    () =>
      rows.filter((row) => row.days_to_due === 0 && row.status !== "settled")
        .length,
    [rows],
  );

  const triggerSettle = async (row: AdminSettlementItem) => {
    const amountInput = window.prompt(
      `Repayment amount for invoice #${row.id} (leave blank to use invoice amount):`,
      row.amount ? String(row.amount) : "",
    );
    if (amountInput === null) return;

    const notes =
      window.prompt(
        "Settlement notes (optional):",
        "Off-chain payment confirmed",
      ) || undefined;

    let repaymentAmount: number | undefined;
    if (amountInput.trim()) {
      const parsed = Number(amountInput);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError("Repayment amount must be a positive number.");
        return;
      }
      repaymentAmount = parsed;
    }

    try {
      setWorkingId(row.id);
      await settleInvoice(row.id, {
        repayment_amount: repaymentAmount,
        notes,
      });
      await load();
    } catch {
      setError(`Failed to settle invoice #${row.id}.`);
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Settlement Tracker</h1>
          <p className="text-sm text-gray-600">
            Monitor maturity countdown, overdue repayments, and trigger
            settlement.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="funded">Funded</option>
            <option value="active">Active</option>
            <option value="settled">Settled</option>
          </select>
          <button
            onClick={load}
            className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Total tracked
          </p>
          <p className="mt-1 text-xl font-semibold text-gray-900">
            {rows.length}
          </p>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs uppercase tracking-wide text-amber-700">
            Overdue
          </p>
          <p className="mt-1 text-xl font-semibold text-amber-900">
            {overdueCount}
          </p>
        </div>
        <div className="rounded border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs uppercase tracking-wide text-blue-700">
            Due today
          </p>
          <p className="mt-1 text-xl font-semibold text-blue-900">
            {dueTodayCount}
          </p>
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
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Seller</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Due</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Loading settlement rows...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No settlement rows found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">
                      #{row.id} {row.invoice_number || ""}
                    </p>
                    <p className="text-xs text-gray-500">
                      {row.client_name || "Unknown buyer"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.seller_name || row.seller_id || "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {money(row.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-700">{row.due_date || "-"}</p>
                    <p
                      className={`text-xs font-medium ${
                        row.is_overdue && row.status !== "settled"
                          ? "text-red-700"
                          : "text-gray-500"
                      }`}
                    >
                      {row.countdown_label}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        row.status === "settled"
                          ? "bg-green-100 text-green-700"
                          : row.is_overdue
                            ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {row.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      disabled={!row.can_settle || workingId === row.id}
                      onClick={() => triggerSettle(row)}
                      className="rounded bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {workingId === row.id
                        ? "Settling..."
                        : row.can_settle
                          ? "Settle"
                          : "Settled"}
                    </button>
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
