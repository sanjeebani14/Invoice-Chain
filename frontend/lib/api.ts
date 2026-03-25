import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { getBackendOrigin } from "./backendOrigin";

// CONSTANTS
const API_BASE = `${getBackendOrigin()}/api/v1`;
const AUTH_REFRESH_URL = `${API_BASE}/auth/refresh`;
const LOGIN_REDIRECT = "/login?expired=true";

const DEFAULT_TIMEOUT = 10000;
const INVESTOR_TIMEOUT = 60000;
const RETRY_DELAY = 400;

// TYPE DEFINITIONS
interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

// STATE
let isRefreshing = false;
let failedQueue: PendingRequest[] = [];

// 1. Create a "Silent" instance for refreshing
// This instance MUST NOT have a 401 interceptor attached to it.
const silentRefreshApi = axios.create({
  withCredentials: true,
  timeout: DEFAULT_TIMEOUT,
});

const processQueue = (error: any | null = null) => {
  failedQueue.forEach((promise) => {
    error ? promise.reject(error) : promise.resolve(null);
  });
  failedQueue = [];
};

/**
 * MASTER INTERCEPTOR
 * Handles 401s, token refreshing, and request queuing.
 */
const responseInterceptor = async (error: AxiosError) => {
  const config = error.config as InternalAxiosRequestConfig & {
    _retry?: boolean;
  };

  // 1. Guard: If not 401, or already retried, or it's a login/refresh path, bail.
  const isAuthPath = config?.url?.includes("/auth/");
  if (
    !config ||
    error.response?.status !== 401 ||
    config._retry ||
    isAuthPath
  ) {
    return Promise.reject(error);
  }

  // 2. If a refresh is already in progress, queue this request.
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    })
      .then(() => {
        // USE THE INSTANCE THAT FAILED, NOT GLOBAL AXIOS
        // config.adapter or a reference to the instance is needed.
        // Easiest way: create a retry helper or use the instance directly.
        return api(config);
      })
      .catch((err) => Promise.reject(err));
  }

  config._retry = true;
  isRefreshing = true;

  try {
    await silentRefreshApi.post(AUTH_REFRESH_URL);
    processQueue(null);
    
    return api(config);
  } catch (refreshError) {
    processQueue(refreshError);

    if (typeof window !== "undefined") {
      // Force clear state
      sessionStorage.clear();

      if (!window.location.pathname.includes("/login")) {
        window.location.href = `${LOGIN_REDIRECT}&reason=session_expired`;
      }
    }
    return Promise.reject(refreshError);
  } finally {
    isRefreshing = false;
  }
};

// INSTANCE CREATOR
const createInstance = (subPath: string, timeout = DEFAULT_TIMEOUT) => {
  const instance = axios.create({
    baseURL: subPath ? `${API_BASE}${subPath}` : API_BASE,
    timeout,
    withCredentials: true,
  });

  // Attach the Master Interceptor
  instance.interceptors.response.use((res) => res, responseInterceptor);
  return instance;
};

// EXPORTED INSTANCES
export const api = createInstance("");
export const authApi = createInstance("/auth");
export const adminUsersApi = createInstance("/admin/users");
export const adminStatsApi = createInstance("/admin/stats");
export const riskApi = createInstance("/risk");
export const kycApi = createInstance("/kyc");
export const analyticsApi = createInstance("/analytics", INVESTOR_TIMEOUT);
export const invoiceApi = createInstance("/invoice", INVESTOR_TIMEOUT);
export const profileApi = createInstance("/profile");
export const walletApi = createInstance("/wallet");

// RETRY HELPERS
export async function withAuthRefreshRetry<T>(
  request: () => Promise<T>,
): Promise<T> {
  try {
    return await request();
  } catch (error: any) {
    if (error.response?.status === 401) {
      try {
        await axios.post(AUTH_REFRESH_URL, {}, { withCredentials: true });
        return await request();
      } catch {
        throw error;
      }
    }
    throw error;
  }
}

export async function withTimeoutRetry<T>(
  request: () => Promise<T>,
  retries = 1,
): Promise<T> {
  try {
    return await request();
  } catch (error: any) {
    const isTimeout =
      error.code === "ECONNABORTED" ||
      String(error.message).toLowerCase().includes("timeout");
    if (retries > 0 && isTimeout) {
      await new Promise((res) => setTimeout(res, RETRY_DELAY));
      return withTimeoutRetry(request, retries - 1);
    }
    throw error;
  }
}
// RE-EXPORTS (Barrel Logic)
export * from "./auth";
export * from "./profile";
export * from "./wallet";
export * from "./invoices";
export * from "./risk";
export * from "./admin";
export * from "./kyc";
export * from "./web3";
export * from "./realtime";
export * from "./types";

export default api;
