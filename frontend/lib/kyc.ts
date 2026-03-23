import { api } from "./api";
import type {
  KycStatus,
  KycSubmissionOut,
  KycMeResponse,
  AdminKycListResponse,
} from "./api/types";

export type {
  KycStatus,
  KycSubmissionOut,
  KycMeResponse,
  AdminKycListResponse,
} from "./api/types";

/**
 * USER KYC SERVICES
 */

export async function getMyKyc(): Promise<KycMeResponse> {
  const { data } = await api.get<KycMeResponse>("/kyc/me");
  return data;
}

export async function submitPan(file: File): Promise<KycSubmissionOut> {
  const form = new FormData();
  form.append("file", file);

  const { data } = await api.post<KycSubmissionOut>("/kyc/submissions", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/**
 * ADMIN KYC SERVICES
 */

export async function adminListKyc(params?: {
  status_filter?: KycStatus;
  skip?: number;
  limit?: number;
}): Promise<AdminKycListResponse> {
  const { data } = await api.get<AdminKycListResponse>(
    "/admin/kyc/submissions",
    {
      params: params,
    },
  );
  return data;
}

export async function adminApproveKyc(
  submissionId: number,
): Promise<KycSubmissionOut> {
  const { data } = await api.post<KycSubmissionOut>(
    `/admin/kyc/${submissionId}/approve`,
  );
  return data;
}

export async function adminRejectKyc(
  submissionId: number,
  reason: string,
): Promise<KycSubmissionOut> {
  const { data } = await api.post<KycSubmissionOut>(
    `/admin/kyc/${submissionId}/reject`,
    {
      reason,
    },
  );
  return data;
}
