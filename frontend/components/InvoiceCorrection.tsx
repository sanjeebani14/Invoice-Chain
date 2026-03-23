"use client";
import React, { useState } from "react";
import axios from "axios";
import { getBackendOrigin } from "@/lib/backendOrigin";

type FinancingType = "fixed" | "auction" | "fractional";

interface CorrectionFields {
  invoice_number: string;
  client_name: string;
  amount: string;
  due_date: string;
  sector: string;
  financing_type: FinancingType;
  ask_price: string;
  share_price: string;
  min_bid_increment: string;
}

interface OcrField {
  value?: unknown;
  confidence?: number;
}

interface InvoiceCorrectionData {
  invoice_id: string | number;
  filename?: string;
  ocr_fields?: {
    invoice_number?: OcrField;
    client_name?: OcrField;
    amount?: OcrField;
    due_date?: OcrField;
  };
}

interface ErrorResponse {
  detail?: string;
  message?: string;
}

interface InvoiceCorrectionProps {
  data: InvoiceCorrectionData;
  onSaveStart?: () => void;
  onSaveSuccess?: (payload: unknown) => void;
  onSaveError?: (message: string) => void;
}

export default function InvoiceCorrection({
  data,
  onSaveStart,
  onSaveSuccess,
  onSaveError,
}: InvoiceCorrectionProps) {
  const toInputString = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    return String(value);
  };

  const [fields, setFields] = useState<CorrectionFields>({
    invoice_number: toInputString(data?.ocr_fields?.invoice_number?.value),
    client_name: toInputString(data?.ocr_fields?.client_name?.value),
    amount: toInputString(data?.ocr_fields?.amount?.value),
    due_date: toInputString(data?.ocr_fields?.due_date?.value),
    sector: "Technology",
    financing_type: "fixed",
    ask_price: "",
    share_price: "",
    min_bid_increment: "",
  });

  const [isSaving, setIsSaving] = useState(false);
  const backendOrigin = getBackendOrigin();

  const toNullableNumber = (value: unknown): number | null => {
    const normalized = toInputString(value).trim();
    if (normalized === "") return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getBadge = (score: number) => {
    if (score >= 0.9)
      return (
        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">
          High Match
        </span>
      );
    if (score >= 0.7)
      return (
        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-medium">
          Please Review
        </span>
      );
    return (
      <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full font-medium">
        Low Confidence
      </span>
    );
  };

  const saveCorrections = async () => {
    setIsSaving(true);
    onSaveStart?.();
    try {
      const payload = {
        invoice_number: fields.invoice_number,
        client_name: fields.client_name,
        amount: toNullableNumber(fields.amount),
        due_date: fields.due_date,
        sector: fields.sector.trim() || null,
        financing_type: fields.financing_type,
        ask_price: toNullableNumber(fields.ask_price),
        share_price:
          fields.financing_type === "fractional"
            ? toNullableNumber(fields.share_price)
            : null,
        min_bid_increment:
          fields.financing_type === "auction"
            ? toNullableNumber(fields.min_bid_increment)
            : null,
      };

      const response = await axios.put(
        `${backendOrigin}/api/v1/invoice/invoices/${data.invoice_id}`,
        payload,
        { withCredentials: true },
      );

      if (onSaveSuccess) {
        onSaveSuccess(response.data);
      } else {
        alert("Invoice finalized and saved to the database!");
      }
    } catch (error: unknown) {
      console.error("Save failed", error);
      const responseData = axios.isAxiosError(error)
        ? (error.response?.data as ErrorResponse | undefined)
        : undefined;
      const message =
        responseData?.detail ||
        responseData?.message ||
        (error instanceof Error ? error.message : "Save failed");
      if (onSaveError) {
        onSaveError(message);
      } else {
        alert(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Verify Extracted Data</h2>
        <span className="text-sm text-gray-500">File: {data?.filename}</span>
      </div>

      <div className="space-y-5">
        <div>
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            Invoice Number{" "}
            {getBadge(data?.ocr_fields?.invoice_number?.confidence || 0)}
          </label>
          <input
            type="text"
            value={fields.invoice_number}
            onChange={(e) =>
              setFields({ ...fields, invoice_number: e.target.value })
            }
            className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            Client Name{" "}
            {getBadge(data?.ocr_fields?.client_name?.confidence || 0)}
          </label>
          <input
            type="text"
            value={fields.client_name}
            onChange={(e) =>
              setFields({ ...fields, client_name: e.target.value })
            }
            className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            Total Amount (₹){" "}
            {getBadge(data?.ocr_fields?.amount?.confidence || 0)}
          </label>
          <input
            type="number"
            value={fields.amount}
            onChange={(e) => setFields({ ...fields, amount: e.target.value })}
            className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            Due Date (YYYY-MM-DD){" "}
            {getBadge(data?.ocr_fields?.due_date?.confidence || 0)}
          </label>
          <input
            type="text"
            value={fields.due_date}
            onChange={(e) => setFields({ ...fields, due_date: e.target.value })}
            className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      <div className="mt-5">
        <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
          Sector
        </label>
        <input
          type="text"
          value={fields.sector}
          onChange={(e) => setFields({ ...fields, sector: e.target.value })}
          className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>

      <div>
        <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
          How do you want to sell this?
        </label>
        <select
          value={fields.financing_type}
          onChange={(e) =>
            setFields({
              ...fields,
              financing_type: e.target.value as FinancingType,
            })
          }
          className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="fixed">Fixed Price</option>
          <option value="auction">Auction</option>
          <option value="fractional">Fractional Shares</option>
        </select>
      </div>

      <div>
        <label className="flex justify-between text-sm font-medium text-gray-700 mb-1 mt-4">
          Asking Price / Starting Bid ($)
        </label>
        <input
          type="number"
          value={fields.ask_price}
          onChange={(e) => setFields({ ...fields, ask_price: e.target.value })}
          className="w-full p-2.5 border border-gray-300 rounded-md"
        />
      </div>

      {fields.financing_type === "fractional" && (
        <div>
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1 mt-4">
            Share Price ($)
          </label>
          <input
            type="number"
            value={fields.share_price}
            onChange={(e) =>
              setFields({ ...fields, share_price: e.target.value })
            }
            className="w-full p-2.5 border border-gray-300 rounded-md"
          />
        </div>
      )}

      {fields.financing_type === "auction" && (
        <div>
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1 mt-4">
            Minimum Bid Increment ($)
          </label>
          <input
            type="number"
            value={fields.min_bid_increment}
            onChange={(e) =>
              setFields({ ...fields, min_bid_increment: e.target.value })
            }
            className="w-full p-2.5 border border-gray-300 rounded-md"
          />
        </div>
      )}
      <button
        onClick={saveCorrections}
        disabled={isSaving}
        className="mt-8 w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {isSaving ? "Saving to Database..." : "Confirm & Finalize Invoice"}
      </button>
    </div>
  );
}
