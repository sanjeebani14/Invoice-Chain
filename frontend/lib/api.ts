import axios from "axios";

const API_BASE = "http://localhost:8000/api/v1/risk";
const ADMIN_USERS_BASE = "http://localhost:8000/api/v1/admin/users";
const ADMIN_STATS_BASE = "http://localhost:8000/api/v1/admin/stats";

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
  severity?: "LOW" | "MEDIUM" | "HIGH";
  fraud_reason: string;
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
  status: string;
  anomaly: {
    should_flag: boolean;
    severity: "LOW" | "MEDIUM" | "HIGH";
    model_label: number;
    anomaly_score: number;
    amount_velocity_zscore: number;
    benford_deviation: number;
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

// Mock data generators
const generateMockSellers = (): SellerScore[] => {
  const levels: ("LOW" | "MEDIUM" | "HIGH")[] = ["LOW", "MEDIUM", "HIGH"];
  return Array.from({ length: 50 }, (_, i) => ({
    seller_id: 1001 + i,
    composite_score: Math.round(Math.random() * 100),
    risk_level: levels[Math.floor(Math.random() * 3)],
    credit_score: 300 + Math.floor(Math.random() * 550),
    annual_income: 30000 + Math.floor(Math.random() * 170000),
    loan_amount: 5000 + Math.floor(Math.random() * 95000),
    debt_to_income: +(Math.random() * 0.6).toFixed(2),
    employment_years: Math.floor(Math.random() * 25),
    last_updated: new Date(
      Date.now() - Math.random() * 30 * 86400000,
    ).toISOString(),
  }));
};

const generateMockMetrics = (): RiskMetrics => ({
  total_sellers: 1247,
  high_risk: 89,
  medium_risk: 342,
  low_risk: 816,
  avg_composite_score: 34.7,
  risk_distribution: [
    { score_range: "0-10", count: 120 },
    { score_range: "11-20", count: 180 },
    { score_range: "21-30", count: 220 },
    { score_range: "31-40", count: 190 },
    { score_range: "41-50", count: 160 },
    { score_range: "51-60", count: 130 },
    { score_range: "61-70", count: 100 },
    { score_range: "71-80", count: 80 },
    { score_range: "81-90", count: 45 },
    { score_range: "91-100", count: 22 },
  ],
  fraud_alerts_over_time: Array.from({ length: 14 }, (_, i) => ({
    date: new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10),
    alerts: Math.floor(Math.random() * 15) + 2,
  })),
  seller_risk_trends: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map(
    (month) => ({
      month,
      high: Math.floor(Math.random() * 30) + 60,
      medium: Math.floor(Math.random() * 80) + 280,
      low: Math.floor(Math.random() * 100) + 750,
    }),
  ),
  top_high_risk_sellers: Array.from({ length: 10 }, () => ({
    seller_id: 1001 + Math.floor(Math.random() * 50),
    score: 85 + Math.floor(Math.random() * 15),
  })),
  risk_level_breakdown: [
    { level: "LOW", count: 816 },
    { level: "MEDIUM", count: 342 },
    { level: "HIGH", count: 89 },
  ],
});

const generateMockFraudQueue = (): FraudQueueItem[] => {
  const reasons = [
    "Abnormal transaction pattern",
    "Credit score anomaly",
    "High debt-to-income ratio",
    "Suspicious loan activity",
    "Multiple flagged invoices",
  ];
  const statuses: FraudQueueItem["status"][] = [
    "Pending",
    "Under Review",
    "Resolved",
  ];
  return Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    invoice_id: 5000 + i,
    seller_id: 1001 + Math.floor(Math.random() * 50),
    risk_score: 65 + Math.floor(Math.random() * 35),
    severity:
      Math.random() > 0.66 ? "HIGH" : Math.random() > 0.5 ? "MEDIUM" : "LOW",
    fraud_reason: reasons[Math.floor(Math.random() * reasons.length)],
    created_at: new Date(
      Date.now() - Math.random() * 14 * 86400000,
    ).toISOString(),
    status: statuses[Math.floor(Math.random() * statuses.length)],
  }));
};

// Cached mock data
let mockSellers: SellerScore[] | null = null;
let mockFraudQueue: FraudQueueItem[] | null = null;

