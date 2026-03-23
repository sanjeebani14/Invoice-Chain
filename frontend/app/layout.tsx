import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/hooks/useAuth";
import { WalletProvider } from "@/context/WalletContext";
import { RPC_PROVIDER } from "@/lib/config";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "InvoiceChain",
  description: "InvoiceChain — Marketplace for verified invoices",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <WalletProvider rpcProvider={RPC_PROVIDER}>
            <TopBar />
            {children}
            <Toaster />
          </WalletProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
