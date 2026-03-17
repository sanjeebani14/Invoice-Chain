"use client";

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import axios from "axios";
import { 
  Search, ShieldCheck, X, ShoppingCart, Clock, 
  CheckCircle2, Loader2, Trash2, Database, 
  ExternalLink, Filter, Calendar, BarChart3, Banknote,
  TrendingUp, AlertCircle, Zap, Users, Trophy, Activity
} from 'lucide-react';

// --- TYPES ---
interface Bid {
  user: string;
  amount: number;
  time: string;
}

interface Invoice {
  id: string;
  client: string;
  sector: string;
  amount: number;
  risk: number;
  type: 'fixed' | 'auction' | 'fractional';
  dueDate: string;
  price: number;
  sharePrice?: number;
  irr: string;
  contractAddr: string;
  riskMetrics: { label: string; score: number }[];
  highestBid?: number;
  minIncrement?: number;
  auctionEnd?: string;
  bids?: Bid[];
}

interface BackendInvoice {
  id: number;
  client_name?: string | null;
  amount?: number | null;
  due_date?: string | null;
  sector?: string | null;
  financing_type?: 'fixed' | 'auction' | 'fractional' | null;
  ask_price?: number | null;
  share_price?: number | null;
  min_bid_increment?: number | null;
  canonical_hash?: string | null;
  ocr_confidence?: { overall?: number } | null;
}

const safeDate = (value?: string | null): string => {
  if (!value) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
};

