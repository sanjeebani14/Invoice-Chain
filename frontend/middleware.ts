import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getBackendOrigin } from "@/lib/backendOrigin";

const PUBLIC_PATHS = ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password"];
const AUTH_PATHS = ["/login", "/register"]; // Paths users shouldn't see if logged in

async function getRole(request: NextRequest): Promise<string | null> {
  try {
    const res = await fetch(`${getBackendOrigin()}/api/v1/auth/me`, {
      method: "GET",
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const payload = await res.json();
    return String(payload.role ?? "").toLowerCase();
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // 1. Define path types
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p)) || pathname === "/";
  const isAuthPage = AUTH_PATHS.some(p => pathname.startsWith(p));
  
  // 2. Check for ANY session cookie (Access OR Refresh)
  const hasSession = request.cookies.has("access_token") || request.cookies.has("refresh_token");

  // 3. Logic for Logged-out users
  if (!hasSession && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Logic for Logged-in users
  if (hasSession) {
    const role = await getRole(request);

    // If session is actually invalid/expired on backend
    if (!role && !isPublic) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      // Clear cookies to stop the loop
      response.cookies.delete("access_token");
      response.cookies.delete("refresh_token");
      return response;
    }

    // Redirect AWAY from login if already authenticated
    if (role && isAuthPage) {
      const dashboard = role.includes("admin") ? "/admin/dashboard" : "/profile";
      return NextResponse.redirect(new URL(dashboard, request.url));
    }

    // Admin Guard
    if (pathname.startsWith("/admin") && !role?.includes("admin")) {
      return NextResponse.redirect(new URL("/profile", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};