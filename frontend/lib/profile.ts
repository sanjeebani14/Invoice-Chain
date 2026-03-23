import { api } from "@/lib/api";
import type { User, KycSubmissionOut } from "@/lib/api/types";

export interface ProfileMeResponse {
  user: User;
  kyc: KycSubmissionOut | null;
}

export async function getMyProfile(): Promise<ProfileMeResponse> {
  const { data } = await api.get<ProfileMeResponse>("/profile/me");
  return data;
}

export async function updateMyProfile(payload: {
  full_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  wallet_address?: string | null;
}): Promise<User> {
  const { data } = await api.patch<User>("/profile/me", payload);
  return data;
}

