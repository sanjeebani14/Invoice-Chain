"use client";

import React, {
  createContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  login as loginService,
  logout as logoutService,
  getMyProfile,
} from "@/lib/api";
import type { User, ProfileMeResponse, KycStatus } from "@/lib/types";
import { toast } from "sonner";

export interface AuthContextType {
  user: User | null;
  currentUser: User | null;
  profile: ProfileMeResponse | null;
  kycStatus: KycStatus | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (
    email: string,
    password: string,
  ) => Promise<{
    requires2FA?: boolean;
    twoFactorToken?: string | null;
  }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [profile, setProfile] = useState<ProfileMeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 1. Profile Synchronization
   * Added the 'is_logged_in' check to prevent unauthorized calls for guests.
   */
  const refreshProfile = useCallback(async () => {
    const hasSessionHint = sessionStorage.getItem("is_logged_in") === "true";

    if (!hasSessionHint) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    // Use a timeout to prevent infinite "loading" state
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const data = await getMyProfile();
      setProfile(data);
      clearTimeout(timeoutId);
    } catch (err: any) {
      console.error("Profile fetch error:", err);
      // If it's a 401, the interceptor will eventually redirect us anyway
      if (err.name === "AbortError") {
        toast.error("Profile load timed out. Refresh the page.");
      }
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  /**
   * 2. Login Action
   * Sets the hint on success so future refreshes are allowed.
   */
  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const res = await loginService({ email, password });
        if (res.requires_two_factor)
          return { requires2FA: true, twoFactorToken: res.two_factor_token };

        sessionStorage.setItem("is_logged_in", "true");

        // Fetch the profile immediately for app state hydration.
        const profileData = await getMyProfile();
        setProfile(profileData);

        return { requires2FA: false };
      } catch (err: any) {
        const msg = err.response?.data?.detail || "Login failed";
        setError(msg);
        throw err;
      }
    },
    [],
  );

  /**
   * 3. Logout Action
   * Clears the hint immediately.
   */
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      sessionStorage.removeItem("is_logged_in");
      await logoutService();
    } catch (err) {
      window.location.href = "/login";
    } finally {
      setProfile(null);
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value: AuthContextType = useMemo(
    () => ({
      user: profile?.user ?? null,
      currentUser: profile?.user ?? null,
      profile,
      kycStatus: (profile?.kyc?.status as KycStatus) ?? null,
      isAuthenticated: !!profile?.user,
      isLoading,
      error,
      login,
      logout,
      refreshProfile,
      clearError,
    }),
    [profile, isLoading, error, login, logout, refreshProfile, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
