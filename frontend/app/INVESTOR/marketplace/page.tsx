"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Search, ShieldCheck, X, ShoppingCart, Clock, 
  CheckCircle2, Loader2, Trash2, Database, 
  ExternalLink, Filter, Calendar, BarChart3, Banknote
} from 'lucide-react';

// --- TYPES ---
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
}

const MOCK_DATA: Invoice[] = [
  { id: "1", client: "TechCorp Inc.", sector: "Technology", amount: 5000, risk: 85, type: "fixed", price: 4800, dueDate: "2026-04-05", irr: "12.4%", contractAddr: "0x71C...a291", riskMetrics: [{label: "Financials", score: 92}, {label: "History", score: 88}, {label: "Outlook", score: 75}] },
  { id: "2", client: "Global Logistics", sector: "Supply Chain", amount: 12000, risk: 72, type: "auction", price: 10500, dueDate: "2026-06-01", irr: "15.1%", contractAddr: "0x32A...f842", riskMetrics: [{label: "Financials", score: 70}, {label: "History", score: 65}, {label: "Outlook", score: 82}] },
  { id: "3", client: "Sunrise Retail", sector: "Consumer Goods", amount: 2500, risk: 94, type: "fractional", price: 2500, sharePrice: 25, dueDate: "2026-03-20", irr: "9.8%", contractAddr: "0x99B...e110", riskMetrics: [{label: "Financials", score: 96}, {label: "History", score: 98}, {label: "Outlook", score: 90}] },
  { id: "4", client: "Apex Energy", sector: "Renewables", amount: 25000, risk: 89, type: "fixed", price: 23500, dueDate: "2026-08-12", irr: "13.2%", contractAddr: "0x44D...c221", riskMetrics: [{label: "Financials", score: 85}, {label: "History", score: 90}, {label: "Outlook", score: 92}] },
  { id: "5", client: "BioHealth Labs", sector: "Healthcare", amount: 8400, risk: 68, type: "fixed", price: 7900, dueDate: "2026-05-30", irr: "11.5%", contractAddr: "0x88F...a332", riskMetrics: [{label: "Financials", score: 60}, {label: "History", score: 72}, {label: "Outlook", score: 70}] },
  { id: "6", client: "Nordic Shipping", sector: "Maritime", amount: 45000, risk: 91, type: "fractional", price: 45000, sharePrice: 100, dueDate: "2026-04-15", irr: "10.1%", contractAddr: "0x11E...b998", riskMetrics: [{label: "Financials", score: 94}, {label: "History", score: 95}, {label: "Outlook", score: 85}] },
  { id: "7", client: "Swift Automotives", sector: "Manufacturing", amount: 15600, risk: 78, type: "fixed", price: 14200, dueDate: "2026-09-20", irr: "14.8%", contractAddr: "0x55G...d443", riskMetrics: [{label: "Financials", score: 75}, {label: "History", score: 80}, {label: "Outlook", score: 78}] },
  { id: "8", client: "Urban Build Co.", sector: "Construction", amount: 32000, risk: 62, type: "auction", price: 29000, dueDate: "2026-03-25", irr: "16.5%", contractAddr: "0x22H...e554", riskMetrics: [{label: "Financials", score: 55}, {label: "History", score: 60}, {label: "Outlook", score: 70}] }
];

