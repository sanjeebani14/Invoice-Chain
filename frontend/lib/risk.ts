import { riskApi, analyticsApi } from "./api";
import type { 
  SellerScore, 
  FraudQueueItem, 
  RiskMetrics, 
  ManualFraudFlagPayload, 
  InvoiceAnomalyExplanation,
  ConcentrationAnalysis 
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