"use client";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, ShieldCheck, CheckCircle2, AlertCircle, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import type { KycSubmissionOut } from "@/lib/api/types";

export default function KycForm() {
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [kyc, setKyc] = useState<KycSubmissionOut | null>(null);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const { data } = await api.get("/kyc/me");
        setKyc(data.kyc);
      } catch {
        setKyc(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated]);

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
    const { data } = await api.post<KycSubmissionOut>("/kyc/submissions", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    
    setKyc(data);
    setFile(null);
    toast.success("KYC submitted");
  } catch (err: unknown) {
    // ... error handling
  } finally {
    setSubmitting(false);
  }
};

  const isLocked = submitting || loading || kyc?.status === "pending" || kyc?.status === "review" || kyc?.status === "approved";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          Identity {status.icon}
        </h2>
        <span className={`text-xs font-bold uppercase px-2 py-1 rounded-full bg-muted ${status.color}`}>
          {status.text}
        </span>
      </div>

      {kyc?.status === "rejected" && (
        <div className="text-xs p-3 bg-red-50 text-red-700 rounded-lg border border-red-100">
          <strong>Reason:</strong> {kyc.rejection_reason || "Check document clarity."}
        </div>
      )}

      {kyc?.status !== "approved" && (
        <div className="space-y-4 pt-2">
          <p className="text-xs text-muted-foreground">Upload PAN card (PDF/JPG) to verify.</p>
          <Input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            disabled={isLocked}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs"
          />
          <Button 
            onClick={onSubmit} 
            disabled={isLocked || !file}
            className="w-full h-9 text-xs"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload Document"}
          </Button>
        </div>
      )}

      {kyc?.status === "approved" && (
        <p className="text-xs text-green-600 font-medium">Your identity documents are verified.</p>
      )}
    </div>
  );
}