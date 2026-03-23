"use client";

import { useState, useCallback } from "react";
import axios from "axios";
import { api } from "@/lib/api";
import type { 
  VerifyEmailResponse, 
  ResendVerificationEmailResponse, 
  VerificationStatusResponse 
} from "@/lib/api/types";

export function useEmailVerification() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifyEmail = async (token: string): Promise<VerifyEmailResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      if (!token?.trim()) throw new Error("Verification token is required");

      const { data } = await api.post("/auth/verify-email", {
        token: token.trim(),
      });

      setIsLoading(false);
      return { success: true, user: data.user };
    } catch (err: unknown) {
      setIsLoading(false);
      let message = "Failed to verify email";
      
      if (axios.isAxiosError(err)) {
        message = err.response?.data?.detail || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      
      setError(message);
      return { success: false, error: message };
    }
  };

  const resendVerificationEmail = async (email: string): Promise<ResendVerificationEmailResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      if (!email?.trim()) throw new Error("Email address is required");

      const { data } = await api.post("/auth/resend-verification-email", {
        email: email.trim(),
      });

      setIsLoading(false);
      return { success: true, message: data.message || "Request processed." };
    } catch (err: unknown) {
      setIsLoading(false);
      let message = "Failed to resend verification email";
      
      if (axios.isAxiosError(err)) {
        message = err.response?.data?.detail || message;
      }
      
      setError(message);
      return { success: false, error: message };
    }
  };

  const getVerificationStatus = async (email: string): Promise<VerificationStatusResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      if (!email?.trim()) throw new Error("Email address is required");

      const { data } = await api.get(`/auth/verification-status`, {
        params: { email: email.trim() }
      });

      setIsLoading(false);
      return {
        success: true,
        verified: data.email_verified,
        email: data.email,
        verified_at: data.verified_at,
      };
    } catch (err: unknown) {
      setIsLoading(false);
      let message = "Failed to check status";
      
      if (axios.isAxiosError(err)) {
        message = err.response?.data?.detail || message;
      }
      
      setError(message);
      return { success: false, verified: false, error: message };
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