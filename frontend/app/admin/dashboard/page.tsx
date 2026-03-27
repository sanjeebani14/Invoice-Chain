"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CircleCheck,
  Clock3,
  Database,
  FileText,
  DollarSign,
  TrendingUp,
  Users,
  RefreshCw,
} from "lucide-react";
import {
  getAdminOverview,
  getBlockchainSyncStatus,
  getRiskMetrics,
  type AdminOverview,
  type BlockchainSyncStatusItem,
  type RiskMetrics,
} from "@/lib/api";

export default function Dashboard() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [risk, setRisk] = useState<RiskMetrics | null>(null);
  const [syncStates, setSyncStates] = useState<BlockchainSyncStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    const overviewPromise = getAdminOverview()
      .then((data) => setOverview(data))
      .catch(() => {
        setError("Unable to load admin overview right now.");
      });

    const riskPromise = getRiskMetrics()
      .then((data) => setRisk(data))
      .catch(() => {
        // Risk is non-critical for the initial dashboard render.
      });

    const syncPromise = getBlockchainSyncStatus()
      .then((data) => setSyncStates(data.items || []))
      .catch(() => {
        // Sync is non-critical for the initial dashboard render.
      });

    await Promise.allSettled([overviewPromise, riskPromise, syncPromise]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !overview) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Admin Overview</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-muted/50" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !overview) {
    return <div className="text-sm text-destructive">{error}</div>;
  }

  if (!overview) {
    return (
      <div className="text-sm text-muted-foreground">No overview data available.</div>
    );
  }

  const riskFallback: RiskMetrics = {
    total_sellers: 0,
    high_risk: 0,
    medium_risk: 0,
    low_risk: 0,
    avg_composite_score: 0,
    risk_distribution: [],
    fraud_alerts_over_time: [],
    seller_risk_trends: [],
    top_high_risk_sellers: [],
    risk_level_breakdown: [],
  };

  const riskSafe = risk ?? riskFallback;

  const kpiCards = [
    {
      label: "Pending Invoices",
      value: overview.kpis.pending_invoices,
      icon: FileText,
      color: "bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-900/60",
      textColor: "text-blue-600 dark:text-blue-300",
    },
    {
      label: "Funded Live",
      value: overview.kpis.funded_live,
      icon: DollarSign,
      color:
        "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/35 dark:border-emerald-900/60",
      textColor: "text-emerald-600 dark:text-emerald-300",
    },
    {
      label: "Overdue Live",
      value: overview.kpis.overdue_live,
      icon: AlertTriangle,
      color: "bg-red-50 border-red-200 dark:bg-red-950/35 dark:border-red-900/60",
      textColor: "text-red-600 dark:text-red-300",
    },
    {
      label: "Due Today",
      value: overview.kpis.due_today,
      icon: Clock3,
      color:
        "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/60",
      textColor: "text-amber-600 dark:text-amber-300",
    },
    {
      label: "Pending KYC",
      value: overview.kpis.pending_kyc,
      icon: Users,
      color:
        "bg-purple-50 border-purple-200 dark:bg-purple-950/35 dark:border-purple-900/60",
      textColor: "text-purple-600 dark:text-purple-300",
    },
    {
      label: "Fraud Queue",
      value: overview.kpis.unresolved_fraud,
      icon: AlertTriangle,
      color:
        "bg-orange-50 border-orange-200 dark:bg-orange-950/35 dark:border-orange-900/60",
      textColor: "text-orange-600 dark:text-orange-300",
    },
    {
      label: "Investors",
      value: overview.kpis.investors_count,
      icon: Users,
      color:
        "bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-900/60",
      textColor: "text-indigo-600 dark:text-indigo-300",
    },
    {
      label: "Sellers",
      value: riskSafe.total_sellers,
      icon: TrendingUp,
      color: "bg-cyan-50 border-cyan-200 dark:bg-cyan-950/35 dark:border-cyan-900/60",
      textColor: "text-cyan-600 dark:text-cyan-300",
    },
  ];

  const latestSync = syncStates[0] || null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Admin Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time operations, risk posture, and action queue for platform
            admins.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`rounded-lg border-2 p-4 transition-all hover:shadow-md ${card.color}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {card.label}
                  </p>
                  <p className={`mt-3 text-3xl font-bold ${card.textColor}`}>
                    {card.value}
                  </p>
                </div>
                <Icon className={`h-6 w-6 ${card.textColor} opacity-60`} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="surface-card p-6">
          <h2 className="text-lg font-bold text-foreground">
            Actionable Insights
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Prioritized operational tasks generated from live queues.
          </p>
          <div className="mt-5 space-y-3">
            {overview.actionable_insights.length === 0 ? (
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm font-medium text-foreground">
                ✓ No urgent actions right now.
              </div>
            ) : (
              overview.actionable_insights.map((insight) => (
                <div
                  key={`${insight.type}-${insight.title}`}
                  className={`rounded-lg border-l-4 p-4 transition-all ${
                    insight.priority === "HIGH"
                      ? "border-l-red-500 bg-red-50 dark:bg-red-950/35"
                      : insight.priority === "MEDIUM"
                        ? "border-l-amber-500 bg-amber-50 dark:bg-amber-950/30"
                        : "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/35"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">
                        {insight.title}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {insight.description}
                      </p>
                    </div>
                    <span
                      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold uppercase ${
                      insight.priority === "HIGH" 
                        ? "bg-red-200 text-red-800 dark:bg-red-900/45 dark:text-red-200"
                        : insight.priority === "MEDIUM"
                          ? "bg-amber-200 text-amber-800 dark:bg-amber-900/45 dark:text-amber-200"
                          : "bg-emerald-200 text-emerald-800 dark:bg-emerald-900/45 dark:text-emerald-200"
                    }`}
                    >
                      {insight.priority}
                    </span>
                  </div>
                  <Link
                    href={insight.cta_path}
                    className="mt-3 inline-flex items-center text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                  >
                    Open queue →
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="surface-card p-6">
          <h2 className="text-lg font-bold text-foreground">Risk Snapshot</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Current seller-risk distribution for quick triage.
          </p>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-red-50 p-4 dark:bg-red-950/35">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-300" />
                <span className="font-medium text-foreground">
                  High risk sellers
                </span>
              </div>
              <span className="text-xl font-bold text-red-600 dark:text-red-300">
                {riskSafe.high_risk}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-amber-50 p-4 dark:bg-amber-950/30">
              <div className="flex items-center gap-3">
                <Clock3 className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                <span className="font-medium text-foreground">
                  Medium risk sellers
                </span>
              </div>
              <span className="text-xl font-bold text-amber-600 dark:text-amber-300">
                {riskSafe.medium_risk}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-4 dark:bg-emerald-950/35">
              <div className="flex items-center gap-3">
                <CircleCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                <span className="font-medium text-foreground">
                  Low risk sellers
                </span>
              </div>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-300">
                {riskSafe.low_risk}
              </span>
            </div>
            <div className="rounded-lg border-2 border-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:border-blue-900/60 dark:from-blue-950/40 dark:to-indigo-950/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Platform Average
              </p>
              <p className="mt-2 text-2xl font-bold text-blue-700 dark:text-blue-300">
                {riskSafe.avg_composite_score.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">Composite score</p>
            </div>
          </div>
          <Link
            href="/admin/risk-metrics"
            className="mt-5 inline-flex items-center font-semibold text-primary transition-colors hover:text-primary/80"
          >
            View full risk metrics →
          </Link>
        </div>

        <div className="surface-card p-6">
          <h2 className="text-lg font-bold text-foreground">Blockchain Sync</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Event ingestion worker cursor and latest processing state.
          </p>

          {!latestSync ? (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              No sync cursor found yet. Enable sync worker to initialize state.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium text-foreground">Last synced block</span>
                </div>
                <span className="text-xl font-bold text-foreground">
                  {latestSync.last_synced_block.toLocaleString()}
                </span>
              </div>

              <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Contract</p>
                <p className="mt-1 break-all font-mono text-xs">{latestSync.contract_address}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Last sync time: {latestSync.last_synced_at ? new Date(latestSync.last_synced_at).toLocaleString() : "-"}
                </p>
              </div>

              {latestSync.last_error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200">
                  {latestSync.last_error}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-200">
                  Sync worker healthy. No recent processing errors.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
