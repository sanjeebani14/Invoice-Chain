"use client";
import React, { useState } from "react";
import { getToken } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function InvoiceCorrection({ data }: { data: any }) {
  const [fields, setFields] = useState({
    invoice_number: data?.ocr_fields?.invoice_number?.value || "",
    client_name: data?.ocr_fields?.client_name?.value || "",
    amount: data?.ocr_fields?.amount?.value || "",
    due_date: data?.ocr_fields?.due_date?.value || "",
  });

  const [isSaving, setIsSaving] = useState(false);

  const getBadge = (score: number) => {
    if (score >= 0.9) return <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">High Match</span>;
    if (score >= 0.7) return <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-medium">Please Review</span>;
    return <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full font-medium">Low Confidence</span>;
  };

  const saveCorrections = async () => {
    setIsSaving(true);
    try {
      const token = getToken();
      if (!token) {
        throw new Error("Please log in before saving invoice corrections.");
      }

      const response = await fetch(`http://localhost:8000/api/v1/invoice/invoices/${data.invoice_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(fields),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.detail || responseData.message || "Failed to save invoice corrections");
      }
      
      alert("Invoice finalized and saved to the database!");
    } catch (error) {
      console.error("Save failed", error);
      alert(error instanceof Error ? error.message : "Save failed");
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
            Invoice Number {getBadge(data?.ocr_fields?.invoice_number?.confidence || 0)}
          </label>
          <input 
            type="text" 
            value={fields.invoice_number}
            onChange={(e) => setFields({...fields, invoice_number: e.target.value})}
            className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            Client Name {getBadge(data?.ocr_fields?.client_name?.confidence || 0)}
          </label>
          <input 
            type="text" 
            value={fields.client_name}
            onChange={(e) => setFields({...fields, client_name: e.target.value})}
            className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            Total Amount (₹) {getBadge(data?.ocr_fields?.amount?.confidence || 0)}
          </label>
          <input 
            type="number" 
            value={fields.amount}
            onChange={(e) => setFields({...fields, amount: e.target.value})}
            className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            Due Date (YYYY-MM-DD) {getBadge(data?.ocr_fields?.due_date?.confidence || 0)}
          </label>
          <input 
            type="text" 
            value={fields.due_date}
            onChange={(e) => setFields({...fields, due_date: e.target.value})}
            className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

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