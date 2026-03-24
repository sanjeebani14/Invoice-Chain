"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface CheckoutInvoice {
  id: string;
  invoiceNumber?: string;
  client: string;
  amount: number;
  price: number;
  dueDate: string;
}

type CheckoutStep = "review" | "sign" | "complete";

type CheckoutSidebarProps = {
  open: boolean;
  invoice: CheckoutInvoice | null;
  onOpenChange: (open: boolean) => void;
  onConfirmPurchase: (
    invoice: CheckoutInvoice,
  ) => Promise<{ txHash?: string; explorerUrl?: string }>;
};

const DEFAULT_EXPLORER_BASE = "https://polygonscan.com/tx/";

const fmtCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

export function CheckoutSidebar({
  open,
  invoice,
  onOpenChange,
  onConfirmPurchase,
}: CheckoutSidebarProps) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [step, setStep] = useState<CheckoutStep>("review");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txExplorerUrl, setTxExplorerUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTermsAccepted(false);
      setStep("review");
      setError(null);
      setTxHash(null);
      setTxExplorerUrl(null);
    }
  }, [open, invoice?.id]);

  const platformFee = useMemo(() => {
    if (!invoice) return 0;
    return Number((invoice.price * 0.005).toFixed(2));
  }, [invoice]);

  const totalToPay = useMemo(
    () => (invoice?.price ?? 0) + platformFee,
    [invoice, platformFee],
  );

  const expectedRoiPct = useMemo(() => {
    if (!invoice || totalToPay <= 0) return 0;
    return ((invoice.amount - totalToPay) / totalToPay) * 100;
  }, [invoice, totalToPay]);

  const progressIndex = step === "review" ? 0 : step === "sign" ? 1 : 2;
  const steps = ["Review", "Sign", "Complete"];

  const handleConfirm = async () => {
    if (!invoice || !termsAccepted || step !== "review") return;
    setError(null);
    setStep("sign");
    try {
      const result = await onConfirmPurchase(invoice);
      setTxHash(result.txHash ?? null);
      setTxExplorerUrl(result.explorerUrl ?? null);
      setStep("complete");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to complete purchase.",
      );
      setStep("review");
    }
  };

  const explorerBase =
    process.env.NEXT_PUBLIC_BLOCK_EXPLORER_BASE_URL || DEFAULT_EXPLORER_BASE;

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
                Checkout
              </SheetTitle>
              <SheetDescription className="text-sm text-slate-600">
                Review invoice purchase details before signing.
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
                    <span className="text-slate-500">Invoice ID</span>
                    <span className="font-medium text-slate-900">
                      #{invoice.id}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Seller</span>
                    <span className="font-medium text-slate-900">
                      {invoice.client}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Due Date</span>
                    <span className="font-medium text-slate-900">
                      {new Date(invoice.dueDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-700">
                  Financial Breakdown
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Face Value</span>
                    <span className="font-medium text-slate-900">
                      {fmtCurrency(invoice.amount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Investment Amount</span>
                    <span className="font-medium text-slate-900">
                      {fmtCurrency(invoice.price)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Platform Fee</span>
                    <span className="font-medium text-slate-900">
                      {fmtCurrency(platformFee)}
                    </span>
                  </div>
                  <div className="mt-2 border-t border-slate-200 pt-2 text-base">
                    <div className="flex justify-between">
                      <span className="font-semibold text-slate-700">
                        Total Amount To Pay
                      </span>
                      <span className="font-bold text-slate-900">
                        {fmtCurrency(totalToPay)}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <h4 className="mb-1 text-sm font-semibold text-emerald-900">
                  Expected ROI
                </h4>
                <p className="text-2xl font-bold text-emerald-700">
                  {expectedRoiPct.toFixed(2)}%
                </p>
                <p className="mt-1 text-xs text-emerald-800">
                  Estimated return if held to maturity.
                </p>
              </section>

              {step !== "complete" && (
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-slate-700">
                    I understand that I am purchasing the rights to this
                    receivable and acknowledge the risk scoring provided.
                  </span>
                </label>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              )}

              {step === "complete" && (
                <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-emerald-800">
                    <CheckCircle2 size={18} />
                    <h4 className="text-sm font-semibold">Purchase Completed</h4>
                  </div>
                  <p className="text-xs text-emerald-900">
                    Transaction submitted successfully.
                  </p>
                  {txHash && (
                    <p className="mt-2 break-all rounded bg-white/70 p-2 font-mono text-xs text-slate-700">
                      {txHash}
                    </p>
                  )}
                  {(txExplorerUrl || txHash) && (
                    <a
                      href={txExplorerUrl || `${explorerBase}${txHash ?? ""}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline"
                    >
                      View on Block Explorer
                      <ExternalLink size={14} />
                    </a>
                  )}
                </section>
              )}
            </div>

            <div className="border-t border-slate-200 p-6">
              {step === "review" && (
                <button
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={!termsAccepted}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Confirm Purchase
                </button>
              )}
              {step === "sign" && (
                <button
                  type="button"
                  disabled
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
                >
                  <Loader2 size={16} className="animate-spin" />
                  Waiting for Wallet Signature...
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