export default function FullMarketplace() {
  const pathname = usePathname();
  const [searchTerm, setSearchTerm] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [amountFilter, setAmountFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");

  const [viewingDetails, setViewingDetails] = useState<Invoice | null>(null);
  const [selectedInv, setSelectedInv] = useState<Invoice | null>(null);
  const [cart, setCart] = useState<(Invoice & { selectedAmount: number, shares?: number })[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [purchaseStep, setPurchaseStep] = useState<'idle' | 'processing' | 'success'>('idle');
  const [fractionalShares, setFractionalShares] = useState<number>(1);
  
  // --- FILTERING LOGIC ---
  const filteredData = useMemo(() => {
    return MOCK_DATA.filter(inv => {
      const matchesSearch = inv.client.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesRisk = riskFilter === "all" 
        ? true 
        : riskFilter === "high" ? inv.risk >= 80 : inv.risk < 80;

      const matchesAmount = amountFilter === "all"
        ? true
        : amountFilter === "small" ? inv.amount < 10000 
        : amountFilter === "mid" ? (inv.amount >= 10000 && inv.amount <= 25000) 
        : inv.amount > 25000;

      const matchesDue = dueFilter === "all"
        ? true
        : dueFilter === "30" ? new Date(inv.dueDate) <= new Date("2026-04-11") 
        : true;

      return matchesSearch && matchesRisk && matchesAmount && matchesDue;
    });
  }, [searchTerm, riskFilter, amountFilter, dueFilter]);

  const handleAddToCart = () => {
    if (!selectedInv) return;
    let finalPrice = selectedInv.type === 'fractional' ? fractionalShares * (selectedInv.sharePrice || 0) : selectedInv.price;
    const cartItem = { ...selectedInv, selectedAmount: finalPrice, shares: selectedInv.type === 'fractional' ? fractionalShares : undefined };
    setCart([...cart, cartItem]);
    setSelectedInv(null);
    setIsCartOpen(true);
  };

  const removeFromCart = (id: string) => setCart(cart.filter(item => item.id !== id));
  const cartTotal = cart.reduce((sum, item) => sum + item.selectedAmount, 0);

  const handleBatchCheckout = () => {
    setPurchaseStep('processing');
    setTimeout(() => { setPurchaseStep('success'); setCart([]); }, 3000);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans pb-20">
      <main className="max-w-[1400px] mx-auto p-6 md:p-12">
        
        {/* HEADER SECTION */}
        <header className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
                <span className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-black tracking-tighter uppercase italic">InvoiceChain</span>
                <span className="h-1 w-1 bg-slate-300 rounded-full"></span>
                <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Global Marketplace</span>
            </div>
            <h2 className="text-5xl font-black text-slate-900 tracking-tight">
              Active Invoices
            </h2>
          </div>
          
          <button onClick={() => setIsCartOpen(true)} className="relative p-5 bg-white border border-slate-200 rounded-[2rem] shadow-xl hover:shadow-2xl transition-all">
            <ShoppingCart size={24} className="text-slate-800" />
            {cart.length > 0 && <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] font-black px-2 py-1 rounded-full border-2 border-[#F8FAFC]">{cart.length}</span>}
          </button>
        </header>

        {/* 2. THE NAVIGATION BUTTONS */}
        <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit mb-8">
          <Link 
            href="/INVESTOR/marketplace"
            className={`px-6 py-2 rounded-xl text-sm font-black transition-all ${pathname === '/INVESTOR/marketplace' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
          >
            Marketplace
          </Link>
          <Link 
            href="/INVESTOR/portfolio"
            className={`px-6 py-2 rounded-xl text-sm font-black transition-all ${pathname === '/INVESTOR/portfolio' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
          >
            My Portfolio
          </Link>
        </div>

        {/* --- FILTER CONTROL PANEL --- */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12 bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <div className="relative col-span-1 md:col-span-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search client..." 
              className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-2xl border-none text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-2xl">
            <BarChart3 size={18} className="text-blue-500" />
            <select className="bg-transparent w-full text-xs font-black uppercase outline-none cursor-pointer" value={riskFilter} onChange={(e)=>setRiskFilter(e.target.value)}>
              <option value="all">Risk Levels</option>
              <option value="high">Safety (80+ Score)</option>
              <option value="low">Balanced (&lt; 80)</option>
            </select>
          </div>

          <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-2xl">
            <Banknote size={18} className="text-emerald-500" />
            <select className="bg-transparent w-full text-xs font-black uppercase outline-none cursor-pointer" value={amountFilter} onChange={(e)=>setAmountFilter(e.target.value)}>
              <option value="all">Amount</option>
              <option value="small">&lt; $10k</option>
              <option value="mid">$10k - $25k</option>
              <option value="large">&gt; $25k</option>
            </select>
          </div>

          <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-2xl">
            <Calendar size={18} className="text-amber-500" />
            <select className="bg-transparent w-full text-xs font-black uppercase outline-none cursor-pointer" value={dueFilter} onChange={(e)=>setDueFilter(e.target.value)}>
              <option value="all">Maturity</option>
              <option value="30">Next 30 Days</option>
            </select>
          </div>
        </div>

        {/* INVOICE GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {filteredData.map(inv => (
            <div key={inv.id} onClick={() => setViewingDetails(inv)} className="group bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer flex flex-col justify-between">
                <div>
                <div className="flex justify-between items-start mb-6">
                    <div className="flex flex-col gap-2">
                        <span className={`w-fit px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter border ${
                          inv.type === 'fixed' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                          inv.type === 'auction' ? 'bg-purple-50 text-purple-600 border-purple-100' : 
                          'bg-orange-50 text-orange-600 border-orange-100'
                        }`}>
                          {inv.type}
                        </span>
                        <div className="px-3 py-1 bg-slate-50 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-widest">{inv.sector}</div>
                    </div>
                    <div className={`px-2 py-1 rounded-md text-[9px] font-black uppercase ${inv.risk >= 85 ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>Risk: {inv.risk}</div>
                </div>
                <h3 className="text-2xl font-black text-slate-800 leading-tight mb-2 group-hover:text-blue-600 transition-colors">{inv.client}</h3>
                <p className="text-slate-400 text-xs font-bold flex items-center gap-1.5 mb-8"><Clock size={14}/> {inv.dueDate}</p>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Price</p>
                  <p className="text-2xl font-black text-slate-900">${inv.price.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Est. IRR</p>
                  <p className="text-xl font-black text-emerald-600">{inv.irr}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredData.length === 0 && (
          <div className="text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 mt-10">
            <p className="text-slate-400 font-black uppercase text-sm tracking-widest">No invoices match your filters</p>
          </div>
        )}
      </main>

      {/* --- MODALS & DRAWERS --- */}

      {/* Asset Detail Drawer */}
      {viewingDetails && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setViewingDetails(null)} />
          <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
            <div className="p-10 border-b flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white"><Database size={24} /></div>
                <div>
                  <h3 className="text-2xl font-black text-slate-800">Financial Audit</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter border ${
                      viewingDetails.type === 'fixed' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                      viewingDetails.type === 'auction' ? 'bg-purple-50 text-purple-600 border-purple-100' : 
                      'bg-orange-50 text-orange-600 border-orange-100'
                    }`}>
                      {viewingDetails.type} Asset Class
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={() => setViewingDetails(null)} className="p-3 hover:bg-white rounded-full transition shadow-sm"><X /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-12 space-y-12">
              <section className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl">
                  <p className="text-blue-400 font-bold text-xs uppercase tracking-[0.2em] mb-2">Immutable Record</p>
                  <h4 className="text-3xl font-black mb-6 leading-tight">Blockchain Verified<br/>Asset Ledger</h4>
                  <div className="bg-white/10 p-4 rounded-xl font-mono text-xs text-slate-300 mb-6 truncate">{viewingDetails.contractAddr}</div>
                  <div className="flex items-center gap-2 text-[10px] font-black text-emerald-400 bg-emerald-400/10 w-fit px-4 py-2 rounded-full border border-emerald-400/20">
                    <CheckCircle2 size={12} /> ON-CHAIN VERIFIED
                  </div>
              </section>

              <section>
                <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-10">Risk Profile Analytics</h5>
                <div className="space-y-8">
                  {viewingDetails.riskMetrics.map((metric, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between mb-3 text-sm font-black text-slate-700"><span>{metric.label}</span><span>{metric.score}%</span></div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.3)]" style={{ width: `${metric.score}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="p-10 border-t bg-white">
              <button 
                onClick={() => { setSelectedInv(viewingDetails); setViewingDetails(null); setFractionalShares(1); }}
                className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black text-xl hover:bg-blue-700 transition shadow-2xl shadow-blue-100"
              >
                {viewingDetails.type === 'auction' ? 'Join Auction' : 
                 viewingDetails.type === 'fractional' ? 'Purchase Shares' : 
                 'Acquire Asset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Investment Modal */}
      {selectedInv && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xl p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-12 shadow-2xl relative">
            <button onClick={() => setSelectedInv(null)} className="absolute right-8 top-8 p-2 hover:bg-slate-100 rounded-full transition"><X /></button>
            <h2 className="text-4xl font-black text-slate-900 mb-2">{selectedInv.client}</h2>
            <p className="text-slate-400 mb-10 uppercase text-[10px] font-black tracking-[0.2em]">{selectedInv.type} order placement</p>
            <div className="bg-[#F8FAFC] p-10 rounded-[2.5rem] border border-slate-100 mb-10 text-center">
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">Investment Total</p>
                <p className="text-6xl font-black text-slate-900 tracking-tighter">
                    ${selectedInv.type === 'fractional' ? (fractionalShares * (selectedInv.sharePrice || 0)).toLocaleString() : selectedInv.price.toLocaleString()}
                </p>
            </div>
            {selectedInv.type === 'fractional' && (
                <div className="mb-10 flex items-center justify-between bg-slate-50 p-6 rounded-2xl">
                    <button className="w-14 h-14 bg-white rounded-xl shadow-md font-black text-2xl" onClick={()=>setFractionalShares(Math.max(1, fractionalShares-1))}>-</button>
                    <span className="text-4xl font-black text-slate-900">{fractionalShares}</span>
                    <button className="w-14 h-14 bg-white rounded-xl shadow-md font-black text-2xl" onClick={()=>setFractionalShares(fractionalShares+1)}>+</button>
                </div>
            )}
            <button onClick={handleAddToCart} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-xl shadow-2xl hover:bg-black transition-all">Confirm & Add to Batch</button>
          </div>
        </div>
      )}

      {/* Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[70] flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-10 border-b flex justify-between items-center"><h3 className="text-2xl font-black text-slate-800">Batch Assets</h3><button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-slate-100 rounded-full"><X /></button></div>
            <div className="flex-1 overflow-y-auto p-10 space-y-6">
              {cart.length === 0 ? <div className="text-center py-20 opacity-20 font-black uppercase text-xs">Cart Empty</div> : cart.map((item, idx) => (
                <div key={idx} className="p-8 bg-[#F8FAFC] rounded-[2.5rem] border border-slate-100 relative group">
                  <button onClick={() => removeFromCart(item.id)} className="absolute -top-2 -right-2 bg-white text-rose-500 p-2.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
                  <p className="font-black text-slate-900 text-xl mb-1">{item.client}</p>
                  <div className="flex justify-between items-center"><p className="text-slate-500 text-xs font-black uppercase tracking-widest">{item.shares ? `${item.shares} Shares` : 'Full Asset'}</p><p className="font-black text-blue-600 text-lg">${item.selectedAmount.toLocaleString()}</p></div>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="p-12 border-t bg-[#F8FAFC] rounded-t-[3.5rem]">
                <div className="flex justify-between items-center mb-10"><span className="font-black text-slate-400 uppercase text-xs tracking-widest">Total Batch Value</span><span className="text-4xl font-black text-slate-900">${cartTotal.toLocaleString()}</span></div>
                {purchaseStep === 'idle' && <button onClick={handleBatchCheckout} className="w-full py-7 bg-slate-900 text-white rounded-[2rem] font-black text-2xl">Execute Checkout</button>}
                {purchaseStep === 'processing' && <div className="text-center py-4"><Loader2 className="animate-spin text-blue-600 mx-auto" size={40} /><p className="font-black text-slate-800 text-xs mt-4 uppercase">Verifying on Polygon...</p></div>}
                {purchaseStep === 'success' && <div className="text-center bg-emerald-50 p-10 rounded-[3rem]"><CheckCircle2 className="text-emerald-500 mx-auto mb-4" size={50} /><p className="font-black text-emerald-900 text-xl uppercase">Investment Minted</p></div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}