"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet"; // Added Wallet hook
import { NavLink } from "./NavLink"; // Use your new NavLink!

const PUBLIC_PATHS = ["/", "/login", "/register", "/verify-email"];

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();

  // Pull everything from Context - no local useEffect needed!
  const { user, kycStatus, isAuthenticated, isLoading, logout } = useAuth();
  const { isConnected, shortAddress, balance } = useWallet();

  const isPublicPath = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (isPublicPath || (isLoading && !isAuthenticated)) return null;

  const roleValue = user?.role?.toLowerCase() || "";
  const avatarLetter = (user?.email?.[0] || "U").toUpperCase();

  const homeHref =
    roleValue === "admin"
      ? "/admin/dashboard"
      : roleValue === "investor"
        ? "/investor/marketplace"
        : roleValue === "seller"
          ? "/sme/dashboard"
          : "/profile";
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
          <Link href={homeHref} className="font-bold tracking-tight text-primary">
            InvoiceChain
          </Link>

          <nav className="hidden items-center gap-5 text-sm font-medium text-muted-foreground sm:flex">
            {roleValue === "investor" && (
              <>
                <NavLink to="/investor/marketplace" activeClassName="text-foreground">
                  Marketplace
                </NavLink>
                <NavLink to="/investor/portfolio" activeClassName="text-foreground">
                  Portfolio
                </NavLink>
              </>
            )}
            {(roleValue === "sme" || roleValue === "seller") && (
              <>
                <NavLink to="/sme/dashboard" activeClassName="text-foreground">
                  Dashboard
                </NavLink>
                <NavLink to="/sme/invoices" activeClassName="text-foreground">
                  Invoices
                </NavLink>
                <NavLink to="/sme/upload" activeClassName="text-foreground">
                  Upload
                </NavLink>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* Wallet Status Indicator */}
          {isConnected && (
            <div className="hidden md:flex flex-col items-end mr-2">
              <span className="text-[10px] text-muted-foreground leading-none">
                {shortAddress}
              </span>
              <span className="text-[11px] font-bold text-primary leading-tight">
                {balance || "0.00"} MATIC
              </span>
            </div>
          )}

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