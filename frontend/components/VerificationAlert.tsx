"use client";

import { useState, useEffect } from "react";
import { useEmailVerification } from "@/hooks/useEmailVerification";
import { useAuth } from "@/hooks/useAuth"; 
import { toast } from "sonner";

export function VerificationAlert() {
  const { user, isLoading: authLoading } = useAuth();
  const { resendVerificationEmail, isLoading: isSending, error } = useEmailVerification();

  const [isDismissed, setIsDismissed] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [countdown, setCountdown] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);

  // FIX 1: Extract email safely from user
  const email = user?.email;
  const isUserVerified = user?.is_verified ?? false;

  useEffect(() => {
    if (countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  // Only hide if the Auth is loading or user is already verified
  if (authLoading || isUserVerified || isDismissed || !user) {
    return null;
  }

  const handleResendEmail = async () => {
    if (!email) {
      setLocalError("Email address not found");
      return;
    }

    setLocalError(null);
    setStatus("sending");

    const result = await resendVerificationEmail(email);

    if (result.success) {
      setStatus("sent");
      setCountdown(60);
      toast.success(result.message || "Verification email sent!");
      setTimeout(() => setStatus("idle"), 5000);
    } else {
      const msg = result.error || "Failed to resend email";
      setLocalError(msg);
      setStatus("idle");
      toast.error(msg);
    }
  };

  return (
    <div className="fixed top-16 left-0 right-0 z-30 px-4">
      <div
        className={`mx-auto max-w-4xl rounded-lg border shadow-sm transition-colors duration-300 ${
          localError || error
            ? "bg-red-50 border-red-200"
            : status === "sent"
              ? "bg-green-50 border-green-200"
              : "bg-blue-50 border-blue-200"
        }`}
      >
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <span className="text-lg">
                {localError || error ? "⚠️" : status === "sent" ? "✅" : "📧"}
              </span>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${localError || error ? "text-red-900" : "text-blue-900"}`}>
                  {status === "sent" ? "Check your inbox!" : "Please verify your email"}
                </p>
                <p className="text-xs text-slate-600">
                  {status === "sent" 
                    ? `We sent a new link to ${email}` 
                    : `Features are restricted until ${email} is confirmed.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {status === "sent" && countdown > 0 ? (
                <span className="text-xs font-medium tabular-nums text-slate-500">
                  Retry in {countdown}s
                </span>
              ) : (
                <button
                  onClick={handleResendEmail}
                  disabled={isSending}
                  className="text-xs font-bold text-blue-700 hover:text-blue-800 hover:underline disabled:opacity-50 transition-all"
                >
                  {isSending ? "Sending..." : "Resend Link"}
                </button>
              )}
              <button
                onClick={() => setIsDismissed(true)}
                className="ml-2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}