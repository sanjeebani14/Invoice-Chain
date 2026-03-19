import axios from "axios";
import { getBackendOrigin } from "@/lib/backendOrigin";

const BACKEND_ORIGIN = getBackendOrigin();
const API_BASE = `${BACKEND_ORIGIN}/api/v1/risk`;
const ADMIN_USERS_BASE = `${BACKEND_ORIGIN}/api/v1/admin/users`;
const ADMIN_STATS_BASE = `${BACKEND_ORIGIN}/api/v1/admin/stats`;
const ANALYTICS_BASE = `${BACKEND_ORIGIN}/api/v1/analytics`;
const INVOICE_BASE = `${BACKEND_ORIGIN}/api/v1/invoice/invoices`;

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

const adminUsersApi = axios.create({
  baseURL: ADMIN_USERS_BASE,
  timeout: 10000,
  withCredentials: true,
});

const adminStatsApi = axios.create({
  baseURL: ADMIN_STATS_BASE,
  timeout: 10000,
  withCredentials: true,
});

const analyticsApi = axios.create({
  baseURL: ANALYTICS_BASE,
  timeout: 10000,
  withCredentials: true,
});

const invoiceApi = axios.create({
  baseURL: INVOICE_BASE,
  timeout: 10000,
  withCredentials: true,
});

const authApi = axios.create({
  baseURL: `${BACKEND_ORIGIN}/auth`,
  timeout: 10000,
  withCredentials: true,
});

async function withAuthRefreshRetry<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      throw error;
    }

    const status = error.response?.status;
    if (status !== 401) {
      throw error;
    }

    try {
      await authApi.post("/refresh");
      return await request();
    } catch {
      throw error;
    }
  }
}

// Types
export interface SellerScore {
  seller_id: number;
  composite_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  credit_score?: number;
  annual_income?: number;
  loan_amount?: number;
  debt_to_income?: number;
  employment_years?: number;
  last_updated?: string;

  // Trust layer & interpretability
  insights?: string[];
  breakdown?: {
    financial_risk: number;
    relationship_stability: number;
    buyer_quality: number;
    logistics_quality: number;
    esg_score: number;
  };
  risk_contributors?: Record<string, number>;
}

export interface FraudQueueItem {
  id: number;
  invoice_id?: number;
  seller_id: number;
  risk_score: number;
  seller_composite_score?: number;
  severity?: "LOW" | "MEDIUM" | "HIGH";
  fraud_reason: string;
  anomaly_score?: number | null;
  global_anomaly_score?: number | null;
  supervised_probability?: number | null;
  amount_velocity_zscore?: number | null;
  benford_deviation?: number | null;
  net_delta_abs?: number | null;
  reasons?: string[];
  resolution_action?: "clear" | "confirm_fraud" | null;
  resolved_by?: number | null;
  created_at: string;
  status: "Pending" | "Under Review" | "Resolved";
}

export interface ManualFraudFlagPayload {
  seller_id: number;
  invoice_id?: number;
  reason: string;
  severity?: "LOW" | "MEDIUM" | "HIGH";
}

export interface InvoiceAnomalyExplanation {
  invoice_id: number;
  seller_id?: number;
  seller_composite_score?: number | null;
  status: string;
  anomaly: {
    should_flag: boolean;
    severity: "LOW" | "MEDIUM" | "HIGH";
    model_label: number;
    anomaly_score: number;
    global_anomaly_score?: number | null;
    supervised_probability?: number | null;
    amount_velocity_zscore: number;
    benford_deviation: number;
    net_delta_abs?: number;
    reasons: string[];
  };
}

export interface RiskMetrics {
  total_sellers: number;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  avg_composite_score: number;
  risk_distribution: { score_range: string; count: number }[];
  fraud_alerts_over_time: { date: string; alerts: number }[];
  seller_risk_trends: {
    month: string;
    high: number;
    medium: number;
    low: number;
  }[];
  top_high_risk_sellers: { seller_id: number; score: number }[];
  risk_level_breakdown: { level: string; count: number }[];
}

