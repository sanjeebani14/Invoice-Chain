"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/AuthCard";
import { login, loginWithTwoFactor } from "@/lib/auth";
import { getBackendOrigin } from "@/lib/backendOrigin";
import axios from "axios";
import { getRiskOnboardingStatus } from "@/lib/profile";

const BACKEND_ORIGIN = getBackendOrigin();

function resolveRoleHome(roleValue: unknown): string {
  const role = String(roleValue ?? "").toLowerCase();
  if (role.includes("admin")) return "/admin/dashboard";
  if (role.includes("investor")) return "/kyc";
  if (role.includes("seller") || role.includes("sme")) return "/kyc";
  return "/login";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (requiresTwoFactor && twoFactorToken) {
        await loginWithTwoFactor({
          two_factor_token: twoFactorToken,
          code: twoFactorCode,
        });
      } else {
        const loginResponse = await login({ email, password });
        if (loginResponse.requires_two_factor && loginResponse.two_factor_token) {
          setRequiresTwoFactor(true);
          setTwoFactorToken(loginResponse.two_factor_token);
          toast.info("Enter your authenticator app code to continue");
          return;
        }
      }

      toast.success("Logged in successfully");
      const me = await axios.get(`${BACKEND_ORIGIN}/auth/me`, {
        withCredentials: true,
      });
      const rawRole = String(me.data?.role ?? "").toLowerCase();
      const role = rawRole.includes("admin")
        ? "admin"
        : rawRole.includes("investor")
          ? "investor"
          : "sme";

      // Admins bypass KYC flow and always land on admin dashboard.
      if (role === "admin") {
        await router.push("/admin/dashboard");
        return;
      }

      if (role === "sme") {
        const status = await getRiskOnboardingStatus();
        if (status.required) {
          await router.push("/onboarding/risk-profile");
          return;
        }
      }

      // Force non-admin users through the KYC screen after login.
      await router.push("/kyc");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Invalid email or password";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your InvoiceChain account"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
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
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-700"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        {requiresTwoFactor && (
          <div className="space-y-2">
            <Label htmlFor="two-factor-code">Authenticator code</Label>
            <Input
              id="two-factor-code"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="123456"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
              required
              autoComplete="one-time-code"
            />
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          variant="default"
          size="lg"
          disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading ? "Signing in..." : requiresTwoFactor ? "Verify and sign in" : "Sign in"}
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
