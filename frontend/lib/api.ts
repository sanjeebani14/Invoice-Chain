import axios from "axios";
import { getBackendOrigin } from "@/lib/backendOrigin";

// 1. Fixed the import path and added all missing types
import type {
  SellerScore,
  FraudQueueItem,
  RiskMetrics,
  AdminManagedUser,
  ManualFraudFlagPayload,
  InvoiceAnomalyExplanation,
  GetAdminUsersParams,
  PlatformStats,
  PlatformHealthMetrics,
  RiskHeatmapData,
  ConcentrationAnalysis,
  InvestorSummary,
  InvestorCashFlow,
  InvestorInvestmentsResponse,
  AdminOverview,
  BlockchainSyncStatusItem,
  MarketplaceInvoiceItem,
  MarketplaceListingItem,
  MarketplaceListingUpdatePayload,
  SettlementHistoryItem,
  AdminPendingInvoice,
  AdminSettlementItem,
  AdminAuctionInvoice,
  InvoiceBidItem,
  CloseAuctionResponse,
  ProfileMeResponse,
} from "./api/types";

export type {
  ConcentrationBreakdownItem,
  SellerScore,
  FraudQueueItem,
  RiskMetrics,
  AdminManagedUser,
  ManualFraudFlagPayload,
  InvoiceAnomalyExplanation,
  GetAdminUsersParams,
  PlatformStats,
  PlatformHealthMetrics,
  RiskHeatmapData,
  ConcentrationAnalysis,
  InvestorSummary,
  InvestorCashFlow,
  InvestorInvestmentItem,
  InvestorInvestmentsResponse,
  AdminOverview,
  BlockchainSyncStatusItem,
  MarketplaceInvoiceItem,
  MarketplaceListingItem,
  MarketplaceListingUpdatePayload,
  SettlementHistoryItem,
  AdminPendingInvoice,
  AdminSettlementItem,
  AdminAuctionInvoice,
  InvoiceBidItem,
  CloseAuctionResponse,
  ProfileMeResponse,
} from "./api/types";

const BACKEND_ORIGIN = getBackendOrigin();
const API_BASE = `${BACKEND_ORIGIN}/api/v1`;

const DEFAULT_TIMEOUT_MS = 10000;
const INVESTOR_FLOW_TIMEOUT_MS = 30000;

// Axios Instances
export const api = axios.create({
  baseURL: API_BASE,
  timeout: DEFAULT_TIMEOUT_MS,
  withCredentials: true,
});

const adminUsersApi = axios.create({
  baseURL: `${API_BASE}/admin/users`,
  timeout: DEFAULT_TIMEOUT_MS,
  withCredentials: true,
});

const adminStatsApi = axios.create({
  baseURL: `${API_BASE}/admin/stats`,
  timeout: DEFAULT_TIMEOUT_MS,
  withCredentials: true,
});

const analyticsApi = axios.create({
  baseURL: `${API_BASE}/analytics`,
  timeout: INVESTOR_FLOW_TIMEOUT_MS,
  withCredentials: true,
});

const invoiceApi = axios.create({
  baseURL: `${API_BASE}/invoice`,
  timeout: INVESTOR_FLOW_TIMEOUT_MS,
  withCredentials: true,
});

const authApi = axios.create({
  baseURL: `${API_BASE}/auth`,
  timeout: DEFAULT_TIMEOUT_MS,
  withCredentials: true,
});

/**
 * AUTH REFRESH RETRY LOGIC
 */
async function withAuthRefreshRetry<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!axios.isAxiosError(error)) throw error;
    if (error.response?.status !== 401) throw error;

    try {
      await authApi.post("/refresh");
      return await request();
    } catch {
      throw error;
    }
  }
}

// Export helper so callers can wrap requests that need auth refresh retry
export { withAuthRefreshRetry };

/**
 * WALLET SERVICES
 * Handles blockchain wallet linking and nonce generation
 */

// 1. Get a unique nonce from the backend to sign with MetaMask
export const getWalletNonce = async (walletAddress: string) => {
  const { data } = await api.post("/wallet/nonce", {
    wallet_address: walletAddress,
  });
  return data; // Returns { nonce: string }
};

// 2. Link the signed wallet to the currently logged-in user
export const linkWallet = async (payload: {
  wallet_address: string;
  nonce: string;
  signature: string;
}) => {
  const { data } = await api.post("/wallet/link", payload);
  return data;
};

