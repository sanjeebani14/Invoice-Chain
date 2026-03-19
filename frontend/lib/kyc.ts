import axios from "axios";

axios.defaults.withCredentials = true;

const KYC_BASE = "http://localhost:8000/api/v1/kyc";
const ADMIN_KYC_BASE = "http://localhost:8000/api/v1/admin/kyc";

export type KycStatus = "pending" | "approved" | "rejected";

export interface KycSubmissionOut {
  id: number;
  user_id: number;
  doc_type: string;
  status: KycStatus;
  original_filename?: string | null;
  size_bytes: number;
  submitted_at: string;
  reviewed_at?: string | null;
  reviewed_by?: number | null;
  rejection_reason?: string | null;
}

export interface KycMeResponse {
  kyc: KycSubmissionOut | null;
}

export async function getMyKyc(): Promise<KycMeResponse> {
  const res = await axios.get<KycMeResponse>(`${KYC_BASE}/me`);
  return res.data;
}

export async function submitPan(file: File): Promise<KycSubmissionOut> {
  const form = new FormData();
  form.append("file", file);
  const res = await axios.post<KycSubmissionOut>(
    `${KYC_BASE}/submissions`,
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
      withCredentials: true,
    },
  );
  return res.data;
}

export interface AdminKycListResponse {
  submissions: KycSubmissionOut[];
  total: number;
}

export async function adminListKyc(params?: {
  status_filter?: KycStatus;
  skip?: number;
  limit?: number;
}): Promise<AdminKycListResponse> {
  const res = await axios.get<AdminKycListResponse>(
    `${ADMIN_KYC_BASE}/submissions`,
    {
      params: params?.status_filter
        ? {
            status_filter: params.status_filter,
            skip: params.skip,
            limit: params.limit,
          }
        : { skip: params?.skip, limit: params?.limit },
      withCredentials: true,
    },
  );
  return res.data;
}

export async function adminApproveKyc(
  submissionId: number,
): Promise<KycSubmissionOut> {
  const res = await axios.post<KycSubmissionOut>(
    `${ADMIN_KYC_BASE}/${submissionId}/approve`,
    undefined,
    { withCredentials: true },
  );
  return res.data;
}

export async function adminRejectKyc(
  submissionId: number,
  reason: string,
): Promise<KycSubmissionOut> {
  const res = await axios.post<KycSubmissionOut>(
    `${ADMIN_KYC_BASE}/${submissionId}/reject`,
    { reason },
    { withCredentials: true },
  );
  return res.data;
}
