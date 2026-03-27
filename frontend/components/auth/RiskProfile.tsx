"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, BarChart4 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/hooks/useAuth";
import { submitRiskOnboarding, type SellerRiskOnboardingPayload } from "@/lib/profile";

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

export default function RiskProfileCalibration() {
  const { refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SellerRiskOnboardingPayload>(initialForm);

  const handleUpdate = (key: keyof SellerRiskOnboardingPayload, value: number) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await submitRiskOnboarding(form);
      toast.success(`AI Model Calibrated: ${result.risk_level} Grade`);
      await refreshProfile(); // Move to the next step in the funnel
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Calibration failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="bg-primary p-6 text-primary-foreground">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-5 w-5 opacity-80" />
          <span className="text-[10px] font-black uppercase tracking-widest">Step 2: AI Risk Calibration</span>
        </div>
        <h2 className="text-xl font-bold">Credit Modeling</h2>
      </div>

      <form onSubmit={onSubmit} className="p-6 space-y-8">
        <div className="grid gap-6 md:grid-cols-2">
          {[
            { label: "Payment History", key: "payment_history_score" },
            { label: "Logistics Consistency", key: "logistics_consistency" }
          ].map((item) => (
            <div key={item.key} className="space-y-3">
              <div className="flex justify-between">
                <Label className="text-xs font-bold uppercase">{item.label}</Label>
                <span className="text-xs font-mono">{form[item.key as keyof SellerRiskOnboardingPayload]}%</span>
              </div>
              <Slider 
                value={[form[item.key as keyof SellerRiskOnboardingPayload]]} 
                max={100} 
                onValueChange={([val]) => handleUpdate(item.key as keyof SellerRiskOnboardingPayload, val)}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4 border-t pt-6">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase">Biz Years</Label>
            <Input type="number" step="0.1" value={form.employment_years} onChange={(e) => handleUpdate("employment_years", +e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase">Debt/Income</Label>
            <Input type="number" step="0.01" value={form.debt_to_income} onChange={(e) => handleUpdate("debt_to_income", +e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase">ESG (0-10)</Label>
            <Input type="number" step="0.1" value={form.esg_score} onChange={(e) => handleUpdate("esg_score", +e.target.value)} />
          </div>
        </div>

        <Button type="submit" disabled={saving} className="w-full font-bold">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart4 className="mr-2 h-4 w-4" />}
          {saving ? "Calculating..." : "Calibrate AI Model"}
        </Button>
      </form>
    </div>
  );
}