"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { SellerInvoiceItem } from "@/lib/api";

type RepaymentStep = "review" | "sign" | "complete";

type RepaymentSidebarProps = {
  open: boolean;
  invoice: SellerInvoiceItem | null;
  walletLabel: string;
  networkLabel: string;
  onOpenChange: (open: boolean) => void;
  onConfirmRepayment: (
    invoice: SellerInvoiceItem,
    payload: { repayment_amount: number; notes?: string },
  ) => Promise<void>;
};

const fmtCurrency = (value: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);

export function RepaymentSidebar({
  open,
  invoice,
  walletLabel,
  networkLabel,
  onOpenChange,
  onConfirmRepayment,
}: RepaymentSidebarProps) {
  const [step, setStep] = useState<RepaymentStep>("review");
  const [error, setError] = useState<string | null>(null);
  const [repaymentAmount, setRepaymentAmount] = useState(
    String(invoice?.amount ?? invoice?.ask_price ?? ""),
  );
  const [notes, setNotes] = useState(
    "Repayment sent to settlement smart contract",
  );

  const totalDue = useMemo(() => {
    const parsed = Number(repaymentAmount);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [repaymentAmount]);

  const progressIndex = step === "review" ? 0 : step === "sign" ? 1 : 2;
  const steps = ["Review", "Sign", "Complete"];

  const handleConfirm = async () => {
    if (!invoice) return;

    const parsed = Number(repaymentAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Repayment amount must be a positive number.");
      return;
    }

    setError(null);
    setStep("sign");

    try {
      await onConfirmRepayment(invoice, {
        repayment_amount: parsed,
        notes: notes.trim() || undefined,
      });
      setStep("complete");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to submit repayment.",
      );
      setStep("review");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-l border-slate-200 bg-white p-0 sm:max-w-xl"
      >
        {!invoice ? null : (
          <div className="flex h-full flex-col">
            <SheetHeader className="border-b border-slate-200 bg-slate-50 p-6 pr-12">
              <SheetTitle className="text-xl font-bold text-slate-900">
                Repay Investor
              </SheetTitle>
              <SheetDescription className="text-sm text-slate-600">
                Review repayment details, confirm with your wallet, and submit for admin confirmation.
              </SheetDescription>
            </SheetHeader>

            <div className="border-b border-slate-100 px-6 py-4">
              <div className="flex items-center justify-between gap-2">
                {steps.map((label, idx) => {
                  const isActive = idx === progressIndex;
                  const isDone = idx < progressIndex;
                  return (
                    <div key={label} className="flex items-center gap-2 text-xs">
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold ${
                          isDone || isActive
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-300 text-slate-500"
                        }`}
                      >
                        {isDone ? <CheckCircle2 size={14} /> : idx + 1}
                      </div>
                      <span
                        className={
                          isDone || isActive
                            ? "font-semibold text-slate-900"
                            : "text-slate-500"
                        }
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <section className="rounded-xl border border-slate-200 p-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-700">
                  Invoice Summary
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Invoice</span>
                    <span className="font-medium text-slate-900">
                      #{invoice.id}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Client</span>
                    <span className="font-medium text-slate-900">
                      {invoice.client_name || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Due Date</span>
                    <span className="font-medium text-slate-900">
                      {invoice.due_date || "-"}
                    </span>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-700">
                  Wallet Status
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Wallet</span>
                    <span className="font-medium text-slate-900">
                      {walletLabel}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Network</span>
                    <span className="font-medium text-slate-900">
                      {networkLabel}
                    </span>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-700">
                  Repayment Details
                </h4>
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="repayment-amount"
                      className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Repayment Amount
                    </label>
                    <input
                      id="repayment-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={repaymentAmount}
                      onChange={(e) => setRepaymentAmount(e.target.value)}
                      disabled={step !== "review"}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-black outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="repayment-notes"
                      className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Notes
                    </label>
                    <textarea
                      id="repayment-notes"
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      disabled={step !== "review"}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-black outline-none focus:border-blue-500"
                      placeholder="Optional note for admin review"
                    />
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold text-emerald-900">
                        Total Amount To Repay
                      </span>
                      <span className="font-bold text-emerald-800">
                        {fmtCurrency(totalDue, invoice.currency || "INR")}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              )}

              {step === "complete" && (
                <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-emerald-800">
                    <CheckCircle2 size={18} />
                    <h4 className="text-sm font-semibold">
                      Repayment Submitted
                    </h4>
                  </div>
                  <p className="text-xs text-emerald-900">
                    The invoice is now awaiting admin confirmation in the settlement tracker.
                  </p>
                </section>
              )}
            </div>

            <div className="border-t border-slate-200 p-6">
              {step === "review" && (
                <button
                  type="button"
                  onClick={() => void handleConfirm()}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:shadow-md"
                >
                  Confirm Repayment
                </button>
              )}
              {step === "sign" && (
                <button
                  type="button"
                  disabled
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
                >
                  <Loader2 size={16} className="animate-spin" />
                  Waiting for Wallet Confirmation...
                </button>
              )}
              {step === "complete" && (
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
