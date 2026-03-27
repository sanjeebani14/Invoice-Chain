import { api, authApi } from "./api"; // Using the specialized auth instance
import type { 
  RegisterData, 
  LoginData, 
  TwoFactorLoginData, 
  MessageResponse, 
  LoginResponse 
} from "./types";

/**
 * AUTH SERVICES
 * Uses authApi (baseURL: .../api/v1/auth)
 */

// 1. Register a new account
export async function register(data: RegisterData): Promise<MessageResponse> {
  const { data: responseData } = await authApi.post<MessageResponse>("/register", data);
  return responseData;
}

// 2. Standard Login
export async function login(data: LoginData): Promise<LoginResponse> {
  const { data: responseData } = await authApi.post<LoginResponse>("/login", data);
  return responseData;
}

// 3. Two-Factor Authentication Login
export async function loginWithTwoFactor(data: TwoFactorLoginData): Promise<MessageResponse> {
  const { data: responseData } = await authApi.post<MessageResponse>("/login/2fa", data);
  return responseData;
}

// 4. Logout (Clears session and redirects)
export async function logout(): Promise<MessageResponse> {
  try {
    // 1. Notify the backend to void the Refresh Token cookie
    const { data: responseData } = await authApi.post<MessageResponse>("/logout");
    return responseData;
  } catch (error) {
    console.error("Logout request failed, proceeding with local cleanup", error);
    return { message: "Local logout completed" };
  } finally {
    if (typeof window !== "undefined") {
      // 2. Clear LocalStorage / SessionStorage
      localStorage.clear(); 
      sessionStorage.clear();

      // 3. Reset the Interceptor state (optional but safer)
      // If your 'isRefreshing' is exported, set it to false here.
    }
  }
}

// 5. Explicit Token Refresh
export async function refreshToken(): Promise<MessageResponse> {
  const { data: responseData } = await authApi.post<MessageResponse>("/refresh");
  return responseData;
}

// 6. Password Recovery
export async function forgotPassword(email: string): Promise<MessageResponse> {
  const { data: responseData } = await authApi.post<MessageResponse>("/forgot-password", { email });
  return responseData;
}

// 7. Password Reset
export async function resetPassword(token: string, newPassword: string): Promise<MessageResponse> {
  const { data: responseData } = await authApi.post<MessageResponse>("/reset-password", {
    token,
    new_password: newPassword,
  });
  return responseData;
}