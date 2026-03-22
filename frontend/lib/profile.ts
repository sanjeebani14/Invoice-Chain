import axios from "axios";

import type { UserOut } from "@/lib/auth";
import type { KycSubmissionOut } from "@/lib/kyc";

const PROFILE_BASE = "http://localhost:8000/api/v1/profile";

export interface ProfileMeResponse {
  user: UserOut;
  kyc: KycSubmissionOut | null;
}

export async function getMyProfile(): Promise<ProfileMeResponse> {
  const res = await axios.get<ProfileMeResponse>(`${PROFILE_BASE}/me`);
  return res.data;
}

export async function updateMyProfile(payload: {
  full_name?: string | null;
  phone?: string | null;
  wallet_address?: string | null;
}): Promise<UserOut> {
  const res = await axios.patch<UserOut>(`${PROFILE_BASE}/me`, payload);
  return res.data;
}

