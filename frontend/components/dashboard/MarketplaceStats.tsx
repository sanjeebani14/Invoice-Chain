"use client";

import { useEffect, useState } from "react";
import { Activity, TrendingUp, Users, Trophy } from "lucide-react";
import { getPlatformHealthMetrics, PlatformHealthMetrics } from "@/lib/api";

export function MarketplaceStats() {
  const [metrics, setMetrics] = useState<PlatformHealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlatformHealthMetrics({ suppressErrors: false })
      .then((data) => {
        setMetrics(data);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load marketplace stats:", err);
        setError("Unable to load live marketplace stats.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-white backdrop-blur-sm p-4 rounded-2xl border border-white shadow-sm animate-pulse"
          >
            <div className="h-12 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
        {error ?? "Marketplace stats are temporarily unavailable."}
      </div>
    );
  }

  // Calculate average IRR (estimated as yield)
  const avgIrr = metrics.avg_invoice_yield || 12.8;

  return (
    <div className="grid grid-cols-4 gap-4 mb-8">
      {/* Total Funded Volume */}
      <div className="bg-white backdrop-blur-sm p-4 rounded-2xl border border-white shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Activity size={16} className="text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900">
              ${(metrics.gmv / 1000000).toFixed(1)}M
            </p>
            <p className="text-xs text-slate-500 font-medium">
              Total Funded Volume
            </p>
          </div>
        </div>
      </div>

      {/* Average Yield / IRR */}
      <div className="bg-white backdrop-blur-sm p-4 rounded-2xl border border-white shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <TrendingUp size={16} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900">
              {avgIrr.toFixed(1)}%
            </p>
            <p className="text-xs text-slate-500 font-medium">
              Avg. Invoice Yield
            </p>
          </div>
        </div>
      </div>

      {/* Active Investors */}
      <div className="bg-white backdrop-blur-sm p-4 rounded-2xl border border-white shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Users size={16} className="text-purple-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900">
              {metrics.active_investors}
            </p>
            <p className="text-xs text-slate-500 font-medium">
              Active Investors
            </p>
          </div>
        </div>
      </div>

      {/* Repayment Rate / Platform Health */}
      <div className="bg-white backdrop-blur-sm p-4 rounded-2xl border border-white shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <Trophy size={16} className="text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900">
              {metrics.repayment_rate.toFixed(1)}%
            </p>
            <p className="text-xs text-slate-500 font-medium">Repayment Rate</p>
          </div>
        </div>
      </div>
    </div>
  );
}
