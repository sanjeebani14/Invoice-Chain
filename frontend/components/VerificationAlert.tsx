"use client";

import { useState, useEffect } from "react";
import { useEmailVerification } from "@/hooks/useEmailVerification";
import { toast } from "sonner";

interface VerificationAlertProps {
  isVerified?: boolean;
  email?: string;
}

export function VerificationAlert({
  isVerified = false,
  email,
}: VerificationAlertProps) {
  const { resendVerificationEmail, isLoading, error } =
    useEmailVerification();

  const [isDismissed, setIsDismissed] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [countdown, setCountdown] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;

    const interval = setInterval(() => {
      setCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [countdown]);

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
      setCountdown(60); // 60 second countdown
      toast.success(result.message || "Request processed. Check your inbox if applicable.");

      // Reset to idle after 5 seconds
      setTimeout(() => {
        setStatus("idle");
      }, 5000);
    } else {
      setLocalError(result.error || "Failed to resend email");
      setStatus("idle");
      toast.error(result.error || "Failed to resend email");
    }
  };

  // Don't show anything if verified
  if (isVerified) {
    return null;
  }

  // Don't show if dismissed (unless unverified)
  if (isDismissed) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <div
        className={`mx-auto max-w-6xl rounded-b-lg shadow-lg ${
          localError || error
            ? "bg-red-50 border-b border-red-200"
            : status === "sent"
              ? "bg-green-50 border-b border-green-200"
              : "bg-blue-50 border-b border-blue-200"
        }`}
      >
        <div className="px-4 py-4 sm:px-6 sm:py-3">
          <div className="flex items-start justify-between gap-4">
            {/* Icon + Message */}
            <div className="flex items-start gap-3 flex-1">
              {localError || error ? (
                <svg
                  className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : status === "sent" ? (
                <svg
                  className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <span className="text-xl mt-0.5">📧</span>
              )}

              <div className="flex-1">
                {localError || error ? (
                  <p className="text-sm font-medium text-red-800">
                    {localError || error}
                  </p>
                ) : status === "sent" ? (
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      ✅ Verification email sent!
                    </p>
                    <p className="text-sm text-green-700 mt-1">
                      Please check your inbox and click the verification link.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-blue-900">
                      Please verify your email to unlock all features
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      We sent a verification link to <strong>{email}</strong>.
                      Click it to confirm your email address.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {status === "sent" && countdown > 0 ? (
                <span className="text-sm text-green-700 font-medium">
                  Resend in {countdown}s
                </span>
              ) : (
                <>
                  {status !== "sent" && (
                    <button
                      onClick={handleResendEmail}
                      disabled={isLoading}
                      className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        localError || error
                          ? "bg-red-100 text-red-700 hover:bg-red-200 disabled:bg-red-100"
                          : "bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:bg-blue-100"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isLoading ? (
                        <>
                          <svg
                            className="w-4 h-4 mr-2 animate-spin"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          Sending...
                        </>
                      ) : localError || error ? (
                        "Try Again"
                      ) : (
                        "Resend Email"
                      )}
                    </button>
                  )}
                </>
              )}

              {/* Dismiss/Close Button */}
              <button
                onClick={() => setIsDismissed(true)}
                className="inline-flex text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Dismiss notification"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
