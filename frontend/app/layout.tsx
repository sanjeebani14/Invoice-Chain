import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import { WalletProvider } from "@/context/WalletContext";
import { RPC_PROVIDER } from "@/lib/config";
import { AppShell } from "@/components/layout/AppShell"; // We'll create this
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "InvoiceChain | Decentralized Liquidity",
  description: "Institutional-grade invoice factoring meets DeFi.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="dark"> 
      <body className={`${inter.variable} ${manrope.variable} font-sans antialiased bg-[#131313] text-[#e5e2e1]`}>
        <AuthProvider>
          <WalletProvider rpcProvider={RPC_PROVIDER}>
            <AppShell>{children}</AppShell>
            <Toaster position="top-center" richColors />
          </WalletProvider>
        </AuthProvider>
      </body>
    </html>
  );
}