"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getRiskOnboardingStatus,
  submitRiskOnboarding,
  type SellerRiskOnboardingPayload,
} from "@/lib/profile";

const initialForm: SellerRiskOnboardingPayload = {
  payment_history_score: 70,
  client_reputation_score: 70,
  seller_track_record: 70,
  employment_years: 3,
  debt_to_income: 0.35,
  core_enterprise_rating: 70,
  transaction_stability: 2,
  logistics_consistency: 80,
  esg_score: 5.5,
};

export default function RiskProfileOnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SellerRiskOnboardingPayload>(initialForm);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const status = await getRiskOnboardingStatus();
        if (!status.required) {
          router.push("/kyc");
          return;
        }
      } catch {
        toast.error("Unable to load onboarding status");
      } finally {
        setLoading(false);
      }
    };

    void loadStatus();
  }, [router]);

  const onNumber = (key: keyof SellerRiskOnboardingPayload, value: string) => {
    const parsed = Number(value);
    setForm((prev) => ({ ...prev, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await submitRiskOnboarding(form);
      toast.success(
        `Risk profile saved. Score ${result.composite_score} (${result.risk_level}).`,
      );
      router.push("/kyc");
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Failed to save risk profile";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-white px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Complete Seller Risk Profile</h1>
        <p className="mt-2 text-sm text-slate-600">
          We need this once to initialize your XGBoost risk model inputs.
        </p>

        <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="payment_history_score">Payment History Score (0-100)</Label>
            <Input
              id="payment_history_score"
              type="number"
              min={0}
              max={100}
              value={form.payment_history_score}
              onChange={(e) => onNumber("payment_history_score", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client_reputation_score">Client Reputation Score (0-100)</Label>
            <Input
              id="client_reputation_score"
              type="number"
              min={0}
              max={100}
              value={form.client_reputation_score}
              onChange={(e) => onNumber("client_reputation_score", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seller_track_record">Seller Track Record (0-100)</Label>
            <Input
              id="seller_track_record"
              type="number"
              min={0}
              max={100}
              value={form.seller_track_record}
              onChange={(e) => onNumber("seller_track_record", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="employment_years">Business/Employment Years</Label>
            <Input
              id="employment_years"
              type="number"
              min={0}
              max={60}
              step="0.1"
              value={form.employment_years}
              onChange={(e) => onNumber("employment_years", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="debt_to_income">Debt to Income Ratio</Label>
            <Input
              id="debt_to_income"
              type="number"
              min={0}
              max={3}
              step="0.01"
              value={form.debt_to_income}
              onChange={(e) => onNumber("debt_to_income", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="core_enterprise_rating">Core Enterprise Rating (0-100)</Label>
            <Input
              id="core_enterprise_rating"
              type="number"
              min={0}
              max={100}
              value={form.core_enterprise_rating}
              onChange={(e) => onNumber("core_enterprise_rating", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transaction_stability">Transaction Stability (years)</Label>
            <Input
              id="transaction_stability"
              type="number"
              min={0}
              max={50}
              step="0.1"
              value={form.transaction_stability}
              onChange={(e) => onNumber("transaction_stability", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logistics_consistency">Logistics Consistency (0-100)</Label>
            <Input
              id="logistics_consistency"
              type="number"
              min={0}
              max={100}
              value={form.logistics_consistency}
              onChange={(e) => onNumber("logistics_consistency", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="esg_score">ESG Score (0-10)</Label>
            <Input
              id="esg_score"
              type="number"
              min={0}
              max={10}
              step="0.1"
              value={form.esg_score}
              onChange={(e) => onNumber("esg_score", e.target.value)}
              required
            />
          </div>

          <div className="sm:col-span-2 pt-2">
            <Button type="submit" disabled={saving} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save and Continue
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
