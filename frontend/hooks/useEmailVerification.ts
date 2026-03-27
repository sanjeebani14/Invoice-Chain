"use client";

import { useState, useCallback } from "react";
import { authApi } from "@/lib/api";
import type { 
  VerifyEmailResponse, 
  ResendVerificationEmailResponse, 
  VerificationStatusResponse 
} from "@/lib/types";

export function useEmailVerification() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifyEmail = async (token: string): Promise<VerifyEmailResponse> => {
    setIsLoading(true);
    setError(null);
    try {
      if (!token?.trim()) throw new Error("Verification token is required");

      // Uses authApi, so the path is just /verify-email
      const { data } = await authApi.post("/verify-email", {
        token: token.trim(),
      });

      return { success: true, user: data.user };
    } catch (err: any) {
      const message = err.response?.data?.detail || err.message || "Failed to verify email";
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerificationEmail = async (email: string): Promise<ResendVerificationEmailResponse> => {
    setIsLoading(true);
    setError(null);
    try {
      if (!email?.trim()) throw new Error("Email address is required");

      const { data } = await authApi.post("/resend-verification-email", {
        email: email.trim(),
      });

      return { success: true, message: data.message || "Request processed." };
    } catch (err: any) {
      const message = err.response?.data?.detail || "Failed to resend verification email";
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const getVerificationStatus = async (email: string): Promise<VerificationStatusResponse> => {
    setIsLoading(true);
    setError(null);
    try {
      if (!email?.trim()) throw new Error("Email address is required");

      const { data } = await authApi.get("/verification-status", {
        params: { email: email.trim() }
      });

      return {
        success: true,
        verified: data.email_verified,
        email: data.email,
        verified_at: data.verified_at,
      };
    } catch (err: any) {
      const message = err.response?.data?.detail || "Failed to check status";
      setError(message);
      return { success: false, verified: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = useCallback(() => setError(null), []);

  return {
    verifyEmail,
    resendVerificationEmail,
    getVerificationStatus,
    isLoading,
    error,
    clearError,
  };
}