export interface AdminManagedUser {
  id: number;
  email: string;
  full_name?: string | null;
  role: "admin" | "investor" | "seller" | "sme";
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface GetAdminUsersParams {
  role?: "admin" | "investor" | "seller";
  is_active?: boolean;
}

// Platform Statistics Types
export interface PlatformStats {
  period: string;
  period_type: "monthly" | "quarterly" | "yearly";
  total_funded_volume: number;
  total_invoices_created: number;
  total_invoices_funded: number;
  repayment_metrics: {
    total_repaid: number;
    total_defaulted: number;
    repayment_rate: number;
    default_rate: number;
  };
  platform_revenue: number;
  average_invoice_yield: number;
  risk_distribution: {
    high: number;
    medium: number;
    low: number;
    avg_score: number;
  };
  sector_exposure: {
    sectors: Record<string, number>;
    top_sector: string | null;
    concentration_ratio: number;
  };
  user_metrics: {
    active_sellers: number;
    active_investors: number;
  };
}

export interface PlatformHealthMetrics {
  gmv: number;
  repayment_rate: number;
  default_rate: number;
  platform_revenue: number;
  active_sellers: number;
  active_investors: number;
  avg_risk_score: number;
  avg_invoice_yield: number;
  high_risk_invoices: number;
  top_sector: string | null;
  sector_concentration: number;
}

export interface RiskHeatmapData {
  sector_exposure: Record<string, number>;
  top_sector: string | null;
  concentration_ratio: number;
  risk_levels: {
    high: number;
    medium: number;
    low: number;
  };
  avg_score: number;
}

export interface ConcentrationBreakdownItem {
  key: string;
  volume: number;
  percentage: number;
}

export interface ConcentrationAlert {
  type: "seller" | "sector";
  key: string;
  percentage: number;
}

export interface ConcentrationAnalysis {
  total_volume: number;
  top_5_seller_share_pct: number;
  seller_breakdown: ConcentrationBreakdownItem[];
  sector_breakdown: ConcentrationBreakdownItem[];
  geo_breakdown: ConcentrationBreakdownItem[];
  alerts: ConcentrationAlert[];
  threshold_pct: number;
}

export interface InvestorSummary {
  investor_id: number;
  exposure: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  realized_xirr: number | null;
  portfolio_xirr: number | null;
  positions: number;
  concentration: ConcentrationAnalysis;
}

export interface InvestorCashFlowPoint {
  date: string;
  expected_inflow: number;
}

export interface InvestorCashFlow {
  investor_id: number;
  as_of: string;
  timeline: InvestorCashFlowPoint[];
  totals: {
    next_30_days: number;
    next_60_days: number;
    next_90_days: number;
  };
}

export interface AdminOverviewInsight {
  type: string;
  priority: "low" | "medium" | "high";
  title: string;
  description: string;
  cta_path: string;
}

export interface AdminOverview {
  kpis: {
    pending_invoices: number;
    funded_live: number;
    settled_count: number;
    pending_kyc: number;
    unresolved_fraud: number;
    overdue_live: number;
    due_today: number;
    investors_count: number;
    sellers_count: number;
  };
  actionable_insights: AdminOverviewInsight[];
}

export interface AdminPendingInvoice {
  id: number;
  invoice_number?: string | null;
  seller_name?: string | null;
  client_name?: string | null;
  amount?: number | null;
  currency?: string | null;
  due_date?: string | null;
  status: string;
  is_duplicate: boolean;
  duplicate_invoice_number_exists: boolean;
  duplicate_matches: number;
  upload_url?: string | null;
  original_filename?: string | null;
  ocr_extracted: {
    invoice_number?: string | null;
    seller_name?: string | null;
    client_name?: string | null;
    amount?: number | null;
    currency?: string | null;
    due_date?: string | null;
  };
  confidence: {
    invoice_number?: number | null;
    seller_name?: number | null;
    client_name?: number | null;
    amount?: number | null;
    due_date?: number | null;
    overall?: number | null;
  };
  created_at: string;
}

export interface AdminSettlementItem {
  id: number;
  invoice_number?: string | null;
  seller_id?: number | null;
  seller_name?: string | null;
  client_name?: string | null;
  amount?: number | null;
  ask_price?: number | null;
  status: string;
  due_date?: string | null;
  days_to_due?: number | null;
  is_overdue: boolean;
  countdown_label: string;
  can_settle: boolean;
  investor_id?: number | null;
  funded_amount?: number | null;
  created_at: string;
}

// API functions with mock fallback
export const getSellerScore = async (
  sellerId: number,
): Promise<SellerScore> => {
  const { data } = await api.get(`/score/${sellerId}`);
  return data;
};

export const getAllSellers = async (): Promise<SellerScore[]> => {
  try {
    const { data } = await api.get("/sellers");
    return data;
  } catch {
    return [];
  }
};

export const getRiskMetrics = async (): Promise<RiskMetrics> => {
  const { data } = await api.get("/admin/risk-metrics");
  return data;
};

export const getFraudQueue = async (): Promise<FraudQueueItem[]> => {
  try {
    const { data } = await api.get("/admin/fraud-queue");
    return (data as FraudQueueItem[]).map((item) => ({
      ...item,
      seller_composite_score: item.seller_composite_score ?? item.risk_score,
      severity:
        item.severity ??
        (item.risk_score >= 80
          ? "HIGH"
          : item.risk_score >= 50
            ? "MEDIUM"
            : "LOW"),
      reasons:
        item.reasons && item.reasons.length > 0
          ? item.reasons
          : item.fraud_reason
              .split("|")
              .map((part) => part.trim())
              .filter(Boolean),
    }));
  } catch {
    return [];
  }
};

export const getSellerFraudFlags = async (
  sellerId: number,
): Promise<FraudQueueItem[]> => {
  try {
    const { data } = await api.get("/admin/fraud-queue", {
      params: { seller_id: sellerId },
    });
    return (data as FraudQueueItem[]).map((item) => ({
      ...item,
      seller_composite_score: item.seller_composite_score ?? item.risk_score,
      severity:
        item.severity ??
        (item.risk_score >= 80
          ? "HIGH"
          : item.risk_score >= 50
            ? "MEDIUM"
            : "LOW"),
      reasons:
        item.reasons && item.reasons.length > 0
          ? item.reasons
          : item.fraud_reason
              .split("|")
              .map((part) => part.trim())
              .filter(Boolean),
    }));
  } catch {
    return [];
  }
};

export const manualFraudFlag = async (
  payload: ManualFraudFlagPayload,
): Promise<void> => {
  await api.post("/admin/manual-fraud-flag", payload);
};

export const explainInvoiceAnomaly = async (
  invoiceId: number,
): Promise<InvoiceAnomalyExplanation> => {
  const { data } = await api.get(`/admin/invoice-anomaly-explain/${invoiceId}`);
  return data as InvoiceAnomalyExplanation;
};

export const reviewFraudItem = async (
  id: number,
  action: "clear" | "confirm_fraud" | "approve" | "reject",
): Promise<void> => {
  await api.post(`/admin/fraud-review/${id}`, { action });
};

export const deleteFraudItem = async (id: number): Promise<void> => {
  await api.delete(`/admin/fraud-queue/${id}`);
};

export const getAdminUsers = async (
  params?: GetAdminUsersParams,
): Promise<AdminManagedUser[]> => {
  const { data } = await adminUsersApi.get<{ users: AdminManagedUser[] }>("/", {
    params,
  });
  return data.users;
};

export const updateAdminUser = async (
  userId: number,
  payload: { role?: "admin" | "investor" | "seller"; is_active?: boolean },
): Promise<AdminManagedUser> => {
  const { data } = await adminUsersApi.patch<AdminManagedUser>(
    `/${userId}`,
    payload,
  );
  return data;
};

export const createAdminUser = async (payload: {
  email: string;
  password: string;
  full_name?: string;
  role?: "admin" | "investor" | "seller";
  is_active?: boolean;
  email_verified?: boolean;
}): Promise<AdminManagedUser> => {
  const { data } = await adminUsersApi.post<AdminManagedUser>("/", payload);
  return data;
};

export const deleteAdminUser = async (userId: number): Promise<void> => {
  await adminUsersApi.delete(`/${userId}`);
};

// Platform Statistics API Methods
export const getPlatformSummary = async (
  period?: string,
  periodType: string = "monthly",
  useCache: boolean = true,
): Promise<PlatformStats> => {
  const { data } = await adminStatsApi.get<PlatformStats>("/summary", {
    params: { period, period_type: periodType, use_cache: useCache },
  });
  return data;
};

export const getPlatformTimeSeries = async (
  months: number = 12,
  useCache: boolean = true,
): Promise<{ months: number; data: PlatformStats[] }> => {
  try {
    const { data } = await adminStatsApi.get("/timeseries", {
      params: { months, use_cache: useCache },
    });
    return data;
  } catch {
    return { months, data: [] };
  }
};

export const getPlatformHealthMetrics =
  async (): Promise<PlatformHealthMetrics> => {
    try {
      const { data } =
        await adminStatsApi.get<PlatformHealthMetrics>("/health-metrics");
      return data;
    } catch {
      throw new Error("Unable to fetch health metrics");
    }
  };

export const getRiskHeatmap = async (): Promise<RiskHeatmapData> => {
  try {
    const { data } = await adminStatsApi.get<RiskHeatmapData>("/risk-heatmap");
    return data;
  } catch {
    throw new Error("Unable to fetch risk heatmap");
  }
};

export const refreshPlatformStats = async (
  period?: string,
): Promise<{ status: string; message: string; period: string }> => {
  const { data } = await adminStatsApi.post(
    "/refresh",
    {},
    { params: { period } },
  );
  return data;
};

export const getInvestorSummary = async (): Promise<InvestorSummary> => {
  const { data } = await analyticsApi.get<InvestorSummary>("/investor/summary");
  return data;
};

export const getInvestorCashFlow = async (): Promise<InvestorCashFlow> => {
  const { data } = await analyticsApi.get<InvestorCashFlow>(
    "/investor/cash-flow",
  );
  return data;
};

export const getPlatformConcentration = async (
  thresholdPct: number = 20,
): Promise<ConcentrationAnalysis> => {
  const { data } = await analyticsApi.get<ConcentrationAnalysis>(
    "/platform/concentration",
    { params: { threshold_pct: thresholdPct } },
  );
  return data;
};

export const getAdminOverview = async (): Promise<AdminOverview> => {
  const { data } = await adminStatsApi.get<AdminOverview>("/overview");
  return data;
};

export const getAdminPendingInvoices = async (params?: {
  skip?: number;
  limit?: number;
}): Promise<{ invoices: AdminPendingInvoice[]; total: number }> => {
  try {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[pending-invoices] request", {
        url: `${INVOICE_BASE}/admin/pending-review`,
        params,
      });
    }
    const { data } = await withAuthRefreshRetry(() =>
      invoiceApi.get<{
        invoices: AdminPendingInvoice[];
        total: number;
      }>("/admin/pending-review", { params }),
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[pending-invoices] error", {
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          status: error.response?.status,
          code: error.code,
          data: error.response?.data,
        });
      }
      const detail = (error.response?.data as { detail?: unknown } | undefined)
        ?.detail;
      if (typeof detail === "string" && detail.trim()) {
        throw new Error(detail);
      }
      if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0] as { msg?: string } | undefined;
        if (first?.msg) {
          throw new Error(first.msg);
        }
      }
      if (error.code === "ERR_NETWORK") {
        throw new Error(
          "Unable to reach backend (possible CORS/connection issue).",
        );
      }
      throw new Error("Unable to load pending invoices");
    }
    throw new Error("Unable to load pending invoices");
  }
};

export const reviewAdminPendingInvoice = async (
  invoiceId: number,
  action: "approve" | "reject",
): Promise<{ message: string; status: string }> => {
  const { data } = await withAuthRefreshRetry(() =>
    invoiceApi.put<{ message: string; status: string }>(
      `/${invoiceId}/review`,
      null,
      { params: { action } },
    ),
  );
  return data;
};

export const getSettlementTracker = async (params?: {
  status?: string;
  skip?: number;
  limit?: number;
}): Promise<{ items: AdminSettlementItem[]; total: number }> => {
  const { data } = await invoiceApi.get<{
    items: AdminSettlementItem[];
    total: number;
  }>("/admin/settlement-tracker", { params });
  return data;
};

export const settleInvoice = async (
  invoiceId: number,
  payload?: { repayment_amount?: number; notes?: string },
): Promise<{
  message: string;
  invoice_id: number;
  status: string;
  days_late: number;
  event_type: string;
  settled_amount: number;
  credit_event_id: number;
}> => {
  const { data } = await invoiceApi.post(`/${invoiceId}/settle`, payload ?? {});
  return data;
};
