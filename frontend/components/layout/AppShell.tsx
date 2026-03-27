"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { useAuth } from "@/hooks/useAuth";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, profile, isLoading } = useAuth();

  // Define exactly which pages should NOT have the App UI (TopBar/Alert)
  const isLandingPage = pathname === "/";
  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/register");
  const isKycGatedPath =
    pathname.startsWith("/sme") || pathname.startsWith("/investor");
  const isKycAlwaysAllowedPath =
    pathname.startsWith("/sme/dashboard") ||
    pathname.startsWith("/INVESTOR/marketplace");

  const role = String(user?.role || "").toLowerCase();
  const isOwnerRoute =
    (pathname.startsWith("/sme") && (role === "seller" || role === "sme")) ||
    (pathname.startsWith("/investor") && role === "investor");
  const isKycVerifiedForAccess =
    profile?.kyc?.status === "approved" || profile?.kyc?.status === "review";

  if (isLandingPage || isAuthPage) {
    return <>{children}</>;
  }

  if (
    !isLoading &&
    isKycGatedPath &&
    !isKycAlwaysAllowedPath &&
    isOwnerRoute &&
    !isKycVerifiedForAccess
  ) {
    return (
      <div className="relative min-h-screen flex flex-col">
        <TopBar />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-xl rounded-xl border bg-card p-8 text-center shadow-sm">
            <h1 className="text-2xl font-bold">KYC Not Verified</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              You cannot access this page until your KYC is submitted and under
              review or approved.
            </p>
            <div className="mt-6">
              <Link
                href="/profile"
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Go to Profile
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col">
      <TopBar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
