import axios from "axios";
import { getBackendOrigin } from "@/lib/backendOrigin";

const AUTH_BASE = `${getBackendOrigin()}/auth`;

// Configure axios to send cookies with requests
axios.defaults.withCredentials = true;

// ── Types ─────────────────────────────────────────────────────
export interface RegisterData {
  email: string;
  password: string;
  role: "sme" | "investor" | "admin";
}

export interface LoginData {
  email: string;
  password: string;
  two_factor_code?: string;
}

export interface TwoFactorLoginData {
  two_factor_token: string;
  code: string;
}

export interface MessageResponse {
  message: string;
}

export interface LoginResponse extends MessageResponse {
  requires_two_factor?: boolean;
  two_factor_token?: string | null;
}

export interface ForgotPasswordData {
  email: string;
}

export interface ResetPasswordData {
  token: string;
  new_password: string;
}

export interface UserOut {
  id: number;
  email: string;
  role: string;
  is_active: boolean;
  full_name?: string | null;
  phone?: string | null;
  wallet_address?: string | null;
  two_factor_enabled?: boolean;
  email_verified: boolean;
  verified_at?: string | null;
}

// ── API calls ─────────────────────────────────────────────────
export async function register(data: RegisterData): Promise<MessageResponse> {
  const response = await axios.post<MessageResponse>(
    `${AUTH_BASE}/register`,
    data,
  );
  return response.data;
}

export async function login(data: LoginData): Promise<LoginResponse> {
  const response = await axios.post<LoginResponse>(
    `${AUTH_BASE}/login`,
    data,
  );
  return response.data;
}

export async function loginWithTwoFactor(
  data: TwoFactorLoginData,
): Promise<MessageResponse> {
  const response = await axios.post<MessageResponse>(`${AUTH_BASE}/login/2fa`, data);
  return response.data;
}

export async function logout(): Promise<MessageResponse> {
  try {
    const response = await axios.post<MessageResponse>(`${AUTH_BASE}/logout`);
    // Cookies are automatically cleared by the backend
    window.location.href = "/login";
    return response.data;
  } catch (error) {
    // Even if logout fails, clear local state and redirect
    window.location.href = "/login";
    throw error;
  }
}

export async function refreshToken(): Promise<MessageResponse> {
  const response = await axios.post<MessageResponse>(`${AUTH_BASE}/refresh`);
  // New access token is automatically set in cookie by the backend
  return response.data;
}

export async function forgotPassword(
  data: ForgotPasswordData,
): Promise<MessageResponse> {
  const response = await axios.post<MessageResponse>(
    `${AUTH_BASE}/forgot-password`,
    data,
  );
  return response.data;
}

export async function resetPassword(
  data: ResetPasswordData,
): Promise<MessageResponse> {
  const response = await axios.post<MessageResponse>(
    `${AUTH_BASE}/reset-password`,
    data,
  );
  return response.data;
}
