import Link from "next/link";
import { Zap, TrendingUp, Landmark, Shield } from "lucide-react"; // Nice icons to replace material symbols

export default function Home() {
  return (
    <main className="relative min-h-screen flex flex-col items-center overflow-hidden">
      {/* Background Glow Effect */}
      <div className="absolute top-0 -z-10 h-full w-full bg-[#131313]">
        <div className="absolute bottom-auto left-auto right-0 top-0 h-[500px] w-[500px] -translate-x-[30%] translate-y-[20%] rounded-full bg-primary/10 opacity-50 blur-[80px]"></div>
      </div>

      <div className="container mx-auto px-6 py-12 flex flex-col items-center text-center">
        <div className="max-w-6xl space-y-6 mb-18">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-4 backdrop-blur-md">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-medium tracking-widest text-slate-300 uppercase">
              Now Live on Ethereum Mainnet
            </span>
          </div>

          <h1 className="font-sans font-bold text-5xl md:text-7xl lg:text-8xl tracking-tighter text-white leading-[1.1]">
            Invoice<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400"> Chain</span>
          </h1>

          <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto">
            Unlock immediate liquidity and high-yield investment opportunities by transforming unpaid invoices into secure, fractionalized NFTs.
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl">
          {/* Investor Card */}
          <div className="group relative flex flex-col p-8 md:p-12 rounded-[2.5rem] bg-white/[0.03] border border-white/10 transition-all duration-300 hover:scale-[1.02] hover:bg-white/[0.06] text-left">
            <div className="p-3 bg-indigo-500/20 rounded-2xl w-fit mb-6">
              <TrendingUp className="text-indigo-400" size={28} />
            </div>
            <h2 className="text-3xl font-bold mb-4 text-white">I want to Invest</h2>
            <p className="text-slate-400 mb-10 text-lg leading-relaxed">
              Access a curated marketplace of verified invoices. Diversify your crypto portfolio.
            </p>
            <Link 
              href="/login" 
              className="mt-auto inline-flex items-center gap-2 text-sm font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Get Started <Zap size={16} />
            </Link>
          </div>

          {/* Seller Card */}
          <div className="group relative flex flex-col p-8 md:p-12 rounded-[2.5rem] bg-white/[0.03] border border-white/10 transition-all duration-300 hover:scale-[1.02] hover:bg-white/[0.06] text-left">
            <div className="p-3 bg-blue-500/20 rounded-2xl w-fit mb-6">
              <Landmark className="text-blue-400" size={28} />
            </div>
            <h2 className="text-3xl font-bold mb-4 text-white">I want to Sell</h2>
            <p className="text-slate-400 mb-10 text-lg leading-relaxed">
              Convert your outstanding invoices into instant USDT or USDC.
            </p>
            <Link 
              href="/login" 
              className="mt-auto inline-flex items-center gap-2 text-sm font-bold text-blue-400 hover:text-blue-300 transition-colors"
            >
              Access Capital <Zap size={16} />
            </Link>
          </div>

          {/* Admin Card */}
          <div className="group relative flex flex-col p-8 md:p-12 rounded-[2.5rem] bg-white/[0.03] border border-white/10 transition-all duration-300 hover:scale-[1.02] hover:bg-white/[0.06] text-left">
            <div className="p-3 bg-emerald-500/20 rounded-2xl w-fit mb-6">
              <Shield className="text-emerald-400" size={28} />
            </div>
            <h2 className="text-3xl font-bold mb-4 text-white">Admin Portal</h2>
            <p className="text-slate-400 mb-10 text-lg leading-relaxed">
              Manage users, invoices, risk metrics, and admin operations.
            </p>
            <Link
              href="/login"
              className="mt-auto inline-flex items-center gap-2 text-sm font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Admin Login <Zap size={16} />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}