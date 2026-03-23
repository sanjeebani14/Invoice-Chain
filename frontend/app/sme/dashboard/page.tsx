"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import {
  Activity,
  BadgeIndianRupee,
  ChartNoAxesColumn,
  CircleGauge,
  Clock3,
  ShieldCheck,
} from "lucide-react";

import { getBackendOrigin } from "@/lib/backendOrigin";
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
  const { currentUser } = useAuth();
  const backendOrigin = getBackendOrigin();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [trust, setTrust] = useState<DashboardTrust | null>(null);
  const [feed, setFeed] = useState<ActivityItem[]>([]);

  const loadDashboard = useCallback(async () => {
    if (!currentUser?.id) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const [summaryRes, activityRes] = await Promise.all([
        axios.get<DashboardSummaryResponse>(
          `${backendOrigin}/api/v1/sme/dashboard/summary`,
          {
            withCredentials: true,
          },
        ),
        axios.get<DashboardActivityResponse>(
          `${backendOrigin}/api/v1/sme/dashboard/activity`,
          {
            params: { limit: 24 },
            withCredentials: true,
          },
        ),
      ]);

      setMetrics(summaryRes.data.metrics);
      setTrust(summaryRes.data.trust);
      setFeed(
        (activityRes.data.items || []).map((item) => ({
          id: item.id,
          message: item.message,
          tone: item.tone,
          at: item.at,
        })),
      );
    } catch {
      setError("Unable to load SME dashboard right now.");
    } finally {
      setLoading(false);
    }
  }, [backendOrigin, currentUser?.id]);

  useEffect(() => {
    loadDashboard();
    const interval = window.setInterval(loadDashboard, 20000);
    return () => window.clearInterval(interval);
  }, [loadDashboard]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-cyan-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
                SME Command Center
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">
                Liquidity Overview
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Live refresh every 20 seconds for invoice and trust updates.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-full border border-cyan-200 bg-cyan-50 px-4 py-1 text-xs font-semibold text-cyan-700">
                Real-time activity feed enabled
              </div>
              <Link
                href="/upload"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Upload Invoice
              </Link>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-emerald-700">
                Total Capital Raised
              </p>
              <BadgeIndianRupee className="h-5 w-5 text-emerald-700" />
            </div>
            <p className="mt-4 text-3xl font-bold text-emerald-900">
              {loading || !metrics
                ? "..."
                : INR.format(metrics.total_capital_raised)}
            </p>
          </article>

          <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Pending Approvals
              </p>
              <Clock3 className="h-5 w-5 text-amber-700" />
            </div>
            <p className="mt-4 text-3xl font-bold text-amber-900">
              {loading || !metrics ? "..." : metrics.pending_approvals}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-slate-600">
                Outstanding Invoices
              </p>
              <ChartNoAxesColumn className="h-5 w-5 text-slate-700" />
            </div>
            <p className="mt-4 text-3xl font-bold text-slate-900">
              {loading || !metrics ? "..." : metrics.outstanding_invoices}
            </p>
          </article>

          <article className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-blue-700">
                Available Credit Limit
              </p>
              <CircleGauge className="h-5 w-5 text-blue-700" />
            </div>
            <p className="mt-4 text-3xl font-bold text-blue-900">
              {loading || !metrics
                ? "..."
                : INR.format(metrics.available_credit_limit)}
            </p>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-cyan-700" />
              <h2 className="text-lg font-semibold text-slate-900">
                Platform Trust Score
              </h2>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                <p className="text-xs font-semibold uppercase text-cyan-700">
                  Risk Tier
                </p>
                <p className="mt-2 text-2xl font-bold text-cyan-900">
                  {loading || !trust ? "-" : trust.risk_tier}
                </p>
                <p className="mt-1 text-xs text-cyan-700">
                  Derived from XGBoost seller risk score
                </p>
              </div>
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                <p className="text-xs font-semibold uppercase text-violet-700">
                  Baseline Discount Rate
                </p>
                <p className="mt-2 text-2xl font-bold text-violet-900">
                  {loading || !trust
                    ? "-"
                    : `${trust.baseline_discount_rate.toFixed(1)}%`}
                </p>
                <p className="mt-1 text-xs text-violet-700">
                  Auto-adjusted against latest risk tier
                </p>
              </div>
            </div>

            {trust ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Composite score:{" "}
                <span className="font-semibold text-slate-900">
                  {trust.composite_score}
                </span>
              </div>
            ) : null}
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-rose-700" />
                <h2 className="text-lg font-semibold text-slate-900">
                  Activity Feed
                </h2>
              </div>
              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                Live
              </span>
            </div>

            <div className="mt-4 max-h-[380px] space-y-3 overflow-auto pr-1">
              {feed.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No activity yet. Upload an invoice to get started.
                </p>
              ) : (
                feed.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-xl border px-3 py-2 ${
                      item.tone === "success"
                        ? "border-emerald-200 bg-emerald-50"
                        : item.tone === "warning"
                          ? "border-amber-200 bg-amber-50"
                          : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <p className="text-sm text-slate-800">{item.message}</p>
                    <p className="mt-1 text-xs text-slate-500">
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
