import axios from "axios";
import { getBackendOrigin } from "@/lib/backendOrigin";

import type { UserOut } from "@/lib/auth";
import type { KycSubmissionOut } from "@/lib/kyc";

const PROFILE_BASE = `${getBackendOrigin()}/api/v1/profile`;

export interface ProfileMeResponse {
  user: UserOut;
  kyc: KycSubmissionOut | null;
}

export interface RiskOnboardingStatus {
  required: boolean;
  completed: boolean;
  missing_fields: string[];
  seller_id: number;
}

export interface SellerRiskOnboardingPayload {
  payment_history_score: number;
  client_reputation_score: number;
  seller_track_record: number;
  employment_years: number;
  debt_to_income: number;
  core_enterprise_rating: number;
  transaction_stability: number;
  logistics_consistency: number;
  esg_score: number;
}

export interface SellerRiskOnboardingResponse {
  message: string;
  seller_id: number;
  composite_score: number;
  risk_level: string;
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

export async function getRiskOnboardingStatus(): Promise<RiskOnboardingStatus> {
  const res = await axios.get<RiskOnboardingStatus>(
    `${PROFILE_BASE}/risk-onboarding/status`,
    { withCredentials: true },
  );
  return res.data;
}

export async function submitRiskOnboarding(
  payload: SellerRiskOnboardingPayload,
): Promise<SellerRiskOnboardingResponse> {
  const res = await axios.put<SellerRiskOnboardingResponse>(
    `${PROFILE_BASE}/risk-onboarding`,
    payload,
    { withCredentials: true },
  );
  return res.data;
}
