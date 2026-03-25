"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import type { AxiosError } from "axios";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/AuthCard";

// Centralized Logic
import { getMyProfile, getWalletNonce, api, loginWithTwoFactor } from "@/lib/api";
import { useWallet } from "@/context/WalletContext";
import { useAuth } from "@/hooks/useAuth";
import * as web3 from "@/lib/web3";

import type { ProfileMeResponse } from "@/lib/types";

/**
 * DETERMINES THE POST-LOGIN LANDING PAGE
 * Prioritizes profile completion over dashboard access.
 */
function resolveUserDestination(profile: ProfileMeResponse): string {
  const { user, kyc } = profile;
  const role = String(user.role || "").toLowerCase();

  // Admins are always routed to admin dashboard.
  if (role.includes("admin")) return "/admin/dashboard";

  // Pending KYC users must complete profile/KYC first.
  if (kyc?.status === "pending") {
    return "/profile";
  }

  if (role.includes("investor")) return "/investor/marketplace";
  if (role.includes("seller")) return "/sme/dashboard";

  return "/profile"; // Default safety fallback
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);

  const { login: authLogin, refreshProfile } = useAuth();

  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");

  const { connectWallet, currentAccount } = useWallet();

  useEffect(() => {
    sessionStorage.removeItem("is_logged_in");
  }, []);

  /**
   * AUTHENTICATION SUCCESS HANDLER
   * Combined into a single definition.
   */
  const handlePostLoginRouting = async () => {
    try {
      const profile = await getMyProfile();
      const destination = resolveUserDestination(profile);

      router.push(destination);
    } catch (err) {
      toast.error("Failed to verify profile status");
      // Fallback to profile if check fails but session exists
      router.push("/profile");
    }
  };

  const continueWithWallet = async () => {
    setWalletLoading(true);
    try {
      if (!currentAccount) await connectWallet();
      const acct = currentAccount || (await web3.getConnectedAccounts())[0];
      if (!acct) throw new Error("No MetaMask account connected");

      const { message, nonce } = await getWalletNonce(acct);
      const signature = await web3.signMessage(message, acct);

      await api.post("/wallet/verify-signature", {
        wallet_address: acct,
        nonce,
        signature,
      });

      sessionStorage.setItem("is_logged_in", "true");
      await refreshProfile();

      toast.success("Signed in with wallet");
      await handlePostLoginRouting();
    } catch (e: unknown) {
      const message =
        (e as AxiosError<{ detail?: string }>).response?.data?.detail ||
        (e instanceof Error ? e.message : "Wallet sign-in failed");
      toast.error(message);
    } finally {
      setWalletLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (requiresTwoFactor && twoFactorToken) {
        await loginWithTwoFactor({
          two_factor_token: twoFactorToken,
          code: twoFactorCode,
        });
        sessionStorage.setItem("is_logged_in", "true");
      } else {
        const loginResult = await authLogin(email, password);
        if (loginResult.requires2FA) {
          setRequiresTwoFactor(true);
          setTwoFactorToken(loginResult.twoFactorToken ?? "");
          toast.info("Enter your authenticator code to continue");
          return;
        }
      }

      toast.success("Logged in successfully");
      await handlePostLoginRouting();
    } catch (err: unknown) {
      const message =
        (err as AxiosError<{ detail?: string }>).response?.data?.detail ||
        "Invalid credentials";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your account">
      <div className="mb-4 space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={continueWithWallet}
          disabled={walletLoading}
        >
          {walletLoading ? "Connecting..." : "Continue with MetaMask"}
        </Button>
        <div className="text-center text-xs text-muted-foreground">or</div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ... (Rest of your JSX inputs stay the same) ... */}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {requiresTwoFactor && (
          <div className="space-y-2">
            <Label htmlFor="two-factor-code">Authenticator code</Label>
            <Input
              id="two-factor-code"
              value={twoFactorCode}
              onChange={(e) =>
                setTwoFactorCode(e.target.value.replace(/\D/g, ""))
              }
              required
            />
          </div>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {requiresTwoFactor ? "Verify" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium text-foreground hover:underline"
        >
          Register
        </Link>
      </p>
    </AuthCard>
  );
}