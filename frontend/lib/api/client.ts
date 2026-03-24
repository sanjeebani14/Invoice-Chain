import axios from "axios";
import { getBackendOrigin } from "@/lib/backendOrigin";

const BACKEND_ORIGIN = getBackendOrigin();

export const api = axios.create({
  baseURL: `${BACKEND_ORIGIN}/api/v1`,
  timeout: 15000,
  withCredentials: true,
});

// Single interceptor for Auth Refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await axios.post(
          `${BACKEND_ORIGIN}/api/v1/auth/refresh`,
          {},
          { withCredentials: true },
        );
        return api(originalRequest);
      } catch (refreshError) {
        // Force logout if refresh fails
        if (typeof window !== "undefined") {
          const authPages = new Set([
            "/login",
            "/register",
            "/forgot-password",
            "/reset-password",
            "/verify-email",
          ]);
          if (!authPages.has(window.location.pathname)) {
            window.location.href = "/login";
          }
        }
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);
