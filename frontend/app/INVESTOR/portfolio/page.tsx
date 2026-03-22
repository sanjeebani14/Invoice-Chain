"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  DollarSign,
  PieChart,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  type ConcentrationBreakdownItem,
  type InvestorCashFlow,
  type InvestorInvestmentItem,
  type InvestorInvestmentsResponse,
  type InvestorSummary,
  getInvestorCashFlow,
  getInvestorInvestments,
  getInvestorSummary,
} from "@/lib/api";

export default function EnhancedPortfolio() {
  const pathname = usePathname();
  const [summary, setSummary] = useState<InvestorSummary | null>(null);
  const [cashFlow, setCashFlow] = useState<InvestorCashFlow | null>(null);
  const [investments, setInvestments] = useState<InvestorInvestmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [summaryPayload, cashFlowPayload, investmentsPayload] = await Promise.all([
          getInvestorSummary(),
          getInvestorCashFlow(),
          getInvestorInvestments(),
        ]);
        setSummary(summaryPayload);
        setCashFlow(cashFlowPayload);
        setInvestments(investmentsPayload);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to load portfolio analytics";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const topSellers = useMemo<ConcentrationBreakdownItem[]>(() => {
    return (summary?.concentration.seller_breakdown || []).slice(0, 5);
  }, [summary]);

  const recentInvestments = useMemo<InvestorInvestmentItem[]>(() => {
    return (investments?.items || []).slice(0, 8);
  }, [investments]);

  const topSectors = useMemo<ConcentrationBreakdownItem[]>(() => {
    return (summary?.concentration.sector_breakdown || []).slice(0, 3);
  }, [summary]);

  const cashFlowBars = useMemo(() => {
    return (cashFlow?.timeline || []).map((item) => ({
      date: new Date(item.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      amount: item.expected_inflow,
    }));
  }, [cashFlow]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50 p-6 lg:p-10 font-sans text-slate-800">
      {/* HEADER */}
      <header className="max-w-7xl mx-auto mb-10">
        <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700">
          Portfolio Overview
        </h1>

        <div className="flex items-center gap-2 text-emerald-600 font-bold bg-emerald-50 w-fit px-3 py-1 rounded-lg mt-4">
          <Activity size={16} />
          <span className="text-xs uppercase">All systems online</span>
        </div>
      </header>

      {/* NAVIGATION */}
      <div className="max-w-7xl mx-auto mb-12">
        <div className="flex bg-white/60 backdrop-blur-sm p-1.5 rounded-2xl w-fit shadow-lg border border-white/50">
          <Link
            href="/INVESTOR/marketplace"
            className={`px-8 py-3 rounded-xl text-sm font-bold transition-all ${
              pathname === "/INVESTOR/marketplace"
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg"
                : "text-slate-600"
            }`}
          >
            Marketplace
          </Link>

          <Link
            href="/INVESTOR/portfolio"
            className={`px-8 py-3 rounded-xl text-sm font-bold transition-all ${
              pathname === "/INVESTOR/portfolio"
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg"
                : "text-slate-600"
            }`}
          >
            My Portfolio
          </Link>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto mb-8 bg-red-50 border border-red-200 rounded-2xl p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* STATS */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        <div className="bg-white backdrop-blur-sm p-8 rounded-3xl shadow-xl border border-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <DollarSign className="text-blue-600" />
            </div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Total Portfolio Value
            </p>
          </div>

          <p className="text-4xl font-black mb-3 text-slate-900">
            ${summary?.exposure.toLocaleString() ?? "0"}
          </p>
          <div className="text-xs font-semibold text-slate-500">
            {summary
              ? `${summary.positions} active/repaid positions`
              : "Loading..."}
          </div>
        </div>

        <div className="bg-white backdrop-blur-sm p-8 rounded-3xl shadow-xl border border-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-purple-100 rounded-xl">
              <TrendingUp className="text-purple-600" />
            </div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Average IRR
            </p>
          </div>

          <p className="text-4xl font-black text-purple-600">
            {summary?.portfolio_xirr != null
              ? `${summary.portfolio_xirr.toFixed(2)}%`
              : "-"}
          </p>
          <div className="text-xs font-semibold text-slate-500 mt-3">
            Realized XIRR:{" "}
            {summary?.realized_xirr != null
              ? `${summary.realized_xirr.toFixed(2)}%`
              : "-"}
          </div>
        </div>

        <div className="bg-white backdrop-blur-sm p-8 rounded-3xl shadow-xl border border-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-emerald-100 rounded-xl">
              <BarChart3 className="text-emerald-600" />
            </div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Realized Returns
            </p>
          </div>

          <p className="text-4xl font-black text-emerald-600">
            ${summary?.realized_pnl.toLocaleString() ?? "0"}
          </p>
          <div className="text-xs font-semibold text-slate-500 mt-3">
            Unrealized: ${summary?.unrealized_pnl.toLocaleString() ?? "0"}
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* HOLDINGS */}
        <div className="lg:col-span-2 bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl border border-white overflow-hidden">
          <div className="p-8 border-b">
            <h3 className="text-xl font-black text-slate-800">
              Top Seller Exposures
            </h3>
          </div>

          {loading && (
            <div className="p-8 text-sm font-semibold text-slate-500">
              Loading concentration data...
            </div>
          )}

          {!loading && topSellers.length === 0 && (
            <div className="p-8 text-sm font-semibold text-slate-500">
              No funded seller exposures yet.
            </div>
          )}

          {topSellers.map((h, i) => (
            <div
              key={i}
              className="p-8 flex items-center justify-between hover:bg-blue-50/40 transition-all"
            >
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-700">
                  <TrendingUp />
                </div>

                <div>
                  <p className="text-lg font-bold text-slate-900">
                    Seller {h.key}
                  </p>
                  <p className="text-sm text-slate-600">
                    Portfolio Share: {h.percentage.toFixed(2)}%
                  </p>
                </div>
              </div>

              <div className="text-right flex items-center gap-8">
                <div>
                  <p className="text-lg font-bold text-slate-900">
                    ${h.volume.toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500 uppercase">Exposure</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CONCENTRATION CHART */}
        <div className="bg-white backdrop-blur-sm p-10 rounded-3xl shadow-xl border border-white flex flex-col items-center justify-center text-center">
          <div className="w-48 h-48 rounded-full border-[16px] border-slate-100 flex items-center justify-center relative mb-8">
            <div className="absolute inset-0 border-[16px] border-blue-600 rounded-full border-t-transparent border-r-transparent -rotate-45"></div>
            <PieChart size={40} className="text-slate-300" />
          </div>

          <h4 className="text-lg font-bold mb-2 uppercase tracking-widest text-slate-800">
            Concentration
          </h4>
          <p className="text-slate-600 font-medium mb-4">
            Top 5 sellers:{" "}
            {summary?.concentration.top_5_seller_share_pct.toFixed(2) ?? "0.00"}
            % of book
          </p>
          <div className="w-full space-y-2 text-left">
            {topSectors.map((item) => (
              <div
                key={item.key}
                className="flex justify-between text-sm font-semibold text-slate-700"
              >
                <span>{item.key}</span>
                <span>{item.percentage.toFixed(2)}%</span>
              </div>
            ))}
          </div>
          {(summary?.concentration.alerts.length || 0) > 0 && (
            <div className="mt-6 w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle size={14} /> Concentration Alerts
              </div>
              {summary?.concentration.alerts.slice(0, 3).map((alert) => (
                <div key={`${alert.type}-${alert.key}`}>
                  {alert.type.toUpperCase()} {alert.key}:{" "}
                  {alert.percentage.toFixed(2)}%
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MY INVESTMENTS */}
      <div className="max-w-7xl mx-auto mt-12 bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl border border-white overflow-hidden">
        <div className="p-8 border-b flex items-center justify-between">
          <h3 className="text-xl font-black text-slate-800">My Investments</h3>
          <div className="text-xs font-semibold text-slate-500">
            {investments?.total ?? 0} positions | Funded ${investments?.total_funded.toLocaleString() ?? "0"}
          </div>
        </div>

        {loading && (
          <div className="p-8 text-sm font-semibold text-slate-500">
            Loading investments...
          </div>
        )}

        {!loading && recentInvestments.length === 0 && (
          <div className="p-8 text-sm font-semibold text-slate-500">
            No investments found yet. Buy an invoice from Marketplace to see positions here.
          </div>
        )}

        {!loading && recentInvestments.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 uppercase text-xs tracking-wide">
                <tr>
                  <th className="px-6 py-4 text-left">Invoice</th>
                  <th className="px-6 py-4 text-left">State</th>
                  <th className="px-6 py-4 text-left">Funded</th>
                  <th className="px-6 py-4 text-left">Target</th>
                  <th className="px-6 py-4 text-left">PnL</th>
                  <th className="px-6 py-4 text-left">Due</th>
                </tr>
              </thead>
              <tbody>
                {recentInvestments.map((item) => (
                  <tr key={item.snapshot_id} className="border-t border-slate-100">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">
                        {item.client_name || `Invoice ${item.invoice_id}`}
                      </div>
                      <div className="text-xs text-slate-500">
                        {item.invoice_number || `#${item.invoice_id}`} {item.sector ? `• ${item.sector}` : ""}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                          item.position_state === "repaid"
                            ? "bg-emerald-100 text-emerald-700"
                            : item.position_state === "active"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {item.position_state}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-800">
                      ${item.funded_amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      ${item.repayment_target.toLocaleString()}
                    </td>
                    <td className={`px-6 py-4 font-semibold ${item.estimated_pnl >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      ${item.estimated_pnl.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      {item.due_date || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CASHFLOW + RETURNS */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12">
        {/* CASH FLOW */}
        <div className="bg-white backdrop-blur-sm p-8 rounded-3xl shadow-xl border border-white">
          <h3 className="font-black mb-6 text-slate-800 flex items-center gap-2">
            <Clock size={18} /> Cash Flow Timeline
          </h3>

          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={cashFlowBars}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="hsl(220, 13%, 90%)"
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "hsl(215, 15%, 47%)" }}
              />
              <YAxis tick={{ fontSize: 11, fill: "hsl(215, 15%, 47%)" }} />
              <Tooltip />
              <Bar
                dataKey="amount"
                fill="hsl(210, 65%, 55%)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* RETURNS GRAPH */}
        <div className="bg-white backdrop-blur-sm p-8 rounded-3xl shadow-xl border border-white">
          <h3 className="font-black mb-6 text-slate-800 flex items-center gap-2">
            <TrendingUp size={18} /> Forward Liquidity
          </h3>

          <div className="space-y-4 text-sm font-semibold text-slate-700">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
              <span>Next 30 days</span>
              <span>
                ${cashFlow?.totals.next_30_days.toLocaleString() ?? "0"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
              <span>Next 60 days</span>
              <span>
                ${cashFlow?.totals.next_60_days.toLocaleString() ?? "0"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
              <span>Next 90 days</span>
              <span>
                ${cashFlow?.totals.next_90_days.toLocaleString() ?? "0"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
