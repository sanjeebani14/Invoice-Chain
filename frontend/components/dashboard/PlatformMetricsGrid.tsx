"use client";

import { PlatformHealthMetrics } from "@/lib/api";

interface PlatformMetricsGridProps {
  metrics: PlatformHealthMetrics;
  isLoading?: boolean;
}

export function PlatformMetricsGrid({
  metrics,
  isLoading = false,
}: PlatformMetricsGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="h-32 bg-gray-200 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  };
  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  const metricsList = [
    { title: "Total Funded Volume", value: formatCurrency(metrics.gmv), trend: "↑ 12.5%", color: "bg-blue-50 border-blue-200" },
    { title: "Repayment Rate", value: formatPercent(metrics.repayment_rate), trend: "↑ 3.2%", color: "bg-green-50 border-green-200" },
    { title: "Default Rate", value: formatPercent(metrics.default_rate), trend: "↓ 1.1%", color: "bg-red-50 border-red-200" },
    { title: "Platform Revenue", value: formatCurrency(metrics.platform_revenue), trend: "↑ 8.4%", color: "bg-purple-50 border-purple-200" },
    { title: "Active Sellers", value: metrics.active_sellers.toString(), trend: "↑ 4.2%", color: "bg-blue-50 border-blue-200" },
    { title: "Active Investors", value: metrics.active_investors.toString(), trend: "↑ 7.8%", color: "bg-green-50 border-green-200" },
    { title: "Avg Risk Score", value: metrics.avg_risk_score.toFixed(1), trend: "↓ 2.3%", color: "bg-yellow-50 border-yellow-200" },
    { title: "High Risk Invoices", value: metrics.high_risk_invoices.toString(), trend: "↓ 0.5%", color: "bg-orange-50 border-orange-200" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metricsList.map((metric, idx) => (
        <div key={idx} className={`${metric.color} border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow`}>
          <p className="text-xs text-gray-600 font-semibold mb-2">{metric.title}</p>
          <p className="text-2xl font-bold text-gray-900 mb-1">{metric.value}</p>
          <p className="text-xs text-gray-500">{metric.trend}</p>
        </div>
      ))}
    </div>
  );
}
