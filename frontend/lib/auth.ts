import { api } from "./api";
import type { 
  RegisterData, 
  LoginData, 
  TwoFactorLoginData, 
  MessageResponse, 
  LoginResponse 
} from "./api/types"; // Import types from central types file

/**
 * AUTH SERVICES
 * Uses the centralized api instance to inherit 401 interceptors and cookies.
 */

// 1. Register a new account
export async function register(data: RegisterData): Promise<MessageResponse> {
  const response = await api.post<MessageResponse>("/auth/register", data);
  return response.data;
}

// 2. Standard Login
export async function login(data: LoginData): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>("/auth/login", data);
  return response.data;
}

// 3. Two-Factor Authentication Login
export async function loginWithTwoFactor(data: TwoFactorLoginData): Promise<MessageResponse> {
  const response = await api.post<MessageResponse>("/auth/login/2fa", data);
  return response.data;
}

// 4. Logout (Clears session and redirects)
export async function logout(): Promise<MessageResponse> {
  try {
    const response = await api.post<MessageResponse>("/auth/logout");
    return response.data;
  } finally {
    // Always clear the window state and redirect to login
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }
}

// 5. Explicit Token Refresh (Usually handled automatically by interceptors)
export async function refreshToken(): Promise<MessageResponse> {
  const response = await api.post<MessageResponse>("/auth/refresh");
  return response.data;
}

// 6. Password Recovery
export async function forgotPassword(email: string): Promise<MessageResponse> {
  const response = await api.post<MessageResponse>("/auth/forgot-password", { email });
  return response.data;
}

// 7. Password Reset
export async function resetPassword(token: string, newPassword: string): Promise<MessageResponse> {
  const response = await api.post<MessageResponse>("/auth/reset-password", {
    token,
    new_password: newPassword,
  });
  return response.data;
}