const calculateIrr = (amount: number, price: number, dueDate: string): string => {
  if (!amount || !price || price <= 0) return "-";
  const days = Math.max(1, Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const annualized = ((amount / price) - 1) * (365 / days) * 100;
  const bounded = Math.max(-99, Math.min(250, annualized));
  return `${bounded.toFixed(1)}%`;
};

const toMarketplaceInvoice = (inv: BackendInvoice): Invoice => {
  const amount = Number(inv.amount ?? 0);
  const dueDate = safeDate(inv.due_date);
  const price = Number(inv.ask_price ?? amount);
  const type = inv.financing_type ?? 'fixed';
  const risk = Math.max(1, Math.min(99, Math.round((inv.ocr_confidence?.overall ?? 0.75) * 100)));

  return {
    id: String(inv.id),
    client: inv.client_name || `Invoice #${inv.id}`,
    sector: inv.sector || "General",
    amount,
    risk,
    type,
    dueDate,
    price,
    sharePrice: inv.share_price ?? undefined,
    irr: calculateIrr(amount, price, dueDate),
    contractAddr: inv.canonical_hash ? `0x${inv.canonical_hash.slice(0, 10)}...` : "Not minted",
    riskMetrics: [
      { label: "OCR Trust", score: risk },
      { label: "Amount Quality", score: amount > 0 ? 80 : 40 },
      { label: "Tenor Health", score: new Date(dueDate) >= new Date() ? 85 : 50 },
    ],
    highestBid: type === 'auction' ? Number(inv.ask_price ?? amount) : undefined,
    minIncrement: inv.min_bid_increment ?? 100,
  };
};

export default function FullMarketplace() {
  const pathname = usePathname();
  const [searchTerm, setSearchTerm] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [amountFilter, setAmountFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [viewingDetails, setViewingDetails] = useState<Invoice | null>(null);
  const [selectedInv, setSelectedInv] = useState<Invoice | null>(null);
  const [cart, setCart] = useState<
    (Invoice & { selectedAmount: number; shares?: number })[]
  >([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [purchaseStep, setPurchaseStep] = useState<
    "idle" | "processing" | "success"
  >("idle");
  const [fractionalShares, setFractionalShares] = useState<number>(1);
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [bids, setBids] = useState<Bid[]>([]);
  const [highestBid, setHighestBid] = useState<number>(0);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMarketplaceInvoices = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await axios.get(
          "http://localhost:8000/api/v1/invoice/invoices/marketplace",
          { withCredentials: true }
        );
        const payload = response.data;

        const mapped = (payload?.invoices ?? []).map((item: BackendInvoice) => toMarketplaceInvoice(item));
        setInvoices(mapped);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load marketplace invoices";
        setLoadError(message);
        setInvoices([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMarketplaceInvoices();
  }, []);

  React.useEffect(() => {
    if (selectedInv?.type === "auction") {
      const existingBids = selectedInv.bids || [];
      setBids(existingBids);
      const maxBid = existingBids.length > 0 ? Math.max(...existingBids.map(b => b.amount)) : selectedInv.price;
      setHighestBid(maxBid);
    }
  }, [selectedInv]);

  const filteredData = useMemo(() => {
    return invoices.filter(inv => {
      const matchesSearch = inv.client.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRisk = riskFilter === "all" ? true : riskFilter === "high" ? inv.risk >= 80 : inv.risk < 80;
      const matchesAmount = amountFilter === "all" ? true : amountFilter === "small" ? inv.amount < 10000 : amountFilter === "mid" ? (inv.amount >= 10000 && inv.amount <= 25000) : inv.amount > 25000;
      const daysToDue = (new Date(inv.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      const matchesDue = dueFilter === "all" ? true : dueFilter === "30" ? (daysToDue >= 0 && daysToDue <= 30) : true;
      return matchesSearch && matchesRisk && matchesAmount && matchesDue;
    });
  }, [invoices, searchTerm, riskFilter, amountFilter, dueFilter]);

  const handleAddToCart = () => {
    if (!selectedInv) return;
    const finalPrice =
      selectedInv.type === "fractional"
        ? fractionalShares * (selectedInv.sharePrice || 0)
        : selectedInv.price;
    const cartItem = {
      ...selectedInv,
      selectedAmount: finalPrice,
      shares: selectedInv.type === "fractional" ? fractionalShares : undefined,
    };
    setCart([...cart, cartItem]);
    setSelectedInv(null);
    setIsCartOpen(true);
  };

  const removeFromCart = (id: string) =>
    setCart(cart.filter((item) => item.id !== id));
  const cartTotal = cart.reduce((sum, item) => sum + item.selectedAmount, 0);

  const handleBatchCheckout = () => {
    setPurchaseStep('processing');
    setTimeout(() => { setPurchaseStep('success'); setCart([]); }, 3000);
  };

  const placeBid = () => {
    if (!selectedInv) return;
    const minBid = highestBid + (selectedInv.minIncrement || 100);
    if (bidAmount < minBid) {
      alert(`Minimum bid is $${minBid}`);
      return;
    }
    const newBid = { user: "You", amount: bidAmount, time: "now" };
    const updatedBids = [newBid, ...bids];
    setBids(updatedBids);
    const maxBid = Math.max(...updatedBids.map(b => b.amount));
    setHighestBid(maxBid);
    setBidAmount(0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50 text-slate-900 font-sans pb-20">
      <main className="max-w-[1400px] mx-auto p-6 md:p-12">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-1.5 rounded-xl text-xs font-black tracking-tight uppercase flex items-center gap-2 shadow-lg shadow-blue-200">
                <Zap size={14} className="animate-pulse" />
                InvoiceChain
              </div>
              <span className="text-slate-400 text-xs font-semibold">Global Marketplace</span>
            </div>
            <h2 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700 tracking-tight">
              Active Invoices
            </h2>
            <p className="text-slate-500 mt-2 font-medium">Discover verified invoice opportunities</p>
          </div>
          
          <button onClick={() => setIsCartOpen(true)} className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur-xl opacity-40 group-hover:opacity-60 transition-opacity"></div>
            <div className="relative p-5 bg-white border border-slate-200 rounded-2xl shadow-xl hover:shadow-2xl transition-all hover:scale-105">
              <ShoppingCart size={24} className="text-slate-800" />
              {cart.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-black px-2.5 py-1 rounded-full animate-bounce">
                  {cart.length}
                </span>
              )}
            </div>
          </button>
        </header>

        {/* NAVIGATION */}
        <div className="flex bg-white/60 backdrop-blur-sm p-1.5 rounded-2xl w-fit mb-8 shadow-lg shadow-slate-100 border border-white/50">
          <Link 
            href="/INVESTOR/marketplace"
            className={`px-8 py-3 rounded-xl text-sm font-bold transition-all ${
              pathname === '/INVESTOR/marketplace' 
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Marketplace
          </Link>
          <Link
            href="/INVESTOR/portfolio"
            className={`px-8 py-3 rounded-xl text-sm font-bold transition-all ${
              pathname === '/INVESTOR/portfolio' 
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            My Portfolio
          </Link>
        </div>

        {/* FILTERS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12 bg-white backdrop-blur-sm p-6 rounded-3xl border border-white shadow-xl">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search client..." 
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50/80 rounded-xl border border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3.5 rounded-xl border border-blue-200">
            <BarChart3 size={18} className="text-blue-600" />
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="bg-transparent w-full text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">All Risk Levels</option>
              <option value="high">Low Risk (80+)</option>
              <option value="low">Higher Risk (&lt;80)</option>
            </select>
          </div>

          <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-50 to-green-50 px-4 py-3.5 rounded-xl border border-emerald-200">
            <Banknote size={18} className="text-emerald-600" />
            <select
              value={amountFilter}
              onChange={(e) => setAmountFilter(e.target.value)}
              className="bg-transparent w-full text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">Any Amount</option>
              <option value="small">&lt; $10k</option>
              <option value="mid">$10k - $25k</option>
              <option value="large">&gt; $25k</option>
            </select>
          </div>

          <div className="flex items-center gap-3 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3.5 rounded-xl border border-amber-200">
            <Calendar size={18} className="text-amber-600" />
            <select
              value={dueFilter}
              onChange={(e) => setDueFilter(e.target.value)}
              className="bg-transparent w-full text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">Any Maturity</option>
              <option value="30">Next 30 Days</option>
            </select>
          </div>
        </div>

        {isLoading && (
          <div className="mb-8 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3 text-slate-600">
            <Loader2 size={18} className="animate-spin" />
            Loading marketplace invoices...
          </div>
        )}

        {loadError && (
          <div className="mb-8 bg-red-50 p-5 rounded-2xl border border-red-200 text-red-700 text-sm font-semibold">
            {loadError}
          </div>
        )}

        {/* STATS BAR */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white backdrop-blur-sm p-4 rounded-2xl border border-white shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Activity size={16} className="text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-900">{filteredData.length}</p>
                <p className="text-xs text-slate-500 font-medium">Active Listings</p>
              </div>
            </div>
          </div>
          <div className="bg-white backdrop-blur-sm p-4 rounded-2xl border border-white shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <TrendingUp size={16} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-900">12.8%</p>
                <p className="text-xs text-slate-500 font-medium">Avg. IRR</p>
              </div>
            </div>
          </div>
          <div className="bg-white backdrop-blur-sm p-4 rounded-2xl border border-white shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Users size={16} className="text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-900">247</p>
                <p className="text-xs text-slate-500 font-medium">Active Investors</p>
              </div>
            </div>
          </div>
          <div className="bg-white backdrop-blur-sm p-4 rounded-2xl border border-white shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Trophy size={16} className="text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-900">$2.4M</p>
                <p className="text-xs text-slate-500 font-medium">Total Volume</p>
              </div>
            </div>
          </div>
        </div>

        {/* INVOICE GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredData.map(inv => (
            <div key={inv.id} onClick={() => setViewingDetails(inv)} className="group relative bg-white/90 backdrop-blur-sm p-6 rounded-3xl border border-white shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer overflow-hidden">
              
              {/* Background decoration */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-100/20 to-indigo-100/20 rounded-full blur-2xl group-hover:scale-150 transition-transform"></div>
              
              <div className="relative">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col gap-2">
                    <span className={`w-fit px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide ${
                      inv.type === 'fixed' ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white' : 
                      inv.type === 'auction' ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white' : 
                      'bg-gradient-to-r from-orange-500 to-orange-600 text-white'
                    }`}>
                      {inv.type === 'auction' && <Trophy size={10} className="inline mr-1" />}
                      {inv.type}
                    </span>
                    <div className="px-2 py-1 bg-slate-100 rounded-lg text-[9px] font-semibold text-slate-500">{inv.sector}</div>
                  </div>
                  <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold ${
                    inv.risk >= 85 ? 'bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-700' : 
                    inv.risk >= 70 ? 'bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-700' :
                    'bg-gradient-to-r from-red-100 to-orange-100 text-red-700'
                  }`}>
                    <ShieldCheck size={12} />
                    {inv.risk}
                  </div>
                </div>

                <h3 className="text-xl font-black text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">{inv.client}</h3>
                
                <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-6">
                  <Clock size={12}/>
                  <span>Due {new Date(inv.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                
                <div className="pt-4 border-t border-slate-100">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Price</p>
                      <p className="text-2xl font-black text-slate-900">${inv.price.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-semibold text-emerald-500 uppercase tracking-wide mb-1">IRR</p>
                      <p className="text-lg font-black text-emerald-600 flex items-center gap-1">
                        <TrendingUp size={14} />
                        {inv.irr}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredData.length === 0 && (
          <div className="text-center py-20 bg-white/60 backdrop-blur-sm rounded-3xl border-2 border-dashed border-slate-200 mt-10">
            <AlertCircle size={48} className="text-slate-300 mx-auto mb-4" />
            <p className="text-slate-400 font-semibold">No invoices match your filters</p>
            <p className="text-slate-400 text-sm mt-2">Try adjusting your search criteria</p>
          </div>
        )}
      </main>

      {/* DETAIL DRAWER */}
      {viewingDetails && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-md" onClick={() => setViewingDetails(null)} />
          <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            
            <div className="p-8 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-3xl font-black mb-2">{viewingDetails.client}</h3>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase ${
                      viewingDetails.type === 'fixed' ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30' : 
                      viewingDetails.type === 'auction' ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30' : 
                      'bg-orange-500/20 text-orange-300 border border-orange-400/30'
                    }`}>
                      {viewingDetails.type}
                    </span>
                    <span className="text-slate-400 text-xs">{viewingDetails.sector}</span>
                  </div>
                </div>
                <button onClick={() => setViewingDetails(null)} className="p-2 hover:bg-white/10 rounded-lg transition">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/10 backdrop-blur-sm p-3 rounded-xl">
                  <p className="text-[10px] text-slate-300 font-semibold mb-1">INVOICE VALUE</p>
                  <p className="text-xl font-black">${viewingDetails.amount.toLocaleString()}</p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-3 rounded-xl">
                  <p className="text-[10px] text-slate-300 font-semibold mb-1">OFFER PRICE</p>
                  <p className="text-xl font-black">${viewingDetails.price.toLocaleString()}</p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-3 rounded-xl">
                  <p className="text-[10px] text-slate-300 font-semibold mb-1">EST. RETURN</p>
                  <p className="text-xl font-black text-emerald-400">{viewingDetails.irr}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              
              {/* Blockchain Section */}
              <section className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
                <div className="flex items-center gap-2 mb-4">
                  <Database size={20} className="text-blue-600" />
                  <h4 className="font-bold text-slate-800">Blockchain Verification</h4>
                </div>
                <div className="bg-white p-3 rounded-xl font-mono text-xs text-slate-600 mb-4">
                  {viewingDetails.contractAddr}
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 bg-emerald-50 w-fit px-3 py-1.5 rounded-full">
                  <CheckCircle2 size={14} />
                  Verified on Polygon
                </div>
              </section>

              {/* Risk Metrics */}
              <section>
                <h5 className="text-sm font-bold text-slate-700 mb-6 flex items-center gap-2">
                  <BarChart3 size={16} className="text-slate-400" />
                  Risk Assessment
                </h5>
                <div className="space-y-4">
                  {viewingDetails.riskMetrics.map((metric, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between mb-2 text-sm">
                        <span className="font-semibold text-slate-600">{metric.label}</span>
                        <span className={`font-bold ${
                          metric.score >= 80 ? 'text-emerald-600' : 
                          metric.score >= 60 ? 'text-amber-600' : 'text-red-600'
                        }`}>{metric.score}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${
                          metric.score >= 80 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 
                          metric.score >= 60 ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 
                          'bg-gradient-to-r from-red-400 to-red-500'
                        }`} style={{ width: `${metric.score}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Overall Risk Score */}
                <div className="mt-6 p-4 bg-slate-50 rounded-xl">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-slate-600">Overall Risk Score</span>
                    <div className={`text-2xl font-black flex items-center gap-2 ${
                      viewingDetails.risk >= 80 ? 'text-emerald-600' : 
                      viewingDetails.risk >= 60 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      <ShieldCheck size={20} />
                      {viewingDetails.risk}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="p-8 border-t bg-slate-50">
              <button 
                onClick={() => { setSelectedInv(viewingDetails); setViewingDetails(null); setFractionalShares(1); }}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold text-lg hover:shadow-xl transition-all hover:scale-[1.02]"
              >
                {viewingDetails.type === 'auction' ? 'Join Auction' : 
                 viewingDetails.type === 'fractional' ? 'Purchase Shares' : 
                 'Acquire Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INVESTMENT MODAL */}
      {selectedInv && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 backdrop-blur-xl p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl relative max-h-[90vh] overflow-hidden">
            
            {/* Header */}
            <div className="p-8 pb-6 bg-gradient-to-br from-slate-900 to-slate-800 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl"></div>
              <button onClick={() => setSelectedInv(null)} className="absolute right-6 top-6 p-2 hover:bg-white/10 rounded-lg transition">
                <X size={20} />
              </button>
              <h2 className="text-3xl font-black mb-1">{selectedInv.client}</h2>
              <p className="text-slate-300 text-sm">{selectedInv.type === 'auction' ? 'Place Your Bid' : selectedInv.type === 'fractional' ? 'Select Shares' : 'Confirm Purchase'}</p>
            </div>

            <div className="p-8 overflow-y-auto max-h-[60vh]">
              
              {/* Price Display */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-6 rounded-2xl mb-6 text-center">
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">
                  {selectedInv.type === 'fractional' ? 'Total Investment' : 'Invoice Price'}
                </p>
                <p className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700">
                  ${selectedInv.type === 'fractional' ? (fractionalShares * (selectedInv.sharePrice || 0)).toLocaleString() : selectedInv.price.toLocaleString()}
                </p>
                {selectedInv.type === 'fractional' && (
                  <p className="text-sm text-slate-500 mt-2">
                    {fractionalShares} shares × ${selectedInv.sharePrice}/share
                  </p>
                )}
              </div>

              {/* Auction Interface */}
              {selectedInv.type === 'auction' && (
                <>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-2xl mb-6">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xs font-semibold text-purple-600 uppercase">Current Leader</span>
                      <Trophy size={16} className="text-purple-600" />
                    </div>
                    <p className="text-4xl font-black text-purple-700">${highestBid.toLocaleString()}</p>
                    <p className="text-xs text-purple-600 mt-2">Min increment: ${selectedInv.minIncrement}</p>
                  </div>

                  <div className="relative mb-6">
                    <input
                      type="number"
                      placeholder={`Min bid: $${(highestBid + (selectedInv.minIncrement || 100)).toLocaleString()}`}
                      className="w-full p-4 pl-12 rounded-xl border-2 border-slate-200 font-semibold focus:border-purple-500 outline-none transition-colors"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(Number(e.target.value))}
                    />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  </div>

                  <button
                    onClick={placeBid}
                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-2xl font-bold text-lg hover:shadow-xl transition-all mb-6"
                  >
                    Place Bid
                  </button>

                  {/* Bid History */}
                  {bids.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Recent Bids</h4>
                      <div className="space-y-2">
                        {bids.slice(0, 3).map((b, i) => (
                          <div key={i} className={`flex justify-between items-center p-3 rounded-xl ${
                            i === 0 ? 'bg-purple-50 border border-purple-200' : 'bg-slate-50'
                          }`}>
                            <span className="font-semibold text-slate-700">{b.user}</span>
                            <span className="font-bold text-purple-600">${b.amount.toLocaleString()}</span>
                            <span className="text-xs text-slate-400">{b.time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Fractional Shares Selector */}
              {selectedInv.type === 'fractional' && (
                <div className="mb-6">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4 text-center">Select Number of Shares</p>
                  <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl">
                    <button 
                      className="w-12 h-12 bg-white rounded-xl shadow-md font-bold text-xl hover:shadow-lg transition-shadow disabled:opacity-50"
                      onClick={() => setFractionalShares(Math.max(1, fractionalShares - 1))}
                      disabled={fractionalShares <= 1}
                    >
                      -
                    </button>
                    <span className="text-3xl font-black text-slate-900 min-w-[60px] text-center">{fractionalShares}</span>
                    <button 
                      className="w-12 h-12 bg-white rounded-xl shadow-md font-bold text-xl hover:shadow-lg transition-shadow"
                      onClick={() => setFractionalShares(fractionalShares + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* Add to Cart Button */}
              {selectedInv.type !== 'auction' && (
                <button
                  onClick={handleAddToCart}
                  className="w-full py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl font-bold text-lg hover:shadow-xl transition-all hover:scale-[1.02]"
                >
                  Add to Cart
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CART DRAWER */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[70] flex justify-end">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            
            {/* Header */}
            <div className="p-8 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-black">Your Cart</h3>
                  <p className="text-slate-300 text-sm mt-1">{cart.length} items selected</p>
                </div>
                <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-white/10 rounded-lg transition">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
              {cart.length === 0 ? (
                <div className="text-center py-20">
                  <ShoppingCart size={48} className="text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-400 font-semibold">Your cart is empty</p>
                </div>
              ) : (
                cart.map((item, idx) => (
                  <div key={idx} className="bg-white p-5 rounded-2xl shadow-sm relative group hover:shadow-md transition-shadow">
                    <button 
                      onClick={() => removeFromCart(item.id)} 
                      className="absolute -top-2 -right-2 bg-red-500 text-white p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-bold text-slate-800 text-lg">{item.client}</h4>
                      <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${
                        item.type === 'fixed' ? 'bg-blue-100 text-blue-600' : 
                        item.type === 'fractional' ? 'bg-orange-100 text-orange-600' : 
                        'bg-purple-100 text-purple-600'
                      }`}>
                        {item.type}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">
                        {item.shares ? `${item.shares} shares` : 'Full invoice'}
                      </span>
                      <span className="font-bold text-xl text-slate-900">
                        ${item.selectedAmount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Checkout Section */}
            {cart.length > 0 && (
              <div className="p-8 bg-white border-t">
                <div className="flex justify-between items-center mb-6">
                  <span className="font-semibold text-slate-600">Total Amount</span>
                  <span className="text-3xl font-black text-slate-900">${cartTotal.toLocaleString()}</span>
                </div>
                
                {purchaseStep === 'idle' && (
                  <button 
                    onClick={handleBatchCheckout} 
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold text-lg hover:shadow-xl transition-all hover:scale-[1.02]"
                  >
                    Complete Purchase
                  </button>
                )}
                
                {purchaseStep === 'processing' && (
                  <div className="text-center py-4">
                    <Loader2 className="animate-spin text-blue-600 mx-auto mb-3" size={40} />
                    <p className="font-semibold text-slate-700">Processing transaction...</p>
                    <p className="text-xs text-slate-500 mt-1">Confirming on Polygon network</p>
                  </div>
                )}
                
                {purchaseStep === 'success' && (
                  <div className="text-center bg-gradient-to-br from-emerald-50 to-green-50 p-8 rounded-2xl border border-emerald-200">
                    <CheckCircle2 className="text-emerald-500 mx-auto mb-3" size={48} />
                    <p className="font-bold text-emerald-800 text-xl">Purchase Complete!</p>
                    <p className="text-emerald-600 text-sm mt-2">Your invoices have been added to your portfolio</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

