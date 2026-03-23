"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
// FIX: Import from centralized API
import { getMyProfile } from "@/lib/api";

const PUBLIC_PATHS = ["/", "/login", "/register", "/verify-email"];

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();

  const { currentUser, isAuthenticated, isLoading, logout } = useAuth();
  const [kycStatus, setKycStatus] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isAuthenticated) return;
      try {
        // This now uses the interceptor logic from lib/api
        const p = await getMyProfile();
        if (!mounted) return;
        setKycStatus(p?.kyc?.status ?? null);
      } catch {
        if (mounted) setKycStatus(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  const isPublicPath = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (isPublicPath) return null;
  if (!isAuthenticated && !isLoading) return null;

  const roleValue = String(currentUser?.role ?? "").toLowerCase();
  const avatarLetter = (currentUser?.email?.[0] || "U").toUpperCase();

  // FIX: Redirect to /profile instead of /kyc
  const homeHref = roleValue === "admin" ? "/admin/dashboard" : "/profile";
  const isKycPending = kycStatus === "pending" || kycStatus === "review";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur">
      {isKycPending && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-[11px] font-medium px-4 py-1 text-center">
          KYC verification in progress. Some features are currently locked.
        </div>
      )}
      <div className="flex h-14 w-full items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href={homeHref}
            className="font-bold tracking-tight text-primary"
          >
            InvoiceChain
          </Link>

          <nav className="hidden items-center gap-5 text-sm font-medium text-muted-foreground sm:flex">
            {roleValue !== "admin" && (
              <Link
                href="/profile"
                className="hover:text-foreground transition-colors"
              >
                Verification
              </Link>
            )}
            {roleValue === "investor" && (
              <Link
                href="/INVESTOR/marketplace"
                className="hover:text-foreground transition-colors"
              >
                Marketplace
              </Link>
            )}
            {(roleValue === "sme" || roleValue === "seller") && (
              <>
                <Link href="/sme/dashboard" className="hover:text-foreground">
                  SME Dashboard
                </Link>
                <Link href="/upload" className="hover:text-foreground">
                  SME Upload
                </Link>
              </>
            )}
            {roleValue === "admin" && (
              <Link href="/admin/dashboard" className="hover:text-foreground">
                Admin
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/profile")}
            className="flex h-8 w-8 items-center justify-center rounded-full border bg-muted text-xs font-bold text-foreground hover:bg-accent transition-colors"
          >
            {avatarLetter}
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-8"
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
          >
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
