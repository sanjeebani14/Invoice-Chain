import axios from "axios";

const AUTH_BASE = "http://localhost:8000/auth";

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
}

export interface MessageResponse {
  message: string;
}

export interface UserOut {
  id: number;
  email: string;
  role: string;
  is_active: boolean;
  full_name?: string | null;
  phone?: string | null;
  email_verified: boolean;
  verified_at?: string | null;
}

// ── API calls ─────────────────────────────────────────────────
export async function register(data: RegisterData): Promise<MessageResponse> {
  const response = await axios.post<MessageResponse>(
    `${AUTH_BASE}/register`,
    data
  );
  return response.data;
}

export async function login(data: LoginData): Promise<MessageResponse> {
  const response = await axios.post<MessageResponse>(
    `${AUTH_BASE}/login`,
    data
  );
  // Tokens are automatically set in HTTP-only cookies by the backend
  // No need to save them manually
  return response.data;
}

export async function logout(): Promise<MessageResponse> {
  try {
    const response = await axios.post<MessageResponse>(
      `${AUTH_BASE}/logout`
    );
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
  const response = await axios.post<MessageResponse>(
    `${AUTH_BASE}/refresh`
  );
  // New access token is automatically set in cookie by the backend
  return response.data;
}
