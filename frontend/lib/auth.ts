import axios from "axios";

const AUTH_BASE = "http://localhost:8000/auth";

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

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserOut {
  id: number;
  email: string;
  role: string;
  is_active: boolean;
}

// ── Token helpers ─────────────────────────────────────────────
export const TOKEN_KEY = "invoicechain_token";

export function saveToken(token: string) {
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=3600`;
  localStorage.setItem(TOKEN_KEY, token);
}


export function getToken(): string | null {
  if (typeof window === "undefined") return null;  // SSR guard
  return localStorage.getItem(TOKEN_KEY);
}


export function removeToken() {
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// ── API calls ─────────────────────────────────────────────────
export async function register(data: RegisterData): Promise<UserOut> {
  const response = await axios.post<UserOut>(`${AUTH_BASE}/register`, data);
  return response.data;
}

export async function login(data: LoginData): Promise<TokenResponse> {
  const response = await axios.post<TokenResponse>(`${AUTH_BASE}/login`, data);
  saveToken(response.data.access_token);   // ← auto-saves on login
  return response.data;
}

export function logout() {
  removeToken();
  window.location.href = "/login";
}