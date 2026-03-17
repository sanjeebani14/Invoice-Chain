"use client";

import { useState, useEffect, useCallback, useContext, createContext, ReactNode } from "react";
import axios from "axios";
import * as authService from "@/lib/auth";

axios.defaults.withCredentials = true;

// ── Types ─────────────────────────────────────────────────────
export interface AuthContextType {
  currentUser: authService.UserOut | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  clearError: () => void;
}

// ── Create Context ────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Auth Provider ─────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<authService.UserOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user is authenticated on mount.
  // Cookies are HTTP-only, so we can't inspect them in JS; we probe /auth/me instead.
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Try to fetch current user to verify we're authenticated
        const response = await axios.get<authService.UserOut>(
          "http://localhost:8000/auth/me",
          { withCredentials: true }
        );
        setCurrentUser(response.data);
      } catch (err) {
        // Not authenticated or endpoint doesn't exist yet
        setCurrentUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  // Login handler
  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await authService.login({ email, password });
      // After login, fetch current user
      const response = await axios.get<authService.UserOut>(
        "http://localhost:8000/auth/me",
        { withCredentials: true }
      );
      setCurrentUser(response.data);
    } catch (err: any) {
      const message = err.response?.data?.detail || "Login failed";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Logout handler
  const logout = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await authService.logout();
      setCurrentUser(null);
    } catch (err: any) {
      const message = err.response?.data?.detail || "Logout failed";
      setError(message);
      // Still clear user on the frontend even if logout API fails
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh token handler
  const refreshToken = useCallback(async () => {
    try {
      await authService.refreshToken();
      // Token refreshed, continue using current user
    } catch (err: any) {
      // If refresh fails, user is logged out
      setCurrentUser(null);
      const message = err.response?.data?.detail || "Session expired";
      setError(message);
      throw err;
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AuthContextType = {
    currentUser,
    isAuthenticated: !!currentUser,
    isLoading,
    error,
    login,
    logout,
    refreshToken,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ── useAuth Hook ──────────────────────────────────────────────
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// ── Setup Axios Interceptor for 401 Handling ──────────────────
// This runs once when module loads
if (typeof window !== "undefined") {
  let isRefreshing = false;
  let refreshSubscribers: Array<(token: string) => void> = [];

  // Subscribe to token refresh
  const subscribeTokenRefresh = (callback: (token: string) => void) => {
    refreshSubscribers.push(callback);
  };

  // Notify all subscribers when token is refreshed
  const onRefreshed = (token: string) => {
    refreshSubscribers.forEach((callback) => callback(token));
    refreshSubscribers = [];
  };

  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      console.log("[Auth Axios Interceptor] response error", error);

      // If 401 Unauthorized and we haven't already tried refresh
      if (error.response?.status === 401 && !originalRequest._retry) {
        // Check if error message indicates token expiration
        if (error.response?.data?.detail?.includes("Token expired")) {
          originalRequest._retry = true;

          if (!isRefreshing) {
            isRefreshing = true;
            try {
              // Call refresh endpoint
              await authService.refreshToken();
              isRefreshing = false;
              onRefreshed("");

              // Retry original request
              return axios(originalRequest);
            } catch (refreshError) {
              isRefreshing = false;
              refreshSubscribers = [];
              // Refresh failed, let user be logged out
              window.location.href = "/login";
              return Promise.reject(refreshError);
            }
          } else {
            // Refresh already in progress, queue this request
            return new Promise((resolve) => {
              subscribeTokenRefresh(() => {
                resolve(axios(originalRequest));
              });
            });
          }
        }
      }

      return Promise.reject(error);
    }
  );
}
