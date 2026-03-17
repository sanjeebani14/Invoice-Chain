"use client";

import { useState } from "react";
import axios from "axios";

const API_URL = "http://localhost:8000/auth";

// ── Types ─────────────────────────────────────────────────────
export interface UserOut {
  id: number;
  email: string;
  role: string;
}

export interface VerifyEmailResponse {
  success: boolean;
  user?: UserOut;
  error?: string;
}

export interface ResendVerificationEmailResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface VerificationStatusResponse {
  success: boolean;
  verified: boolean;
  email?: string;
  verified_at?: string;
  error?: string;
}

// ── Hook ──────────────────────────────────────────────────────
export function useEmailVerification() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Verify email with verification token from email link
   *
   * @param token - One-time verification token
   * @returns Object with success status, user data (on success), or error message
   */
  const verifyEmail = async (token: string): Promise<VerifyEmailResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      if (!token || token.trim() === "") {
        throw new Error("Verification token is required");
      }

      const response = await axios.post(`${API_URL}/verify-email`, {
        token: token.trim(),
      }, { withCredentials: true });

      const data = response.data;

      setIsLoading(false);
      return {
        success: true,
        user: data.user,
      };
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.detail ||
        err.message ||
        "Failed to verify email";

      setError(errorMsg);
      setIsLoading(false);

      return {
        success: false,
        error: errorMsg,
      };
    }
  };

  /**
   * Resend verification email to user
   *
   * @param email - User's email address
   * @returns Object with success status and message, or error
   */
  const resendVerificationEmail = async (
    email: string
  ): Promise<ResendVerificationEmailResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      if (!email || email.trim() === "") {
        throw new Error("Email address is required");
      }

      const response = await axios.post(
        `${API_URL}/resend-verification-email`,
        {
          email: email.trim(),
        },
        { withCredentials: true }
      );

      const data = response.data;

      setIsLoading(false);
      return {
        success: true,
        message: data.message || "Request processed.",
      };
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.detail ||
        err.message ||
        "Failed to resend verification email";

      setError(errorMsg);
      setIsLoading(false);

      return {
        success: false,
        error: errorMsg,
      };
    }
  };

  /**
   * Check verification status of an email (optional)
   *
   * @param email - User's email address
   * @returns Object with verification status
   */
  const getVerificationStatus = async (
    email: string
  ): Promise<VerificationStatusResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      if (!email || email.trim() === "") {
        throw new Error("Email address is required");
      }

      // Note: This endpoint may need to be created in the backend
      // For now, it's a placeholder - only verified users can call auth endpoints
      const response = await axios.get(
        `${API_URL}/verification-status?email=${encodeURIComponent(
          email.trim()
        )}`
      );

      const data = response.data;

      setIsLoading(false);
      return {
        success: true,
        verified: data.email_verified,
        email: data.email,
        verified_at: data.verified_at,
      };
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.detail ||
        err.message ||
        "Failed to check verification status";

      setError(errorMsg);
      setIsLoading(false);

      return {
        success: false,
        verified: false,
        error: errorMsg,
      };
    }
  };

  /**
   * Clear error message
   */
  const clearError = () => {
    setError(null);
  };

  return {
    verifyEmail,
    resendVerificationEmail,
    getVerificationStatus,
    isLoading,
    error,
    clearError,
  };
}
