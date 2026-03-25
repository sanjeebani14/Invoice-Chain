"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios, { AxiosError } from "axios";
import { toast } from "sonner";
import { getApiV1Base } from "@/lib/backendOrigin";

const API_URL = `${getApiV1Base()}/auth`;

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("Verifying your email...");
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [isResending, setIsResending] = useState(false);

  const handleSuccess = async () => {
    setStatus("success");
    setMessage("✅ Email verified successfully!");
    toast.success("Welcome to InvoiceChain!");

    setTimeout(() => {
      router.push("/login");
    }, 2000);
  };

  useEffect(() => {
    const statusParam = searchParams.get("status");
    const token = searchParams.get("token");

    if (statusParam === "success") {
      handleSuccess();
    } else if (statusParam === "error") {
      setStatus("error");
      setMessage("Verification failed");
      setErrorDetails("Your verification link is invalid or has expired.");
      setShowResend(true);
    } else if (token) {
      verifyEmail(token);
    } else {
      setStatus("error");
      setMessage("Missing Token");
      setErrorDetails("No verification token was found in the link.");
    }
  }, [searchParams]);

  const verifyEmail = async (token: string) => {
    try {
      setStatus("loading");
      await axios.post(
        `${API_URL}/verify-email`,
        { token },
        { withCredentials: true },
      );
      await handleSuccess();
    } catch (error: unknown) {
      setStatus("error");

      const errorDetail =
        (error as AxiosError<{ detail?: string }>).response?.data?.detail ||
        "Failed to verify email";

      if (errorDetail.includes("expired")) {
        setMessage("❌ Verification link expired");
        setErrorDetails(
          "Your verification link has expired. Please request a new one.",
        );
      } else if (errorDetail.includes("Invalid")) {
        setMessage("❌ Invalid verification link");
        setErrorDetails(
          "The verification link is invalid or has already been used.",
        );
      } else {
        setMessage("❌ Verification failed");
        setErrorDetails(errorDetail);
      }

      setShowResend(true);
      toast.error(errorDetail);
    }
  };

  const handleResendEmail = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resendEmail.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    setIsResending(true);
    try {
      const response = await axios.post(
        `${API_URL}/resend-verification-email`,
        { email: resendEmail },
        { withCredentials: true },
      );

      const msg =
        response.data?.message ||
        "Request processed. Check your inbox if applicable.";
      toast.success(msg);
      setShowResend(false);
      setResendEmail("");
    } catch (error: unknown) {
      const errorMsg =
        (error as AxiosError<{ detail?: string }>).response?.data?.detail ||
        "Failed to resend email";
      toast.error(errorMsg);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          {/* Loading State */}
          {status === "loading" && (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="animate-spin">
                  <svg
                    className="w-12 h-12 text-blue-600"
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
                </div>
              </div>
              <p className="text-gray-600 text-lg">{message}</p>
              <p className="text-gray-400 text-sm">
                Please wait while we verify your email address...
              </p>
            </div>
          )}

          {/* Success State - Optimized for the strict flow */}
          {status === "success" && (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">{message}</h2>
              <p className="text-gray-600">
                Your email has been verified. Continue to login to access your account.
              </p>
              <p className="text-sm text-gray-500 italic">
                Redirecting you to login in 2 seconds...
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => router.push("/login")}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors shadow-md"
                >
                  Go to Login
                </button>
              </div>
            </div>
          )}

          {/* Error State */}
          {status === "error" && (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">{message}</h2>
              <p className="text-gray-600">{errorDetails}</p>

              {showResend && (
                <form onSubmit={handleResendEmail} className="space-y-4 mt-6">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isResending}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    {isResending ? "Sending..." : "Resend Verification Email"}
                  </button>
                </form>
              )}

              <div className="border-t border-gray-200 pt-6">
                <p className="text-sm text-gray-600">
                  Already have an account?{" "}
                  <button
                    onClick={() => router.push("/login")}
                    className="text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    Go to login
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              Having trouble? Contact support at support@invoicechain.com
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center text-sm text-gray-600">
            Loading verification page...
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
