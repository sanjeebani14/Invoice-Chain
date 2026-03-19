"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Gauge,
  ShieldCheck,
  ShieldX,
  Users,
} from "lucide-react";
import { getRiskMetrics, type RiskMetrics } from "@/lib/api";

export default function RiskMetricsPage() {
  const [data, setData] = useState<RiskMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRiskMetrics()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm text-gray-500">Loading risk metrics...</div>;
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        No risk metrics available.
      </div>
    );
  }

  const safeTotal = Math.max(data.total_sellers, 1);
  const highPct = (data.high_risk / safeTotal) * 100;
  const mediumPct = (data.medium_risk / safeTotal) * 100;
  const lowPct = (data.low_risk / safeTotal) * 100;

  return (
    <div className="space-y-6 bg-slate-50 text-slate-900">
      <div className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Risk Command Center
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">
            Risk Metrics
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Snapshot of current seller risk distribution from scoring data.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total sellers
            </p>
            <Users className="h-4 w-4 text-slate-500" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {data.total_sellers}
          </p>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-red-700">
              High risk
            </p>
            <ShieldX className="h-4 w-4 text-red-700" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-red-900">
            {data.high_risk}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
              Medium risk
            </p>
            <AlertTriangle className="h-4 w-4 text-amber-700" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-amber-900">
            {data.medium_risk}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
              Low risk
            </p>
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-emerald-900">
            {data.low_risk}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-semibold text-slate-900">
              Distribution Mix
            </h2>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-red-700">High</span>
                <span className="text-slate-600">{highPct.toFixed(1)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-red-100">
                <div
                  className="h-full rounded-full bg-red-500"
                  style={{ width: `${highPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-amber-700">Medium</span>
                <span className="text-slate-600">{mediumPct.toFixed(1)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-amber-100">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${mediumPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-emerald-700">Low</span>
                <span className="text-slate-600">{lowPct.toFixed(1)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-emerald-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${lowPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-cyan-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">
            Average Composite Score
          </p>
          <p className="mt-2 text-4xl font-bold text-indigo-950">
            {data.avg_composite_score.toFixed(1)}
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Lower score generally indicates healthier seller posture in this
            model.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Quick Actions
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Jump straight into investigation and detailed analysis workflows.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            href="/admin/sellers"
            className="group rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
          >
            <span className="inline-flex items-center gap-2">
              Open Sellers List
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>

          <Link
            href="/admin/fraud-queue"
            className="group rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 transition hover:border-amber-300 hover:bg-amber-100"
          >
            <span className="inline-flex items-center gap-2">
              Open Fraud Review Queue
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>

          <Link
            href="/admin/analytics?tab=risk"
            className="group rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-800 transition hover:border-indigo-300 hover:bg-indigo-100"
          >
            <span className="inline-flex items-center gap-2">
              Open Detailed Risk Analytics
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
