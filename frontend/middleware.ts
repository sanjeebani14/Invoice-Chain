import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Pages anyone can visit without being logged in:
const PUBLIC_PATHS = ["/", "/login", "/register", "/verify-email"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public pages through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Backend uses HTTP-only cookies `access_token`/`refresh_token`
  const token = request.cookies.get("access_token")?.value;

  if (!token) {
    // No token → redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);  // remember where they were going
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Which paths middleware runs on (not static files, not _next):
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};