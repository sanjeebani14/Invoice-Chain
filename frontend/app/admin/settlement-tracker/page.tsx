"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  confirmSettlement,
  getSettlementTracker,
  getSettlementHistory,
  settleInvoice,
  type AdminSettlementItem,
  type SettlementHistoryItem,
} from "@/lib/api";
import { openNotificationSocket } from "@/lib/realtime";
import type { NotificationSocketHandle } from "@/lib/realtime";
import { toast } from "sonner";

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
  const [historyRows, setHistoryRows] = useState<SettlementHistoryItem[]>([]);
  const [confirmingInvoiceId, setConfirmingInvoiceId] = useState<number | null>(null);
  const realtimeRef = useRef<NotificationSocketHandle | null>(null);

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

  const loadHistory = useCallback(async () => {
    try {
      const data = await getSettlementHistory({ limit: 25 });
      setHistoryRows(data.items);
    } catch {
      setHistoryRows([]);
    }
  }, []);

  useEffect(() => {
    load();
    loadHistory();
  }, [load, loadHistory]);

  useEffect(() => {
    const handle = openNotificationSocket((msg) => {
      if (
        msg.event === "invoice_funded" ||
        msg.event === "auction_closed" ||
        msg.event === "invoice_settled"
      ) {
        void load();
        void loadHistory();
      }

      if (msg.event === "invoice_settled") {
        const invoiceId = msg.payload?.invoice_id;
        toast.success(
          `Invoice #${invoiceId ?? "-"} settled. Escrow released.`,
        );
      }
    });

    realtimeRef.current = handle;
    return () => {
      handle.close();
      realtimeRef.current = null;
    };
  }, [load, loadHistory]);

  const visibleInvoiceIds = useMemo(
    () => rows.slice(0, 200).map((row) => row.id),
    [rows],
  );

  useEffect(() => {
    const handle = realtimeRef.current;
    if (!handle || visibleInvoiceIds.length === 0) return;

    for (const invoiceId of visibleInvoiceIds) {
      handle.subscribeInvoice(invoiceId);
    }

    return () => {
      for (const invoiceId of visibleInvoiceIds) {
        handle.unsubscribeInvoice(invoiceId);
      }
    };
  }, [visibleInvoiceIds]);

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
      await loadHistory();
    } catch {
      setError(`Failed to settle invoice #${row.id}.`);
    } finally {
      setWorkingId(null);
    }
  };

  const triggerConfirmSettlement = async (row: AdminSettlementItem) => {
    const notes =
      window.prompt(
        `Optional confirmation note for invoice #${row.id}:`,
        "Settlement evidence verified by admin",
      ) || undefined;

    try {
      setConfirmingInvoiceId(row.id);
      await confirmSettlement(row.id, { notes });
      toast.success(`Settlement confirmed for invoice #${row.id}.`);
      await loadHistory();
    } catch {
      setError(`Failed to confirm settlement for invoice #${row.id}.`);
    } finally {
      setConfirmingInvoiceId(null);
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
              <th className="px-4 py-3 font-medium">Escrow</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Loading settlement rows...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
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
                    <p className="text-xs font-semibold text-gray-700">
                      {(row.escrow_status || "not_applicable").toUpperCase()}
                    </p>
                    {row.escrow_reference ? (
                      <p className="text-[11px] text-gray-500">{row.escrow_reference}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
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
                      <button
                        disabled={confirmingInvoiceId === row.id}
                        onClick={() => triggerConfirmSettlement(row)}
                        className="rounded border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {confirmingInvoiceId === row.id ? "Confirming..." : "Confirm"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Settlement History (Latest 25)</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">Record</th>
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Confirmed At</th>
            </tr>
          </thead>
          <tbody>
            {historyRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  No settlement history available.
                </td>
              </tr>
            ) : (
              historyRows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3 font-medium text-gray-900">#{row.id}</td>
                  <td className="px-4 py-3 text-gray-700">#{row.invoice_id}</td>
                  <td className="px-4 py-3 text-gray-700">{money(row.amount)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {(row.status || "pending").toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {row.confirmed_at ? new Date(row.confirmed_at).toLocaleString() : "-"}
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
