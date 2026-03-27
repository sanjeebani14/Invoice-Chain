import { kycApi, api } from "./api"; // Use kycApi for user, api for admin paths
import type {
  KycStatus,
  KycSubmissionOut,
  KycMeResponse,
  AdminKycListResponse,
} from "./types";

/**
 * USER KYC SERVICES
 */

// 1. Get current user's KYC status
export async function getMyKyc(): Promise<KycMeResponse> {
  const { data } = await kycApi.get<KycMeResponse>("/me");
  return data;
}

// 2. Submit PAN/ID Document
export async function submitPan(file: File): Promise<KycSubmissionOut> {
  const form = new FormData();
  form.append("file", file);

  const { data } = await kycApi.post<KycSubmissionOut>("/submissions", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/**
 * ADMIN KYC SERVICES
 * These use the base 'api' instance because the path starts with /admin
 */

export async function adminListKyc(params?: {
  status_filter?: KycStatus;
  skip?: number;
  limit?: number;
}): Promise<AdminKycListResponse> {
  const { data } = await api.get<AdminKycListResponse>("/admin/kyc/submissions", { 
    params 
  });
  return data;
}

export async function adminApproveKyc(submissionId: number): Promise<KycSubmissionOut> {
  const { data } = await api.post<KycSubmissionOut>(`/admin/kyc/${submissionId}/approve`);
  return data;
}

export async function adminRejectKyc(submissionId: number, reason: string): Promise<KycSubmissionOut> {
  const { data } = await api.post<KycSubmissionOut>(`/admin/kyc/${submissionId}/reject`, {
    reason,
  });
  return data;
}