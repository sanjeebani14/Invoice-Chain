import { api } from "@/lib/api";
import type { User, KycSubmissionOut } from "@/lib/api/types";

export interface ProfileMeResponse {
  user: User;
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

export async function getRiskOnboardingStatus(): Promise<RiskOnboardingStatus> {
  const { data } = await api.get<RiskOnboardingStatus>(
    "/profile/risk-onboarding/status",
  );
  return data;
}

export async function submitRiskOnboarding(
  payload: SellerRiskOnboardingPayload,
): Promise<SellerRiskOnboardingResponse> {
  const { data } = await api.put<SellerRiskOnboardingResponse>(
    "/profile/risk-onboarding",
    payload,
  );
  return data;
}
