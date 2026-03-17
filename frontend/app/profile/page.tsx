"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { getMyProfile, updateMyProfile } from "@/lib/profile";
import type { ProfileMeResponse } from "@/lib/profile";

export default function ProfilePage() {
  const { currentUser, isAuthenticated, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<ProfileMeResponse | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    const run = async () => {
      try {
        const res = await getMyProfile();
        setData(res);
        setFullName(res.user.full_name ?? "");
        setPhone(res.user.phone ?? "");
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const kycCta = useMemo(() => {
    const kyc = data?.kyc;
    if (!kyc) return { label: "Submit KYC", href: "/kyc", tone: "text-amber-600" };
    if (kyc.status === "approved") return { label: "KYC Approved", href: "/kyc", tone: "text-green-600" };
    if (kyc.status === "rejected") return { label: "Fix KYC", href: "/kyc", tone: "text-red-600" };
    return { label: "KYC Pending", href: "/kyc", tone: "text-amber-600" };
  }, [data]);

  const disabled = !isAuthenticated || authLoading || loading;

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateMyProfile({
        full_name: fullName,
        phone,
      });
      setData((prev) => (prev ? { ...prev, user: updated } : prev));
      toast.success("Profile updated");
    } catch (err: any) {
      const message = err?.response?.data?.detail ?? "Profile update failed";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const email = currentUser?.email ?? data?.user.email ?? "";
  const role = currentUser?.role ?? data?.user.role ?? "";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Your Profile</h1>
          <Link className="text-sm text-muted-foreground hover:underline" href="/kyc">
            KYC
          </Link>
        </div>

        <div className="mt-6 grid gap-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Email (immutable)</p>
                <p className="mt-1 font-medium">{email || "—"}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Role</p>
                <p className="mt-1 font-medium">{role || "—"}</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-background p-4">
              <div>
                <div className="text-sm text-muted-foreground">KYC</div>
                <div className={`mt-1 font-medium ${kycCta.tone}`}>{kycCta.label}</div>
              </div>
              <Button asChild variant="outline">
                <Link href={kycCta.href}>Open</Link>
              </Button>
            </div>

            {(loading || authLoading) && (
              <div className="mt-4 flex items-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Edit profile</h2>
            <form onSubmit={onSave} className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input
                  id="full_name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={disabled || saving}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={disabled || saving}
                  placeholder="+91-xxxxxxxxxx"
                />
              </div>
              <Button type="submit" disabled={disabled || saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

