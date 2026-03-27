"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { 
  Activity, BadgeIndianRupee, ChartNoAxesColumn, 
  CircleGauge, Clock3, ShieldCheck, Loader2, AlertCircle 
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

type ActivityItem = {
  id: string;
  message: string;
  at?: string | null;
  tone: "neutral" | "success" | "warning";
};

type DashboardMetrics = {
  total_capital_raised: number;
  pending_approvals: number;
  outstanding_invoices: number;
  available_credit_limit: number;
};

type DashboardTrust = {
  risk_tier: string;
  composite_score: number;
  baseline_discount_rate: number;
};

type DashboardSummaryResponse = {
  metrics: DashboardMetrics;
  trust: DashboardTrust;
  as_of: string;
};

type DashboardActivityResponse = {
  items: Array<{
    id: string;
    message: string;
    tone: "neutral" | "success" | "warning";
    at?: string | null;
  }>;
};

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function asRelativeTime(iso?: string): string {
  if (!iso) return "just now";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SmeDashboardPage() {
  const { user, isLoading: authLoading } = useAuth(); // Use 'user' from our verified context
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [trust, setTrust] = useState<DashboardTrust | null>(null);
  const [feed, setFeed] = useState<ActivityItem[]>([]);

  const loadDashboard = useCallback(async (isInitial = false) => {
    if (!user) return;
    if (isInitial) setLoading(true);

    try {
      const [summaryRes, activityRes] = await Promise.all([
        api.get<DashboardSummaryResponse>("/sme/dashboard/summary"),
        api.get<DashboardActivityResponse>("/sme/dashboard/activity", {
          params: { limit: 15 }, // Lower limit for performance
        }),
      ]);

      setMetrics(summaryRes.data.metrics);
      setTrust(summaryRes.data.trust);
      setFeed(activityRes.data.items || []);
      setError(null);
    } catch (err) {
      // Don't show full-page error if it's just a background refresh failing
      if (isInitial) setError("Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial Load
  useEffect(() => {
    loadDashboard(true);
  }, [loadDashboard]);

  // Robust Polling: Only poll when tab is active
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadDashboard(false);
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [loadDashboard]);

  if (authLoading || (loading && !metrics)) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-container space-y-6">
        <section className="surface-card p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                SME Command Center
              </p>
              <h1 className="mt-2 text-3xl font-bold text-foreground">
                Liquidity Overview
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Live refresh every 20 seconds for invoice and trust updates.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="status-chip px-4 font-semibold text-primary">
                Real-time activity feed enabled
              </div>
              <Link
                href="/sme/upload"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Upload Invoice
              </Link>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="surface-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Total Capital Raised
              </p>
              <BadgeIndianRupee className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-4 text-3xl font-bold text-foreground">
              {loading || !metrics
                ? "..."
                : INR.format(metrics.total_capital_raised)}
            </p>
          </article>

          <article className="surface-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Pending Approvals
              </p>
              <Clock3 className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-4 text-3xl font-bold text-foreground">
              {loading || !metrics ? "..." : metrics.pending_approvals}
            </p>
          </article>

          <article className="surface-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Outstanding Invoices
              </p>
              <ChartNoAxesColumn className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-4 text-3xl font-bold text-foreground">
              {loading || !metrics ? "..." : metrics.outstanding_invoices}
            </p>
          </article>

          <article className="surface-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Available Credit Limit
              </p>
              <CircleGauge className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-4 text-3xl font-bold text-foreground">
              {loading || !metrics
                ? "..."
                : INR.format(metrics.available_credit_limit)}
            </p>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <article className="surface-card p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">
                Platform Trust Score
              </h2>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="surface-subtle p-4">
                <p className="text-xs font-semibold uppercase text-primary">
                  Risk Tier
                </p>
                <p className="mt-2 text-2xl font-bold text-foreground">
                  {loading || !trust ? "-" : trust.risk_tier}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Derived from XGBoost seller risk score
                </p>
              </div>
              <div className="surface-subtle p-4">
                <p className="text-xs font-semibold uppercase text-primary">
                  Baseline Discount Rate
                </p>
                <p className="mt-2 text-2xl font-bold text-foreground">
                  {loading || !trust
                    ? "-"
                    : `${trust.baseline_discount_rate.toFixed(1)}%`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Auto-adjusted against latest risk tier
                </p>
              </div>
            </div>

            {trust ? (
              <div className="surface-subtle mt-4 p-4 text-sm text-muted-foreground">
                Composite score:{" "}
                <span className="font-semibold text-foreground">
                  {trust.composite_score}
                </span>
              </div>
            ) : null}
          </article>

          <article className="surface-card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">
                  Activity Feed
                </h2>
              </div>
              <span className="status-chip font-semibold text-primary">
                Live
              </span>
            </div>

            <div className="mt-4 max-h-[380px] space-y-3 overflow-auto pr-1">
              {feed.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No activity yet. Upload an invoice to get started.
                </p>
              ) : (
                feed.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-xl border px-3 py-2 ${
                      item.tone === "success"
                        ? "border-primary/20 bg-primary/10"
                        : item.tone === "warning"
                          ? "border-secondary bg-secondary/70"
                          : "border-border bg-muted/40"
                    }`}
                  >
                    <p className="text-sm text-foreground">{item.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {asRelativeTime(item.at || undefined)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
