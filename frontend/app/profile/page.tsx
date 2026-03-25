"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserCircle, ArrowLeft, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import KycForm from "@/components/auth/KycForm";
import WalletLogin from "@/components/auth/WalletLogin";
import { getMyProfile, updateMyProfile } from "@/lib/api";

export default function ProfilePage() {
  const {
    user: currentUser,
    profile,
    isAuthenticated,
    isLoading: authLoading,
    refreshProfile,
  } = useAuth();

  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    company: "",
  });

  const fetchProfile = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      const res = await getMyProfile();
      setForm({
        fullName: res.user.full_name ?? "",
        phone: res.user.phone ?? "",
        company: res.user.company_name ?? "",
      });
    } catch (err) {
      toast.error("Could not load profile data.");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const isFormValid = form.fullName.trim().length > 2;

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) {
      toast.error("Full name must be at least 3 characters.");
      return;
    }

    setSaving(true);
    try {
      await updateMyProfile({
        full_name: form.fullName.trim(),
        phone: form.phone.trim(),
        company_name: form.company.trim(),
      });

      // Update global context so name changes everywhere (like TopBar)
      await refreshProfile();
      toast.success("Profile updated successfully");
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Update failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    const role = currentUser?.role?.toLowerCase();

    if (role?.includes("admin")) {
      router.push("/admin/dashboard");
      return;
    }

    if (role?.includes("investor")) router.push("/INVESTOR/marketplace");
    else router.push("/sme/dashboard");
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Loading profile...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl py-10 px-4 animate-in fade-in duration-500">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Account Settings
          </h1>
          <p className="text-muted-foreground">
            Manage your identity and blockchain connections.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleBack}
          className="hidden sm:flex"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-5">
          <KycForm />
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-4">Blockchain Links</h3>
            <WalletLogin />
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
            <div className="bg-muted/30 px-8 py-4 border-b flex items-center gap-3">
              <UserCircle className="h-5 w-5 text-primary" />
              <h2 className="font-bold">Personal Details</h2>
            </div>

            <form onSubmit={onSave} className="p-8 space-y-6">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-black text-muted-foreground">
                  Email Address
                </Label>
                <Input
                  value={currentUser?.email || ""}
                  disabled
                  className="bg-muted/50 border-dashed"
                />
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="fullName"
                    className="text-xs uppercase font-black"
                  >
                    Full Name
                  </Label>
                  <Input
                    id="fullName"
                    value={form.fullName}
                    onChange={(e) =>
                      setForm({ ...form, fullName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="phone"
                    className="text-xs uppercase font-black"
                  >
                    Phone Number
                  </Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="company"
                  className="text-xs uppercase font-black"
                >
                  Company Name
                </Label>
                <Input
                  id="company"
                  value={form.company}
                  onChange={(e) =>
                    setForm({ ...form, company: e.target.value })
                  }
                />
              </div>

              <div className="pt-4 border-t flex justify-end">
                <Button type="submit" disabled={saving || !isFormValid}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {saving ? "Saving..." : "Update Profile"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
