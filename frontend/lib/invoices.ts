import { invoiceApi, analyticsApi, withTimeoutRetry } from "./api";
import type { 
  MarketplaceInvoiceItem, 
  AdminSettlementItem,
  MarketplaceListingItem,
  MarketplaceListingUpdatePayload,
  SettlementHistoryItem,
  InvoiceBidItem,
  InvestorSummary,
  InvestorCashFlow,
  InvestorInvestmentsResponse,
  SellerInvoiceItem,
} from "./types";

/**
 * MARKETPLACE & LISTINGS
 */

export const getMarketplaceInvoices = async (params?: { skip?: number; limit?: number }) => {
  const { data } = await invoiceApi.get<{ invoices: MarketplaceInvoiceItem[]; total: number }>(
    "/marketplace", 
    { params }
  );
  return data;
};

export const getSellerInvoices = async (params?: { status?: string; skip?: number; limit?: number }) => {
  const { data } = await invoiceApi.get<{ invoices: SellerInvoiceItem[]; total: number }>(
    "/", 
    { params }
  );
  return data;
};

export const getMarketplaceListings = async (params?: {
  status?: string;
  skip?: number;
  limit?: number;
}) => {
  const { data } = await invoiceApi.get<{ items: MarketplaceListingItem[]; total: number }>(
    "/listings", 
    { params }
  );
  return data;
};

export const updateMarketplaceListing = async (
  listingId: number,
  payload: MarketplaceListingUpdatePayload,
) => {
  const { data } = await invoiceApi.put<{ message: string; listing_id: number; status: string }>(
    `/listings/${listingId}`, 
    payload
  );
  return data;
};

export const cancelMarketplaceListing = async (listingId: number) => {
  const { data } = await invoiceApi.delete<{ message: string; listing_id: number }>(
    `/listings/${listingId}`
  );
  return data;
};

/**
 * FUNDING & BIDDING (AUCTIONS)
 */

export const fundInvoice = async (
  invoiceId: number,
  payload: { investment_amount?: number; shares?: number; notes?: string },
) => {
  const { data } = await invoiceApi.post<{ message: string; invoice_id: number; status: string }>(
    `/${invoiceId}/fund`, 
    payload
  );
  return data;
};

export const getInvoiceBids = async (invoiceId: number) => {
  const { data } = await invoiceApi.get<{
    invoice_id: number;
    bids: InvoiceBidItem[];
    highest_bid?: number | null;
    next_min_bid?: number;
    my_active_bid_id?: number | null;
  }>(`/${invoiceId}/bids`);
  return data;
};

export const placeInvoiceBid = async (invoiceId: number, amount: number) => {
  const { data } = await invoiceApi.post<{
    message: string;
    invoice_id: number;
    bid_id: number;
    highest_bid: number;
  }>(`/${invoiceId}/bids`, { amount });
  return data;
};

export const cancelMyActiveBid = async (invoiceId: number) => {
  const { data } = await invoiceApi.post(`/${invoiceId}/bids/cancel-my-active`);
  return data;
};

/**
 * SETTLEMENTS
 */

export const getSettlementTracker = async (params?: {
  status?: string;
  skip?: number;
  limit?: number;
}) => {
  const { data } = await invoiceApi.get<{ items: AdminSettlementItem[]; total: number }>(
    "/admin/settlement-tracker", 
    { params }
  );
  return data;
};

export const repayInvoice = async (
  invoiceId: number,
  payload?: {
    repayment_amount?: number;
    notes?: string;
    wallet_address?: string;
    tx_hash?: string;
  },
) => {
  const { data } = await invoiceApi.post(`/${invoiceId}/repay`, payload ?? {});
  return data;
};

export const getSettlementHistory = async (params?: { skip?: number; limit?: number }) => {
  const { data } = await invoiceApi.get<{ items: SettlementHistoryItem[]; total: number }>(
    "/settlements/history", 
    { params }
  );
  return data;
};

export const confirmSettlement = async (invoiceId: number, payload?: { notes?: string }) => {
  const { data } = await invoiceApi.post<{ message: string; settlement_id: number; status: string }>(
    `/settlements/${invoiceId}/confirm`, 
    payload ?? {}
  );
  return data;
};

/**
 * INVESTOR PORTFOLIO (ANALYTICS)
 */

export const getInvestorSummary = async (): Promise<InvestorSummary> => {
  const { data } = await withTimeoutRetry(() =>
    analyticsApi.get<InvestorSummary>("/investor/summary"),
  );
  return data;
};

export const getInvestorCashFlow = async (): Promise<InvestorCashFlow> => {
  const { data } = await withTimeoutRetry(() =>
    analyticsApi.get<InvestorCashFlow>("/investor/cash-flow"),
  );
  return data;
};

export const getInvestorInvestments = async (): Promise<InvestorInvestmentsResponse> => {
  const { data } = await withTimeoutRetry(() =>
    analyticsApi.get<InvestorInvestmentsResponse>("/investor/investments"),
  );
  return data;
};
