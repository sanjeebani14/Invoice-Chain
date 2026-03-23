"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/context/WalletContext";
import KycForm from "@/components/KycForm";
import WalletLogin from "@/components/WalletLogin";
import { getMyProfile, updateMyProfile } from "@/lib/api";
import type { ProfileMeResponse } from "@/lib/api/types";

export default function ProfilePage() {
  const { currentUser, isAuthenticated, isLoading: authLoading } = useAuth();
  const { linkedWallets } = useWallet(); 
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileData, setProfileData] = useState<ProfileMeResponse | null>(null);
  const [form, setForm] = useState({ fullName: "", phone: "", company: "" });

  useEffect(() => {
    if (isAuthenticated) {
      (async () => {
        try {
          const res = await getMyProfile();
          setProfileData(res);
          setForm({
            fullName: res.user.full_name ?? "",
            phone: res.user.phone ?? "",
            company: res.user.company_name ?? ""
          });
        } catch (err) {
          console.error("Profile fetch failed");
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [isAuthenticated]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateMyProfile({
        full_name: form.fullName,
        phone: form.phone,
        company_name: form.company
      });
      toast.success("Profile updated");
    } catch (err) {
      toast.error("Update failed");
    } finally {
      setSaving(false);
    }
  };

  const dashboardHref = currentUser?.role === "admin" 
    ? "/admin/dashboard" 
    : currentUser?.role === "investor" 
    ? "/INVESTOR/marketplace" 
    : "/upload";

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-background px-4 py-12">
      <div className="w-full max-w-5xl">
        
        <div className="mb-10 flex flex-col items-center text-center">
          <h1 className="text-4xl font-bold tracking-tight">Account Settings</h1>
          <Button variant="link" className="mt-2 text-muted-foreground" onClick={() => router.push(dashboardHref)}>
            ← Back to Dashboard
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
          
          {/* LEFT SIDE: KYC & WALLET */}
          <div className="space-y-6 md:col-span-5">
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              {/* KycForm is now embedded directly here */}
              <KycForm />
            </div>

            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Wallets</h2>
              <WalletLogin />
            </div>
          </div>

          {/* RIGHT SIDE: PROFILE FORM */}
          <div className="md:col-span-7">
            <div className="rounded-2xl border bg-card p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                <UserCircle className="h-6 w-6 text-primary" />
                <h2 className="text-xl font-semibold">Personal Details</h2>
              </div>

              <form onSubmit={onSave} className="space-y-6">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={currentUser?.email || ""} disabled className="bg-muted border-none" />
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input id="fullName" value={form.fullName} onChange={(e) => setForm({...form, fullName: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" value={form.company} onChange={(e) => setForm({...form, company: e.target.value})} />
                </div>

                <Button type="submit" disabled={saving} className="w-full sm:w-auto px-10">
                  {saving ? "Saving..." : "Update Profile"}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}