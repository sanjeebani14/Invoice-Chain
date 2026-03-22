"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const PUBLIC_PATHS = ["/", "/login", "/register", "/verify-email"];

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, isAuthenticated, isLoading, logout } = useAuth();

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")))
    return null;
  // Render bar while loading too; it should not flash/vanish.
  if (!isAuthenticated && !isLoading) return null;

  const role = currentUser?.role;
  const roleValue = String(role ?? "").toLowerCase();
  const avatarLetter = (currentUser?.email?.[0] || "U").toUpperCase();
  const homeHref =
    roleValue === "admin"
      ? "/admin/dashboard"
      : "/kyc";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur">
      <div className="flex h-14 w-full items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href={homeHref} className="font-semibold tracking-tight">
            InvoiceChain
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
            {roleValue !== "admin" && (
              <Link href="/kyc" className="hover:text-foreground">
                KYC
              </Link>
            )}
            {roleValue === "investor" && (
              <Link
                href="/INVESTOR/marketplace"
                className="hover:text-foreground"
              >
                Marketplace
              </Link>
            )}
            {(roleValue === "sme" || roleValue === "seller") && (
              <Link href="/upload" className="hover:text-foreground">
                Upload
              </Link>
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
            aria-label="Open profile"
            className="h-9 w-9 rounded-full border border-border bg-background text-sm font-semibold text-foreground shadow-sm hover:bg-accent"
          >
            {avatarLetter}
          </button>
          <Button
            variant="outline"
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
