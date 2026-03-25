"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle, AlertTriangle, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api"; // Centralized API instance
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

type OCRField = { value?: string | number | null; confidence?: number };
type InvoiceCorrectionData = {
  invoice_id: number;
  filename?: string;
  ocr_fields?: Record<string, OCRField>;
};

interface InvoiceCorrectionProps {
  data: InvoiceCorrectionData;
  onSaveSuccess?: (payload: any) => void;
}

export default function InvoiceCorrection({ data, onSaveSuccess }: InvoiceCorrectionProps) {
  const toInputString = (value: any): string => (value == null ? "" : String(value));

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

  const getBadge = (score: number) => {
    if (score >= 0.9) return <span className="flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold"><CheckCircle className="h-3 w-3" /> High Confidence</span>;
    if (score >= 0.7) return <span className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold"><AlertTriangle className="h-3 w-3" /> Review Required</span>;
    return <span className="flex items-center gap-1 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold"><ShieldAlert className="h-3 w-3" /> Low Confidence</span>;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        ...fields,
        amount: parseFloat(fields.amount) || 0,
        ask_price: parseFloat(fields.ask_price) || 0,
        share_price: fields.financing_type === "fractional" ? parseFloat(fields.share_price) : null,
        min_bid_increment: fields.financing_type === "auction" ? parseFloat(fields.min_bid_increment) : null,
      };

      // Updated to use the base api instance
      const res = await api.put(`/invoice/${data.invoice_id}`, payload);
      
      toast.success("Invoice finalized and listed!");
      onSaveSuccess?.(res.data);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to save invoice";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-card p-6 rounded-xl border border-border shadow-sm space-y-6">
      <div className="flex justify-between items-start border-b pb-4">
        <div>
          <h2 className="text-lg font-bold">Review Extracted Data</h2>
          <p className="text-xs text-muted-foreground italic">{data?.filename}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="flex justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Invoice # {getBadge(data?.ocr_fields?.invoice_number?.confidence || 0)}
          </label>
          <Input 
            value={fields.invoice_number} 
            onChange={(e) => setFields({...fields, invoice_number: e.target.value})} 
          />
        </div>

        <div className="space-y-1.5">
          <label className="flex justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Client Name {getBadge(data?.ocr_fields?.client_name?.confidence || 0)}
          </label>
          <Input 
            value={fields.client_name} 
            onChange={(e) => setFields({...fields, client_name: e.target.value})} 
          />
        </div>

        <div className="space-y-1.5">
          <label className="flex justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Amount (INR) {getBadge(data?.ocr_fields?.amount?.confidence || 0)}
          </label>
          <Input 
            type="number"
            value={fields.amount} 
            onChange={(e) => setFields({...fields, amount: e.target.value})} 
          />
        </div>

        <div className="space-y-1.5">
          <label className="flex justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Due Date {getBadge(data?.ocr_fields?.due_date?.confidence || 0)}
          </label>
          <Input 
            placeholder="YYYY-MM-DD"
            value={fields.due_date} 
            onChange={(e) => setFields({...fields, due_date: e.target.value})} 
          />
        </div>
      </div>

      <div className="pt-4 border-t space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider">Sale Type</label>
            <select
              value={fields.financing_type}
              onChange={(e) => setFields({...fields, financing_type: e.target.value as FinancingType})}
              className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="fixed">Fixed Price</option>
              <option value="auction">Auction</option>
              <option value="fractional">Fractional</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider">Asking Price ($)</label>
            <Input 
              type="number"
              value={fields.ask_price} 
              onChange={(e) => setFields({...fields, ask_price: e.target.value})} 
            />
          </div>
        </div>

        {/* Dynamic Fields */}
        {fields.financing_type === "fractional" && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider">Price Per Share</label>
            <Input type="number" value={fields.share_price} onChange={(e) => setFields({...fields, share_price: e.target.value})} />
          </div>
        )}

        {fields.financing_type === "auction" && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider">Min Bid Increment</label>
            <Input type="number" value={fields.min_bid_increment} onChange={(e) => setFields({...fields, min_bid_increment: e.target.value})} />
          </div>
        )}
      </div>

      <Button 
        onClick={handleSave} 
        disabled={isSaving} 
        className="w-full h-12 text-md font-bold"
      >
        {isSaving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
        {isSaving ? "Finalizing Transaction..." : "Confirm & List Invoice"}
      </Button>
    </div>
  );
}