// 3. Remove a wallet link from the account
export const unlinkWallet = async (address: string) => {
  const { data } = await api.delete(`/wallet/${address}`);
  return data;
};

// 4. Trigger a balance refresh from the blockchain RPC
export const refreshWalletBalance = async (address: string) => {
  const { data } = await api.post(`/wallet/${address}/balance`);
  return data;
};

/**
 * PROFILE & AUTH HELPERS
 */
export const getMyProfile = async (): Promise<ProfileMeResponse> => {
  const { data } = await api.get<ProfileMeResponse>("/profile/me");
  return data;
};

export const updateMyProfile = async (payload: {
  full_name?: string;
  phone?: string;
  company_name?: string;
  wallet_address?: string;
}) => {
  const { data } = await api.patch("/profile/me", payload);
  return data;
};

// API functions with mock fallback
export const getSellerScore = async (
  sellerId: number,
): Promise<SellerScore> => {
  const { data } = await api.get(`/risk/score/${sellerId}`);
  return data;
};

export const getAllSellers = async (): Promise<SellerScore[]> => {
  try {
    const { data } = await api.get("/risk/sellers");
    return data;
  } catch {
    return [];
  }
};

export const getRiskMetrics = async (): Promise<RiskMetrics> => {
  const { data } = await api.get("/risk/admin/risk-metrics");
  return data;
};

