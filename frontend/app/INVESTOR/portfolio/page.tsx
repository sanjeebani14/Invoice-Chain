"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  TrendingUp,
  ArrowUpRight,
  PieChart,
  ChevronRight,
  Activity,
  DollarSign,
  BarChart3,
  Clock
} from "lucide-react";

export default function EnhancedPortfolio() {
  const pathname = usePathname();

  const holdings = [
    { name: "TechCorp Inc.", value: 5000, irr: "12.4%", due: "14 days" },
    { name: "Global Logistics", value: 10500, irr: "15.1%", due: "32 days" },
    { name: "Sunrise Retail", value: 2500, irr: "9.8%", due: "8 days" }
  ];

  const cashflow = [
    { label: "Jan", value: 1200 },
    { label: "Feb", value: 1800 },
    { label: "Mar", value: 1500 },
    { label: "Apr", value: 2200 },
    { label: "May", value: 2800 }
  ];

  const returns = [
    { label: "Jan", value: 3 },
    { label: "Feb", value: 5 },
    { label: "Mar", value: 4 },
    { label: "Apr", value: 7 },
    { label: "May", value: 8 }
  ];

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

         <p className="text-4xl font-black mb-3 text-slate-900">$45,200</p>

          <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
            <ArrowUpRight size={16} />
            +8.4% this month
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

          <p className="text-4xl font-black text-purple-600">14.2%</p>
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

         <p className="text-4xl font-black text-emerald-600">$3,410</p>
        </div>

      </div>

      {/* MAIN GRID */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* HOLDINGS */}
        <div className="lg:col-span-2 bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl border border-white overflow-hidden">

          <div className="p-8 border-b">
            <h3 className="text-xl font-black text-slate-800">
              Active Investments
            </h3>
          </div>

          {holdings.map((h, i) => (
            <div
              key={i}
              className="p-8 flex items-center justify-between hover:bg-blue-50/40 transition-all"
            >
              <div className="flex items-center gap-6">

                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-700">
                  <TrendingUp />
                </div>

                <div>
                  <p className="text-lg font-bold text-slate-900">{h.name}</p>
                  <p className="text-sm text-slate-600">
                    Yield: {h.irr} • Due in {h.due}
                  </p>
                </div>

              </div>

              <div className="text-right flex items-center gap-8">

                <div>
                  <p className="text-lg font-bold text-slate-900">${h.value}</p>
                  <p className="text-xs text-slate-500 uppercase">
                    Current Value
                  </p>
                </div>

                <ChevronRight className="text-slate-400" />

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

          <p className="text-slate-600 font-medium">
            Majority exposure in Technology & Logistics sectors
          </p>

        </div>

      </div>

      {/* CASHFLOW + RETURNS */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12">

        {/* CASH FLOW */}
        <div className="bg-white backdrop-blur-sm p-8 rounded-3xl shadow-xl border border-white">

          <h3 className="font-black mb-6 text-slate-800 flex items-center gap-2">
            <Clock size={18} /> Cash Flow Timeline
          </h3>

          <div className="flex items-end gap-6 h-40">
            {cashflow.map((c, i) => (
              <div key={i} className="flex flex-col items-center gap-2">

                <div
                  className="w-8 bg-blue-600 rounded-t"
                  style={{ height: `${c.value / 30}px` }}
                />

                <span className="text-xs font-bold text-slate-500">
                  {c.label}
                </span>

              </div>
            ))}
          </div>

        </div>

        {/* RETURNS GRAPH */}
        <div className="bg-white backdrop-blur-sm p-8 rounded-3xl shadow-xl border border-white">

          <h3 className="font-black mb-6 text-slate-800 flex items-center gap-2">
            <TrendingUp size={18} /> Returns Growth
          </h3>

          <div className="flex items-end gap-6 h-40">
            {returns.map((r, i) => (
              <div key={i} className="flex flex-col items-center gap-2">

                <div
                  className="w-8 bg-emerald-500 rounded-t"
                  style={{ height: `${r.value * 15}px` }}
                />

                <span className="text-xs font-bold text-slate-500">
                  {r.label}
                </span>

              </div>
            ))}
          </div>

        </div>

      </div>

    </div>
  );
}