const getMockSellers = () => {
  if (!mockSellers) mockSellers = generateMockSellers();
  return mockSellers;
};

const getMockFraudQueue = () => {
  if (!mockFraudQueue) mockFraudQueue = generateMockFraudQueue();
  return mockFraudQueue;
};

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
      severity:
        item.severity ??
        (item.risk_score >= 80
          ? "HIGH"
          : item.risk_score >= 50
            ? "MEDIUM"
            : "LOW"),
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
      severity:
        item.severity ??
        (item.risk_score >= 80
          ? "HIGH"
          : item.risk_score >= 50
            ? "MEDIUM"
            : "LOW"),
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
  action: string,
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

// Mock data generators for platform stats
const generateMockPlatformStats = (period?: string): PlatformStats => ({
  period: period || "2025-03",
  period_type: "monthly",
  total_funded_volume: 2450000,
  total_invoices_created: 248,
  total_invoices_funded: 145,
  repayment_metrics: {
    total_repaid: 128,
    total_defaulted: 5,
    repayment_rate: 88.28,
    default_rate: 3.45,
  },
  platform_revenue: 49000,
  average_invoice_yield: 4.75,
  risk_distribution: {
    high: 12,
    medium: 48,
    low: 85,
    avg_score: 32.5,
  },
  sector_exposure: {
    sectors: {
      Manufacturing: 35.2,
      Retail: 28.5,
      Services: 22.3,
      Technology: 14.0,
    },
    top_sector: "Manufacturing",
    concentration_ratio: 86.0,
  },
  user_metrics: {
    active_sellers: 342,
    active_investors: 189,
  },
});

const generateMockTimeSeries = (
  months: number,
): { months: number; data: PlatformStats[] } => {
  const data: PlatformStats[] = [];
  const baseVolume = 1000000;
  const baseInvoices = 120;

  for (let i = months; i > 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - (i - 1));
    const period = date.toISOString().substring(0, 7);

    data.push({
      period,
      period_type: "monthly",
      total_funded_volume: baseVolume + Math.random() * 500000,
      total_invoices_created: baseInvoices + Math.floor(Math.random() * 60),
      total_invoices_funded: Math.floor(
        (baseInvoices + Math.random() * 60) * 0.6,
      ),
      repayment_metrics: {
        total_repaid: Math.floor((baseInvoices + Math.random() * 60) * 0.53),
        total_defaulted: Math.floor((baseInvoices + Math.random() * 60) * 0.02),
        repayment_rate: 85 + Math.random() * 10,
        default_rate: 2 + Math.random() * 3,
      },
      platform_revenue: 20000 + Math.random() * 40000,
      average_invoice_yield: 3 + Math.random() * 4,
      risk_distribution: {
        high: Math.floor(Math.random() * 20),
        medium: Math.floor(Math.random() * 60),
        low: Math.floor(Math.random() * 100),
        avg_score: 30 + Math.random() * 10,
      },
      sector_exposure: {
        sectors: {
          Manufacturing: 30 + Math.random() * 15,
          Retail: 25 + Math.random() * 15,
          Services: 20 + Math.random() * 15,
          Technology: 10 + Math.random() * 15,
        },
        top_sector: "Manufacturing",
        concentration_ratio: 80 + Math.random() * 10,
      },
      user_metrics: {
        active_sellers: 300 + Math.floor(Math.random() * 80),
        active_investors: 150 + Math.floor(Math.random() * 60),
      },
    });
  }

  return { months, data };
};

const generateMockHealthMetrics = (): PlatformHealthMetrics => ({
  gmv: 2450000,
  repayment_rate: 88.28,
  default_rate: 3.45,
  platform_revenue: 49000,
  active_sellers: 342,
  active_investors: 189,
  avg_risk_score: 32.5,
  avg_invoice_yield: 12.8,
  high_risk_invoices: 12,
  top_sector: "Manufacturing",
  sector_concentration: 86.0,
});

const generateMockRiskHeatmap = (): RiskHeatmapData => ({
  sector_exposure: {
    Manufacturing: 35.2,
    Retail: 28.5,
    Services: 22.3,
    Technology: 14.0,
  },
  top_sector: "Manufacturing",
  concentration_ratio: 86.0,
  risk_levels: {
    high: 12,
    medium: 48,
    low: 85,
  },
  avg_score: 32.5,
});
