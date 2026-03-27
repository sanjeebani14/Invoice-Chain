import { api } from "./api";
import type { User, ProfileMeResponse, RiskOnboardingStatus, SellerRiskOnboardingPayload, SellerRiskOnboardingResponse } from "./types";

/**
 * USER ACCOUNT SERVICES
 */

// Get full profile including KYC status
export const getMyProfile = async (): Promise<ProfileMeResponse> => {
  const { data } = await api.get<ProfileMeResponse>("/profile/me");
  return data;
};

// Update personal/company details
export const updateMyProfile = async (payload: {
  full_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  wallet_address?: string | null;
}): Promise<User> => {
  const { data } = await api.patch<User>("/profile/me", payload);
  return data;
};

/**
 * RISK ONBOARDING
 * Specific for Sellers to determine their risk tier
 */

export const getRiskOnboardingStatus = async (): Promise<RiskOnboardingStatus> => {
  const { data } = await api.get<RiskOnboardingStatus>("/profile/risk-onboarding/status");
  return data;
};

export const submitRiskOnboarding = async (
  payload: SellerRiskOnboardingPayload,
): Promise<SellerRiskOnboardingResponse> => {
  const { data } = await api.put<SellerRiskOnboardingResponse>(
    "/profile/risk-onboarding",
    payload,
  );
  return data;
};