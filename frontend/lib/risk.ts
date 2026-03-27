import axios from "axios";
import { riskApi, analyticsApi, adminStatsApi, withTimeoutRetry } from "./api";
import type { 
  SellerScore, 
  FraudQueueItem, 
  RiskMetrics, 
  ManualFraudFlagPayload, 
  InvoiceAnomalyExplanation,
  ConcentrationAnalysis,
  PlatformHealthMetrics,
} from "./types";

/**
 * SELLER RISK
 */
export const getSellerScore = async (sellerId: number): Promise<SellerScore> => {
  const { data } = await riskApi.get(`/score/${sellerId}`);
  return data;
};

export const getAllSellers = async (): Promise<SellerScore[]> => {
  try {
    const { data } = await riskApi.get("/sellers");
    return data;
  } catch {
    return [];
  }
};

/**
 * FRAUD MANAGEMENT (Admin)
 */

// Helper to format raw fraud data into UI-friendly items
const formatFraudItem = (item: any): FraudQueueItem => ({
  ...item,
  seller_composite_score: item.seller_composite_score ?? item.risk_score,
  severity: item.severity ?? (
    item.risk_score >= 80 ? "HIGH" : item.risk_score >= 50 ? "MEDIUM" : "LOW"
  ),
  reasons: item.reasons?.length > 0 
    ? item.reasons 
    : (item.fraud_reason || "").split("|").map((p: string) => p.trim()).filter(Boolean),
});

export const getFraudQueue = async (): Promise<FraudQueueItem[]> => {
  try {
    const { data } = await riskApi.get("/admin/fraud-queue");
    return (data as any[]).map(formatFraudItem);
  } catch {
    return [];
  }
};

export const getSellerFraudFlags = async (sellerId: number): Promise<FraudQueueItem[]> => {
  try {
    const { data } = await riskApi.get("/admin/fraud-queue", { params: { seller_id: sellerId } });
    return (data as any[]).map(formatFraudItem);
  } catch {
    return [];
  }
};

export const manualFraudFlag = async (payload: ManualFraudFlagPayload) => {
  await riskApi.post("/admin/manual-fraud-flag", payload);
};

export const reviewFraudItem = async (id: number, action: "clear" | "confirm_fraud" | "approve" | "reject") => {
  await riskApi.post(`/admin/fraud-review/${id}`, { action });
};

export const deleteFraudItem = async (id: number) => {
  await riskApi.delete(`/admin/fraud-queue/${id}`);
};

/**
 * ANOMALIES & ANALYTICS
 */

export const getRiskMetrics = async (): Promise<RiskMetrics> => {
  const { data } = await riskApi.get("/admin/risk-metrics");
  return data;
};

export const explainInvoiceAnomaly = async (invoiceId: number): Promise<InvoiceAnomalyExplanation> => {
  const { data } = await riskApi.get(`/admin/invoice-anomaly-explain/${invoiceId}`);
  return data;
};

export const getPlatformConcentration = async (thresholdPct: number = 20): Promise<ConcentrationAnalysis> => {
  const { data } = await analyticsApi.get<ConcentrationAnalysis>(
    "/platform/concentration",
    { params: { threshold_pct: thresholdPct } }
  );
  return data;
};

const mapAnyPlatformHealthMetricsToHealthMetrics = (
  data: any,
): PlatformHealthMetrics => ({
  // Support both "health-metrics" and "summary" shaped payloads.
  gmv: Number(data.gmv ?? data.total_funded_volume ?? 0),
  repayment_rate: Number(
    data.repayment_rate ?? data.repayment_metrics?.repayment_rate ?? 0,
  ),
  default_rate: Number(
    data.default_rate ?? data.repayment_metrics?.default_rate ?? 0,
  ),
  platform_revenue: Number(data.platform_revenue ?? 0),
  active_sellers: Number(
    data.active_sellers ?? data.user_metrics?.active_sellers ?? 0,
  ),
  active_investors: Number(
    data.active_investors ?? data.user_metrics?.active_investors ?? 0,
  ),
  avg_risk_score: Number(
    data.avg_risk_score ?? data.risk_distribution?.avg_score ?? data.avg_score ?? 0,
  ),
  avg_invoice_yield: Number(
    data.avg_invoice_yield ?? data.average_invoice_yield ?? 0,
  ),
  high_risk_invoices: Number(
    data.high_risk_invoices ?? data.risk_distribution?.high ?? data.high ?? 0,
  ),
  top_sector: data.top_sector ?? data.sector_exposure?.top_sector ?? null,
  sector_concentration: Number(
    data.sector_concentration ?? data.sector_exposure?.concentration_ratio ?? 0,
  ),
});

/**
 * Investor-safe platform stats.
 */
export const getInvestorPlatformHealthMetrics = async (): Promise<PlatformHealthMetrics> => {
  // Prefer the shared health-metrics endpoint. Despite living under the
  // admin router, the backend allows investors via `get_current_admin_or_investor`.
  try {
    const { data } = await withTimeoutRetry(() =>
      adminStatsApi.get<any>("/health-metrics"),
    );
    return mapAnyPlatformHealthMetricsToHealthMetrics(data);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : null;
    // Let the global axios interceptor handle auth failures (refresh/redirect).
    if (status === 401 || status === 403) throw err;

    // Fallback for older backend shapes.
    const { data } = await withTimeoutRetry(() =>
      analyticsApi.get<any>("/platform/summary"),
    );
    return mapAnyPlatformHealthMetricsToHealthMetrics(data);
  }
};