//SHARED PRIMITIVES ──────────────────────────────────────────
export type UserRole = "admin" | "investor" | "seller";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type KycStatus = "pending" | "approved" | "rejected" | "review";
export type FinancingType = "fixed" | "auction" | "fractional";
export type ListingStatus = "active" | "paused" | "sold" | "canceled";

/** * ── USER & AUTHENTICATION ──────────────────────────────────────
 */
export interface User {
  id: number;
  email: string;
  full_name: string | null;
  phone: string | null;
  company_name: string | null;
  role: UserRole;
  is_verified: boolean;
  wallet_address?: string | null;
}

export interface ProfileMeResponse {
  user: User;
  kyc: {
    status: KycStatus;
    details?: Record<string, unknown> | null;
  } | null;
  primary_wallet?: {
    wallet_address: string;
    chain_id: string;
  } | null;
}

export interface RegisterData extends Omit<LoginData, "two_factor_code"> {
  role: UserRole;
}

export interface LoginData {
  email: string;
  password: string;
  two_factor_code?: string;
}

export interface MessageResponse {
  message: string;
}

export interface LoginResponse extends MessageResponse {
  requires_two_factor?: boolean;
  two_factor_token?: string | null;
}

export interface TwoFactorLoginData {
  two_factor_token: string;
  code: string;
}

export interface ForgotPasswordData {
  email: string;
}

export interface ResetPasswordData {
  token: string;
  new_password: string;
}

export interface VerifyEmailResponse {
  success: boolean;
  user?: User;
  error?: string;
}

export interface ResendVerificationEmailResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface VerificationStatusResponse {
  success: boolean;
  verified: boolean;
  email?: string;
  verified_at?: string;
  error?: string;
}

export interface RiskOnboardingStatus {
  required: boolean;
  completed: boolean;
  missing_fields: string[];
  seller_id: number;
}

export interface SellerRiskOnboardingPayload {
  payment_history_score: number;
  client_reputation_score: number;
  seller_track_record: number;
  employment_years: number;
  debt_to_income: number;
  core_enterprise_rating: number;
  transaction_stability: number;
  logistics_consistency: number;
  esg_score: number;
}

export interface SellerRiskOnboardingResponse {
  message: string;
  seller_id: number;
  composite_score: number;
  risk_level: string;
}

/** * ── KYC ────────────────────────────────────────────────────────
 */
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
  updated_at?: string;
}

export interface KycMeResponse {
  kyc: KycSubmissionOut | null;
}

/** * ── RISK & FRAUD ───────────────────────────────────────────────
 */
export interface SellerScore {
  seller_id: number;
  composite_score: number;
  risk_level: RiskLevel;
  credit_score?: number;
  annual_income?: number;
  loan_amount?: number;
  debt_to_income?: number;
  employment_years?: number;
  last_updated?: string;
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
  severity?: RiskLevel;
  fraud_reason: string;
  anomaly_score?: number | null;
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
  severity?: RiskLevel;
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


/** * ── MARKETPLACE & INVOICES ─────────────────────────────────────
 */
export interface MarketplaceInvoiceItem {
  id: number;
  invoice_number?: string | null;
  client_name?: string | null;
  amount?: number | null;
  due_date?: string | null;
  sector?: string | null;
  financing_type?: FinancingType | null;
  ask_price?: number | null;
  share_price?: number | null;
  min_bid_increment?: number | null;
  canonical_hash?: string | null;
  ocr_confidence?: { overall?: number } | null;
}

export interface MarketplaceListingItem {
  id: number;
  invoice_id: number;
  seller_id: number;
  listing_type: FinancingType;
  status: ListingStatus;
  ask_price?: number | null;
  share_price?: number | null;
  total_shares?: number | null;
  available_shares?: number | null;
  created_at?: string | null;
}

export interface MarketplaceListingUpdatePayload {
  status?: ListingStatus;
  ask_price?: number;
  share_price?: number;
  available_shares?: number;
}

/** * ── ADMIN & ANALYTICS ──────────────────────────────────────────
 */
export interface AdminManagedUser extends Omit<User, "full_name"> {
  full_name?: string | null;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface GetAdminUsersParams {
  role?: UserRole;
  is_active?: boolean;
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

export interface AdminKycListResponse {
  submissions: KycSubmissionOut[];
  total: number;
}

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

export interface InvestorInvestmentItem {
  snapshot_id: number;
  invoice_id: number;
  invoice_number?: string | null;
  client_name?: string | null;
  sector?: string | null;
  status: string;
  position_state: "pending" | "active" | "repaid";
  funded_amount: number;
  repayment_target: number;
  repaid_amount: number;
  estimated_pnl: number;
  due_date?: string | null;
  days_to_due?: number | null;
  funded_at?: string | null;
  repaid_at?: string | null;
}

export interface InvestorInvestmentsResponse {
  investor_id: number;
  total: number;
  total_funded: number;
  total_repaid: number;
  items: InvestorInvestmentItem[];
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
  actionable_insights: {
    type: string;
    priority: RiskLevel; // Reusing RiskLevel for priority
    title: string;
    description: string;
    cta_path: string;
  }[];
}

export interface BlockchainSyncStatusItem {
  contract_address: string;
  last_synced_block: number;
  last_synced_at?: string | null;
  last_error?: string | null;
  updated_at?: string | null;
}

export interface SettlementHistoryItem {
  id: number;
  invoice_id: number;
  investor_id?: number | null;
  seller_id?: number | null;
  amount: number;
  status: string;
  escrow_reference?: string | null;
  confirmed_by?: number | null;
  confirmed_at?: string | null;
  notes?: string | null;
  created_at?: string | null;
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
  escrow_status?: string | null;
  escrow_reference?: string | null;
  escrow_held_at?: string | null;
  escrow_released_at?: string | null;
  investor_id?: number | null;
  funded_amount?: number | null;
  created_at: string;
}

export interface AdminAuctionInvoice {
  id: number;
  invoice_number?: string | null;
  seller_name?: string | null;
  client_name?: string | null;
  amount?: number | null;
  ask_price?: number | null;
  financing_type?: string | null;
  min_bid_increment?: number | null;
  status: string;
  due_date?: string | null;
  created_at: string;
}

export interface InvoiceBidItem {
  id: number;
  invoice_id: number;
  bidder_id: number;
  amount: number;
  status: string;
  is_mine?: boolean;
  created_at?: string | null;
}

export interface CloseAuctionResponse {
  message: string;
  invoice_id: number;
  status: string;
  winning_bid: number;
  winner_bid_id: number;
  winner_bidder_id: number;
  winner_name?: string | null;
  winner_email?: string | null;
  winner_created_at?: string | null;
  repayment_snapshot_id: number;
  simulated_transaction_id: string;
  escrow_status?: string | null;
  escrow_reference?: string | null;
  closed_at?: string;
  closed_by?: number;
  notes?: string | null;
}