export const getFraudQueue = async (): Promise<FraudQueueItem[]> => {
  try {
    const { data } = await api.get("/risk/admin/fraud-queue");
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
    const { data } = await api.get("/risk/admin/fraud-queue", {
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
  await api.post("/risk/admin/manual-fraud-flag", payload);
};

export const explainInvoiceAnomaly = async (
  invoiceId: number,
): Promise<InvoiceAnomalyExplanation> => {
  const { data } = await api.get(
    `/risk/admin/invoice-anomaly-explain/${invoiceId}`,
  );
  return data as InvoiceAnomalyExplanation;
};

export const reviewFraudItem = async (
  id: number,
  action: "clear" | "confirm_fraud" | "approve" | "reject",
): Promise<void> => {
  await api.post(`/risk/admin/fraud-review/${id}`, { action });
};

export const deleteFraudItem = async (id: number): Promise<void> => {
  await api.delete(`/risk/admin/fraud-queue/${id}`);
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
      // Failed to fetch health metrics — return a safe default
      return {
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
      } as PlatformHealthMetrics;
    }
  };

export const getRiskHeatmap = async (): Promise<RiskHeatmapData> => {
  try {
    const { data } = await withAuthRefreshRetry(() =>
      adminStatsApi.get<RiskHeatmapData>("/risk-heatmap"),
    );
    return data;
  } catch {
    // Keep analytics page usable even when this optional widget is unavailable.
    return {
      sector_exposure: {},
      top_sector: null,
      concentration_ratio: 0,
      risk_levels: {
        high: 0,
        medium: 0,
        low: 0,
      },
      avg_score: 0,
    };
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

export const getInvestorInvestments =
  async (): Promise<InvestorInvestmentsResponse> => {
    const { data } = await analyticsApi.get<InvestorInvestmentsResponse>(
      "/investor/investments",
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

export const getBlockchainSyncStatus = async (): Promise<{
  count: number;
  items: BlockchainSyncStatusItem[];
}> => {
  const { data } = await adminStatsApi.get<{
    count: number;
    items: BlockchainSyncStatusItem[];
  }>("/blockchain-sync");
  return data;
};

export const getAdminPendingInvoices = async (params?: {
  skip?: number;
  limit?: number;
}) => {
  try {
    // This part is just for your dev console
    if (process.env.NODE_ENV !== "production") {
      console.debug("[pending-invoices] request", {
        // We use the baseURL from the instance + the relative path
        url: `${invoiceApi.defaults.baseURL}/admin/pending-review`,
        params,
      });
    }

    const { data } = await withAuthRefreshRetry(
      () =>
        invoiceApi.get<{
          invoices: AdminPendingInvoice[];
          total: number;
        }>("/admin/pending-review", { params }), // Just use the relative path here
    );

    return data;
  } catch (error) {
    // Keep your detailed error handling so you don't get silent 500s
    if (axios.isAxiosError(error)) {
      const detail = error.response?.data?.detail;
      const message =
        typeof detail === "string" ? detail : "Unable to load pending invoices";
      throw new Error(message);
    }
    throw new Error("Network error occurred");
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

export const getAdminAuctionInvoices = async (): Promise<{
  invoices: AdminAuctionInvoice[];
  total: number;
}> => {
  const { data } = await invoiceApi.get<{
    invoices: AdminAuctionInvoice[];
    total: number;
  }>("/marketplace", { params: { limit: 200 } });

  const auctions = (data.invoices || []).filter(
    (inv) => (inv.financing_type || "").toLowerCase() === "auction",
  );

  return {
    invoices: auctions,
    total: auctions.length,
  };
};

export const getMarketplaceInvoices = async (params?: {
  skip?: number;
  limit?: number;
}): Promise<{ invoices: MarketplaceInvoiceItem[]; total: number }> => {
  const { data } = await invoiceApi.get<{
    invoices: MarketplaceInvoiceItem[];
    total: number;
  }>("/marketplace", { params });
  return data;
};

export const fundInvoice = async (
  invoiceId: number,
  payload: { investment_amount?: number; shares?: number; notes?: string },
): Promise<{ message: string; invoice_id: number; status: string }> => {
  const { data } = await invoiceApi.post<{
    message: string;
    invoice_id: number;
    status: string;
  }>(`/${invoiceId}/fund`, payload);
  return data;
};

export const placeInvoiceBid = async (
  invoiceId: number,
  amount: number,
): Promise<{
  message: string;
  invoice_id: number;
  bid_id: number;
  highest_bid: number;
}> => {
  const { data } = await invoiceApi.post<{
    message: string;
    invoice_id: number;
    bid_id: number;
    highest_bid: number;
  }>(`/${invoiceId}/bids`, { amount });
  return data;
};

export const getMarketplaceListings = async (params?: {
  status?: string;
  skip?: number;
  limit?: number;
}): Promise<{ items: MarketplaceListingItem[]; total: number }> => {
  const { data } = await invoiceApi.get<{
    items: MarketplaceListingItem[];
    total: number;
  }>("/listings", { params });
  return data;
};

export const updateMarketplaceListing = async (
  listingId: number,
  payload: MarketplaceListingUpdatePayload,
): Promise<{ message: string; listing_id: number; status: string }> => {
  const { data } = await invoiceApi.put<{
    message: string;
    listing_id: number;
    status: string;
  }>(`/listings/${listingId}`, payload);
  return data;
};

export const cancelMarketplaceListing = async (
  listingId: number,
): Promise<{ message: string; listing_id: number }> => {
  const { data } = await invoiceApi.delete<{
    message: string;
    listing_id: number;
  }>(`/listings/${listingId}`);
  return data;
};

export const getSettlementHistory = async (params?: {
  skip?: number;
  limit?: number;
}): Promise<{ items: SettlementHistoryItem[]; total: number }> => {
  const { data } = await invoiceApi.get<{
    items: SettlementHistoryItem[];
    total: number;
  }>("/settlements/history", { params });
  return data;
};

export const confirmSettlement = async (
  invoiceId: number,
  payload?: { notes?: string },
): Promise<{ message: string; settlement_id: number; status: string }> => {
  const { data } = await invoiceApi.post<{
    message: string;
    settlement_id: number;
    status: string;
  }>(`/settlements/${invoiceId}/confirm`, payload ?? {});
  return data;
};

export const getInvoiceBids = async (
  invoiceId: number,
): Promise<{
  invoice_id: number;
  bids: InvoiceBidItem[];
  highest_bid?: number | null;
  next_min_bid?: number;
  my_active_bid_id?: number | null;
}> => {
  const { data } = await invoiceApi.get<{
    invoice_id: number;
    bids: InvoiceBidItem[];
    highest_bid?: number | null;
    next_min_bid?: number;
    my_active_bid_id?: number | null;
  }>(`/${invoiceId}/bids`);
  return data;
};

export const cancelMyActiveBid = async (
  invoiceId: number,
): Promise<{
  message: string;
  invoice_id: number;
  canceled_bid_id: number;
  highest_bid?: number | null;
  next_min_bid?: number;
}> => {
  const { data } = await invoiceApi.post(`/${invoiceId}/bids/cancel-my-active`);
  return data;
};

export const closeAuction = async (
  invoiceId: number,
  payload?: { notes?: string },
): Promise<CloseAuctionResponse> => {
  const { data } = await invoiceApi.post<CloseAuctionResponse>(
    `/${invoiceId}/auction/close`,
    payload ?? {},
  );
  return data;
};

export default api;
