import axios from "axios";
import {
  adminUsersApi,
  adminStatsApi,
  invoiceApi,
  withAuthRefreshRetry,
} from "./api";
import type {
  AdminManagedUser,
  GetAdminUsersParams,
  PlatformStats,
  PlatformHealthMetrics,
  RiskHeatmapData,
  AdminPendingInvoice,
  AdminOverview,
  BlockchainSyncStatusItem,
  AdminAuctionInvoice,
  CloseAuctionResponse,
} from "./types";

/**
 * USER MANAGEMENT
 * CRUD operations for internal platform users (Admins, Sellers, Investors)
 */

export const getAdminUsers = async (
  params?: GetAdminUsersParams,
): Promise<AdminManagedUser[]> => {
  const { data } = await adminUsersApi.get<{ users: AdminManagedUser[] }>("/", {
    params,
  });
  return data.users;
};

export const createAdminUser = async (
  payload: any,
): Promise<AdminManagedUser> => {
  const { data } = await adminUsersApi.post<AdminManagedUser>("/", payload);
  return data;
};

export const updateAdminUser = async (
  userId: number,
  payload: any,
): Promise<AdminManagedUser> => {
  const { data } = await adminUsersApi.patch<AdminManagedUser>(
    `/${userId}`,
    payload,
  );
  return data;
};

export const deleteAdminUser = async (userId: number): Promise<void> => {
  await adminUsersApi.delete(`/${userId}`);
};

/**
 * PLATFORM ANALYTICS & HEALTH
 * Global stats, health metrics, and heatmaps for the admin dashboard
 */

export const getPlatformSummary = async (
  period?: string,
  periodType = "monthly",
  useCache = true,
) => {
  const { data } = await adminStatsApi.get<PlatformStats>("/summary", {
    params: { period, period_type: periodType, use_cache: useCache },
  });
  return data;
};

export const getPlatformTimeSeries = async (
  months = 12,
  useCache = true,
  options?: { suppressErrors?: boolean },
) => {
  const suppressErrors = options?.suppressErrors ?? true;
  try {
    const { data } = await adminStatsApi.get("/timeseries", {
      params: { months, use_cache: useCache },
    });
    return data;
  } catch (error) {
    if (!suppressErrors) throw error;
    return { months, data: [] };
  }
};

export const getPlatformHealthMetrics = async (options?: {
  suppressErrors?: boolean;
}) => {
  const suppressErrors = options?.suppressErrors ?? true;
  try {
    const { data } = await withAuthRefreshRetry(() =>
      adminStatsApi.get<any>("/health-metrics"),
    );
    return mapHealthMetrics(data); // Using helper below to keep this clean
  } catch (error) {
    if (!suppressErrors) throw error;
    return HEALTH_METRICS_FALLBACK;
  }
};

export const getRiskHeatmap = async (options?: {
  suppressErrors?: boolean;
}): Promise<RiskHeatmapData> => {
  const suppressErrors = options?.suppressErrors ?? true;
  try {
    const { data } = await withAuthRefreshRetry(() =>
      adminStatsApi.get<RiskHeatmapData>("/risk-heatmap"),
    );
    return data;
  } catch (error) {
    if (!suppressErrors) throw error;
    return RISK_HEATMAP_FALLBACK;
  }
};

export const refreshPlatformStats = async (period?: string) => {
  const { data } = await adminStatsApi.post(
    "/refresh",
    {},
    { params: { period } },
  );
  return data;
};

/**
 * ADMIN INVOICE ACTIONS
 * Gatekeeping (Reviewing) and manual overrides (Closing auctions)
 */

export const getAdminPendingInvoices = async (params?: {
  skip?: number;
  limit?: number;
}) => {
  try {
    const { data } = await withAuthRefreshRetry(() =>
      invoiceApi.get<{ invoices: AdminPendingInvoice[]; total: number }>(
        "/admin/pending-review",
        { params },
      ),
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.detail ?? "Unable to load pending invoices",
      );
    }
    throw new Error("Network error occurred");
  }
};

export const reviewAdminPendingInvoice = async (
  invoiceId: number,
  action: "approve" | "reject",
) => {
  const { data } = await withAuthRefreshRetry(() =>
    invoiceApi.put(`/${invoiceId}/review`, null, { params: { action } }),
  );
  return data;
};

export const getAdminAuctionInvoices = async () => {
  const { data } = await invoiceApi.get<{
    invoices: AdminAuctionInvoice[];
    total: number;
  }>("/marketplace", { params: { limit: 200 } });
  const auctions = (data.invoices || []).filter(
    (inv) => (inv.financing_type || "").toLowerCase() === "auction",
  );
  return { invoices: auctions, total: auctions.length };
};

export const closeAuction = async (
  invoiceId: number,
  payload?: { notes?: string },
) => {
  const { data } = await invoiceApi.post<CloseAuctionResponse>(
    `/${invoiceId}/auction/close`,
    payload ?? {},
  );
  return data;
};

/**
 * SYSTEM STATUS
 * Blockchain health and general overview
 */

export const getBlockchainSyncStatus = async () => {
  const { data } = await adminStatsApi.get<{
    count: number;
    items: BlockchainSyncStatusItem[];
  }>("/blockchain-sync");
  return data;
};

export const getAdminOverview = async (): Promise<AdminOverview> => {
  const { data } = await adminStatsApi.get<AdminOverview>("/overview");
  return data;
};

/**
 * HELPERS & FALLBACKS
 */

const mapHealthMetrics = (data: any): PlatformHealthMetrics => ({
  gmv: Number(data.gmv ?? 0),
  repayment_rate: Number(data.repayment_rate ?? 0),
  default_rate: Number(data.default_rate ?? 0),
  platform_revenue: Number(data.platform_revenue ?? 0),
  active_sellers: Number(data.active_sellers ?? 0),
  active_investors: Number(data.active_investors ?? 0),
  avg_risk_score: Number(data.avg_risk_score ?? data.avg_score ?? 0),
  avg_invoice_yield: Number(data.avg_invoice_yield ?? 0),
  high_risk_invoices: Number(
    data.high_risk_invoices ?? data.high ?? data.risk_levels?.high ?? 0,
  ),
  top_sector: data.top_sector ?? null,
  sector_concentration: Number(data.sector_concentration ?? 0),
});

const HEALTH_METRICS_FALLBACK: PlatformHealthMetrics = {
  gmv: 0,
  repayment_rate: 0,
  default_rate: 0,
  platform_revenue: 0,
  active_sellers: 0,
  active_investors: 0,
  avg_risk_score: 0,
  avg_invoice_yield: 0,
  high_risk_invoices: 0,
  top_sector: null,
  sector_concentration: 0,
};

const RISK_HEATMAP_FALLBACK: RiskHeatmapData = {
  sector_exposure: {},
  top_sector: null,
  concentration_ratio: 0,
  risk_levels: { high: 0, medium: 0, low: 0 },
  avg_score: 0,
};
