import axios from "axios";

const API_BASE = "http://localhost:8000/api/v1/risk";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
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
}

export interface FraudQueueItem {
  id: number;
  seller_id: number;
  risk_score: number;
  fraud_reason: string;
  created_at: string;
  status: "Pending" | "Under Review" | "Resolved";
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
    seller_id: 1001 + Math.floor(Math.random() * 50),
    risk_score: 65 + Math.floor(Math.random() * 35),
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
  try {
    const { data } = await api.get(`/score/${sellerId}`);
    return data;
  } catch {
    const seller = getMockSellers().find((s) => s.seller_id === sellerId);
    if (seller) return seller;
    throw new Error("Seller not found");
  }
};

export const getAllSellers = async (): Promise<SellerScore[]> => {
  try {
    const { data } = await api.get("/sellers");
    return data;
  } catch {
    return getMockSellers();
  }
};

export const getRiskMetrics = async (): Promise<RiskMetrics> => {
  try {
    const { data } = await api.get("/admin/risk-metrics");
    return data;
  } catch {
    return generateMockMetrics();
  }
};

export const getFraudQueue = async (): Promise<FraudQueueItem[]> => {
  try {
    const { data } = await api.get("/admin/fraud-queue");
    return data;
  } catch {
    return getMockFraudQueue();
  }
};

export const reviewFraudItem = async (
  id: number,
  action: string,
): Promise<void> => {
  try {
    await api.post(`/admin/fraud-review/${id}`, { action });
  } catch {
    // Mock: update local state
    const queue = getMockFraudQueue();
    const item = queue.find((q) => q.id === id);
    if (item) item.status = "Resolved";
  }
};
