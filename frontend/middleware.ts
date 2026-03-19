import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Pages anyone can visit without being logged in:
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/verify-email",
  "/INVESTOR",
  "/upload",
];

const ADMIN_PATH = "/admin";

const isPublicPath = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname.startsWith(p));

const isAdminPath = (pathname: string) =>
  pathname === ADMIN_PATH || pathname.startsWith(`${ADMIN_PATH}/`);

async function getCurrentUserRole(
  request: NextRequest,
): Promise<string | null> {
  try {
    const res = await fetch("http://localhost:8000/auth/me", {
      method: "GET",
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const payload = (await res.json()) as { role?: string };
    return String(payload.role ?? "").toLowerCase();
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public pages through
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Backend uses HTTP-only cookies `access_token`/`refresh_token`
  const token = request.cookies.get("access_token")?.value;

  if (!token) {
    // No token → redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname); // remember where they were going
    return NextResponse.redirect(loginUrl);
  }

  // Strict role guard: only admins can access /admin routes.
  if (isAdminPath(pathname)) {
    const role = await getCurrentUserRole(request);
    if (!role) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (!role.includes("admin")) {
      const blockedUrl = new URL("/kyc", request.url);
      blockedUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(blockedUrl);
    }
  }

  return NextResponse.next();
}

// Which paths middleware runs on (not static files, not _next):
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
