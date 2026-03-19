"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAdminPendingInvoices,
  reviewAdminPendingInvoice,
  type AdminPendingInvoice,
} from "@/lib/api";

const BACKEND_ORIGIN = "http://localhost:8000";

function formatPercent(value?: number | null) {
  if (value === undefined || value === null) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function isPdf(url?: string | null) {
  if (!url) return false;
  return url.toLowerCase().endsWith(".pdf");
}

export default function PendingInvoicesPage() {
  const [rows, setRows] = useState<AdminPendingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAdminPendingInvoices({ limit: 100 });
      setRows(data.invoices);
      setSelectedId((prev) => {
        if (data.invoices.length === 0) return null;
        if (prev === null) return data.invoices[0].id;
        return data.invoices.some((row) => row.id === prev)
          ? prev
          : data.invoices[0].id;
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load pending invoices.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) || null,
    [rows, selectedId],
  );

  const handleReview = async (
    invoiceId: number,
    action: "approve" | "reject",
  ) => {
    try {
      setWorkingId(invoiceId);
      await reviewAdminPendingInvoice(invoiceId, action);
      setRows((prev) => prev.filter((row) => row.id !== invoiceId));
      if (selectedId === invoiceId) {
        const next = rows.find((row) => row.id !== invoiceId);
        setSelectedId(next ? next.id : null);
      }
    } catch {
      setError(`Failed to ${action} invoice #${invoiceId}.`);
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pending Invoices</h1>
          <p className="text-sm text-gray-600">
            Approval gateway before listing and funding.
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

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded border border-gray-200 bg-white">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium text-gray-900">Queue</p>
            <p className="text-xs text-gray-500">
              {rows.length} awaiting review
            </p>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            {loading ? (
              <div className="px-4 py-8 text-sm text-gray-500">
                Loading queue...
              </div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-8 text-sm text-gray-500">
                No pending invoices.
              </div>
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
                    {row.seller_name || "Unknown seller"} • {row.amount ?? "-"}{" "}
                    {row.currency || ""}
                  </p>
                  {(row.is_duplicate ||
                    row.duplicate_invoice_number_exists) && (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      Duplicate warning
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded border border-gray-200 bg-white p-4">
          {!selected ? (
            <div className="py-16 text-center text-sm text-gray-500">
              Select an invoice to review.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Invoice #{selected.id}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {selected.invoice_number || "No invoice number"} •{" "}
                    {selected.seller_name || "Unknown seller"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReview(selected.id, "reject")}
                    disabled={workingId === selected.id}
                    className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleReview(selected.id, "approve")}
                    disabled={workingId === selected.id}
                    className="rounded bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-60"
                  >
                    Approve
                  </button>
                </div>
              </div>

              {(selected.is_duplicate ||
                selected.duplicate_invoice_number_exists) && (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Duplicate detection alert: invoice number appears in existing
                  records ({selected.duplicate_matches} matches).
                </div>
              )}

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded border border-gray-200 p-3">
                  <p className="mb-2 text-sm font-medium text-gray-900">
                    Original Upload
                  </p>
                  {selected.upload_url ? (
                    isPdf(selected.upload_url) ? (
                      <iframe
                        src={`${BACKEND_ORIGIN}${selected.upload_url}`}
                        title={`invoice-${selected.id}`}
                        className="h-[420px] w-full rounded border"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${BACKEND_ORIGIN}${selected.upload_url}`}
                        alt={
                          selected.original_filename || `invoice-${selected.id}`
                        }
                        className="h-[420px] w-full rounded border object-contain"
                      />
                    )
                  ) : (
                    <div className="flex h-[420px] items-center justify-center rounded border border-dashed text-sm text-gray-500">
                      Preview not available.
                    </div>
                  )}
                </div>

                <div className="rounded border border-gray-200 p-3">
                  <p className="mb-2 text-sm font-medium text-gray-900">
                    OCR Extracted Data
                  </p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span>Invoice Number</span>
                      <span className="font-medium">
                        {selected.ocr_extracted.invoice_number || "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b pb-2">
                      <span>Seller Name</span>
                      <span className="font-medium">
                        {selected.ocr_extracted.seller_name || "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b pb-2">
                      <span>Buyer Name</span>
                      <span className="font-medium">
                        {selected.ocr_extracted.client_name || "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b pb-2">
                      <span>Amount</span>
                      <span className="font-medium">
                        {selected.ocr_extracted.amount ?? "-"}{" "}
                        {selected.ocr_extracted.currency || ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b pb-2">
                      <span>Due Date</span>
                      <span className="font-medium">
                        {selected.ocr_extracted.due_date || "-"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 rounded bg-gray-50 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Confidence Scores
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                      <div>Invoice #</div>
                      <div className="text-right">
                        {formatPercent(selected.confidence.invoice_number)}
                      </div>
                      <div>Seller</div>
                      <div className="text-right">
                        {formatPercent(selected.confidence.seller_name)}
                      </div>
                      <div>Buyer</div>
                      <div className="text-right">
                        {formatPercent(selected.confidence.client_name)}
                      </div>
                      <div>Amount</div>
                      <div className="text-right">
                        {formatPercent(selected.confidence.amount)}
                      </div>
                      <div>Due Date</div>
                      <div className="text-right">
                        {formatPercent(selected.confidence.due_date)}
                      </div>
                      <div className="font-semibold">Overall</div>
                      <div className="text-right font-semibold">
                        {formatPercent(selected.confidence.overall)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
