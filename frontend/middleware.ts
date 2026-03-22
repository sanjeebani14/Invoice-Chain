import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Pages anyone can visit without being logged in:
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
];

const ADMIN_PATH = "/admin";
const KYC_PATH = "/kyc";

const getRoleHomePath = (role: string | null): string => {
  const value = String(role ?? "").toLowerCase();
  if (value.includes("admin")) return "/admin/dashboard";
  if (value.includes("investor")) return "/kyc";
  if (value.includes("seller") || value.includes("sme")) return "/kyc";
  return "/login";
};

const isPublicPath = (pathname: string) => {
  if (pathname === "/") {
    return true;
  }
  return PUBLIC_PATHS.some((p) => p !== "/" && pathname.startsWith(p));
};

const isAdminPath = (pathname: string) =>
  pathname === ADMIN_PATH || pathname.startsWith(`${ADMIN_PATH}/`);

async function getCurrentUserRole(
  request: NextRequest,
): Promise<string | null> {
  try {
    const host = request.nextUrl.hostname || "localhost";
    const res = await fetch(`http://${host}:8000/auth/me`, {
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

  const role = await getCurrentUserRole(request);

  if (!role) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Strict role guard: only admins can access /admin routes.
  if (isAdminPath(pathname)) {
    if (!role.includes("admin")) {
      const destination = new URL(getRoleHomePath(role), request.url);
      destination.searchParams.set("from", pathname);
      return NextResponse.redirect(destination);
    }

    return NextResponse.next();
  }

  // Admins should never be forced into KYC flow.
  if (role.includes("admin")) {
    if (pathname === KYC_PATH || pathname.startsWith(`${KYC_PATH}/`)) {
      return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

// Which paths middleware runs on (not static files, not _next):
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
