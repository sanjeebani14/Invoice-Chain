"use client";

import { useState, useEffect, useCallback } from "react";
import { getMarketplaceInvoices, placeInvoiceBid } from "@/lib/api";
import type { MarketplaceInvoiceItem } from "@/lib/types";
import { toast } from "sonner";

/**
 * useInvoices Hook
 * Handles marketplace data fetching, pagination, and bidding.
 */
export function useInvoices(initialLimit = 10) {
  const [invoices, setInvoices] = useState<MarketplaceInvoiceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);

  const fetchInvoices = useCallback(async (currentSkip: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMarketplaceInvoices({ skip: currentSkip, limit: initialLimit });
      setInvoices(data.invoices || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to load marketplace invoices";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [initialLimit]);

  // Initial fetch and fetch on skip change
  useEffect(() => {
    fetchInvoices(skip);
  }, [fetchInvoices, skip]);

  /**
   * PLACE BID
   * Proxies the bidding action and refreshes the list on success
   */
  const placeBid = async (invoiceId: number, amount: number) => {
    try {
      const res = await placeInvoiceBid(invoiceId, amount);
      toast.success(`Bid placed: ${amount} MATIC`);
      
      // Refresh the list to show the new highest bid/status
      await fetchInvoices(skip);
      return res;
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Bidding failed";
      toast.error(msg);
      throw err;
    }
  };

  return {
    invoices,
    total,
    isLoading,
    error,
    skip,
    setSkip,
    refresh: () => fetchInvoices(skip),
    placeBid,
  };
}

export default useInvoices;