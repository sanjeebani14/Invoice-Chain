"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, CheckCircle2, AlertCircle, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth"; // Use the global state
import { kycApi } from "@/lib/api"; // Use the specialized KYC instance

export default function KycForm() {
  // Pull profile and refresh function from global Auth
  const { profile, refreshProfile, isLoading: authLoading } = useAuth();
  
  const [submitting, setSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  // Derive KYC data from the global profile object
  const kyc = profile?.kyc || null;

  const status = useMemo(() => {
    const s = kyc?.status;
    if (s === "approved") return { text: "Verified", color: "text-green-600", icon: <CheckCircle2 className="h-5 w-5" /> };
    if (s === "rejected") return { text: "Rejected", color: "text-red-600", icon: <AlertCircle className="h-5 w-5" /> };
    if (s === "pending" || s === "review") return { text: "Pending", color: "text-amber-600", icon: <Clock className="h-5 w-5" /> };
    return { text: "Unverified", color: "text-muted-foreground", icon: <ShieldCheck className="h-5 w-5" /> };
  }, [kyc]);

  const onSubmit = async () => {
    if (!file) return;
    setSubmitting(true);
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      // Use kycApi specialized instance
      await kycApi.post("/submissions", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      
      setFile(null);
      toast.success("KYC documents uploaded successfully!");
      
      // CRITICAL: Refresh the global auth state so TopBar/Alerts update immediately
      await refreshProfile();
      
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Upload failed. Please try again.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const isLocked = submitting || authLoading || kyc?.status === "pending" || kyc?.status === "review" || kyc?.status === "approved";

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          Identity Verification {status.icon}
        </h2>
        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary ${status.color}`}>
          {status.text}
        </span>
      </div>

      {kyc?.status === "rejected" && (
        <div className="text-xs p-3 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          <p className="font-bold mb-1">Rejection Reason:</p>
          <p>{"Document was rejected. Please re-upload."}</p>
        </div>
      )}

      {kyc?.status !== "approved" && kyc?.status !== "pending" && kyc?.status !== "review" && (
        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <p className="text-sm font-medium">Government Issued ID</p>
            <p className="text-xs text-muted-foreground">Please upload a clear scan of your PAN card or Passport.</p>
          </div>
          
          <Input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            disabled={isLocked}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs cursor-pointer file:text-primary file:font-bold"
          />
          
          <Button 
            onClick={onSubmit} 
            disabled={isLocked || !file}
            className="w-full font-bold"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {submitting ? "Processing..." : "Submit for Verification"}
          </Button>
        </div>
      )}

      {(kyc?.status === "pending" || kyc?.status === "review") && (
        <div className="p-4 bg-muted/50 rounded-lg text-center space-y-2">
          <p className="text-sm font-medium text-amber-700">Under Review</p>
          <p className="text-xs text-muted-foreground">Our team is currently verifying your documents. This usually takes 24-48 hours.</p>
        </div>
      )}

      {kyc?.status === "approved" && (
        <div className="p-4 bg-green-50 rounded-lg text-center border border-green-100">
          <p className="text-sm font-bold text-green-700">Account Verified</p>
          <p className="text-xs text-green-600/80">You now have full access to the Marketplace and Bidding.</p>
        </div>
      )}
    </div>
  );
}