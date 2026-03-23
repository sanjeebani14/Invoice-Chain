"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { getMyKyc, submitPan, type KycSubmissionOut } from "@/lib/kyc";
import { getBackendOrigin } from "@/lib/backendOrigin";
import axios from "axios";

const BACKEND_ORIGIN = getBackendOrigin();

function getRoleHomePath(rawRole: unknown): string {
  const role = String(rawRole ?? "").toLowerCase();
  if (role.includes("admin")) return "/admin/dashboard";
  if (role.includes("investor")) return "/INVESTOR/marketplace";
  if (role.includes("seller") || role.includes("sme")) return "/sme/dashboard";
  return "/profile";
}

function statusLabel(kyc: KycSubmissionOut | null) {
  if (!kyc) return { text: "Not submitted", tone: "text-muted-foreground" };
  if (kyc.status === "approved")
    return { text: "Approved", tone: "text-green-600" };
  if (kyc.status === "rejected")
    return { text: "Rejected", tone: "text-red-600" };
  return { text: "Pending review", tone: "text-amber-600" };
}

export default function KycPage() {
  const { currentUser, isAuthenticated, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [kyc, setKyc] = useState<KycSubmissionOut | null>(null);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await getMyKyc();
        setKyc(res.kyc);
      } catch {
        setKyc(null);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const status = useMemo(() => statusLabel(kyc), [kyc]);

  const disabled = !isAuthenticated || authLoading || loading;

  const onSubmit = async () => {
    if (!file) {
      toast.error("Please choose a file");
      return;
    }
    setSubmitting(true);
    try {
      const created = await submitPan(file);
      setKyc(created);
      setFile(null);
      toast.success("KYC submitted. Awaiting review.");

      // After KYC submission, route user to their primary destination.
      const me = await axios.get(`${BACKEND_ORIGIN}/auth/me`, {
        withCredentials: true,
      });
      window.location.href = getRoleHomePath(me.data?.role);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "KYC upload failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">KYC Verification</h1>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className={`mt-1 text-lg font-medium ${status.tone}`}>
                {status.text}
              </p>
            </div>
            {(loading || authLoading) && (
              <div className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading
              </div>
            )}
          </div>

          {kyc?.status === "rejected" && kyc.rejection_reason && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <div className="font-medium">Rejection reason</div>
              <div className="mt-1">{kyc.rejection_reason}</div>
            </div>
          )}

          <div className="mt-6 space-y-2">
            <p className="text-sm text-muted-foreground">
              Upload your{" "}
              <span className="font-medium text-foreground">PAN</span>{" "}
              (PDF/JPG/PNG, max 10MB).
            </p>
            <Input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              disabled={disabled || submitting}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="mt-4 flex gap-3">
            <Button
              onClick={onSubmit}
              disabled={disabled || submitting || !file}
              className="min-w-40"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit KYC
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                // Allow user to skip KYC and still browse the app.
                // Actions (buy/sell) must be gated server-side via require_kyc_approved.
                if (typeof window !== "undefined") {
                  window.localStorage.setItem("kycSkipped", "true");
                  window.location.href = getRoleHomePath(currentUser?.role);
                }
              }}
            >
              Skip KYC
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
