"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  TrendingUp,
  ArrowUpRight,
  PieChart as PieIcon,
  ChevronRight,
  Activity,
} from "lucide-react";

export default function EnhancedPortfolio() {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 lg:p-10 font-sans">
      <header className="max-w-7xl mx-auto mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight mb-2 text-slate-800">
          Portfolio Overview
        </h1>

        <div className="flex items-center gap-2 text-emerald-600 font-bold bg-emerald-50 w-fit px-3 py-1 rounded-lg">
          <Activity size={16} />
          <span className="text-xs uppercase">All systems online</span>
        </div>
      </header>

      {/* NAVIGATION TABS */}
      <div className="max-w-7xl mx-auto mb-12">
        <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit">
          <Link
            href="/INVESTOR/marketplace"
            className={`px-6 py-2 rounded-xl text-sm font-black transition-all ${
              pathname === "/INVESTOR/marketplace"
                ? "bg-white shadow-sm text-blue-600"
                : "text-slate-500"
            }`}
          >
            Marketplace
          </Link>

          <Link
            href="/INVESTOR/portfolio"
            className={`px-6 py-2 rounded-xl text-sm font-black transition-all ${
              pathname === "/INVESTOR/portfolio"
                ? "bg-white shadow-sm text-blue-600"
                : "text-slate-500"
            }`}
          >
            My Portfolio
          </Link>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group">
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4">
            Total Portfolio Value
          </p>

          <p className="text-4xl font-black mb-4 text-slate-900">$45,200.00</p>

          <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
            <ArrowUpRight size={16} />
            <span>+8.4% this month</span>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4">
            Average Weighted IRR
          </p>

          <p className="text-4xl font-black text-blue-700 mb-4">14.2%</p>

          <p className="text-slate-600 text-sm font-semibold">
            Above market average
          </p>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4">
            Total Realized Returns
          </p>

          <p className="text-4xl font-black text-emerald-600 mb-4">
            +$3,410.50
          </p>

          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-6">
            <div className="bg-emerald-500 h-full w-[70%]"></div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* HOLDINGS TABLE */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-800">
              Active Holdings
            </h3>

            <button className="text-blue-700 text-sm font-bold hover:underline">
              View History
            </button>
          </div>

          <div className="divide-y divide-slate-50">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-8 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-700">
                    <TrendingUp size={24} />
                  </div>

                  <div>
                    <p className="text-lg font-black text-slate-900">
                      TechCorp Inc.
                    </p>

                    <p className="text-sm text-slate-500 font-medium">
                      Yield: 12.4% • Due in 14 days
                    </p>
                  </div>
                </div>

                <div className="text-right flex items-center gap-8">
                  <div>
                    <p className="text-lg font-black text-slate-900">
                      $5,000.00
                    </p>

                    <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter">
                      Current Value
                    </p>
                  </div>

                  <ChevronRight className="text-slate-400" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ANALYTICS */}
        <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
          <div className="w-48 h-48 rounded-full border-[16px] border-slate-100 flex items-center justify-center relative mb-8">
            <div className="absolute inset-0 border-[16px] border-blue-700 rounded-full border-t-transparent border-r-transparent -rotate-45"></div>

            <PieIcon size={40} className="text-slate-300" />
          </div>

          <h4 className="text-lg font-black mb-2 uppercase tracking-widest text-slate-600">
            Concentration
          </h4>

          <p className="text-slate-600 font-medium px-4 leading-relaxed">
            Most of your assets are in Technology and Logistics sectors.
          </p>
        </div>
      </div>
    </div>
  );
}