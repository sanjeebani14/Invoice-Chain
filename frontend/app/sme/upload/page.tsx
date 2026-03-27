"use client";

import { useState } from "react";
import { ArrowLeft, FileText, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import InvoiceUpload from "@/components/dashboard/InvoiceUpload";
import InvoiceCorrection from "@/components/dashboard/InvoiceCorrection";

export default function UploadPage() {
  const [invoiceData, setInvoiceData] = useState<any | null>(null);

  return (
    <div className="min-h-screen bg-muted/30 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Progress Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            Invoice Gateway
          </h1>
          <div className="flex items-center justify-center gap-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <span className={!invoiceData ? "text-primary" : "opacity-50"}>1. Upload</span>
            <span className="opacity-30">——</span>
            <span className={invoiceData ? "text-primary" : "opacity-50"}>2. Verify & List</span>
          </div>
        </div>

        {!invoiceData ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <InvoiceUpload onUploadSuccess={(data) => setInvoiceData(data)} />
            
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-background border border-border flex flex-col items-center text-center">
                <Zap className="h-5 w-5 text-amber-500 mb-2" />
                <p className="text-[10px] font-bold uppercase">Instant OCR</p>
                <p className="text-[9px] text-muted-foreground mt-1">AI extracts amount, date, and debtor automatically.</p>
              </div>
              <div className="p-4 rounded-xl bg-background border border-border flex flex-col items-center text-center">
                <FileText className="h-5 w-5 text-blue-500 mb-2" />
                <p className="text-[10px] font-bold uppercase">Smart Metadata</p>
                <p className="text-[9px] text-muted-foreground mt-1">Automatic categorization of industry sectors.</p>
              </div>
              <div className="p-4 rounded-xl bg-background border border-border flex flex-col items-center text-center">
                <ArrowLeft className="h-5 w-5 text-green-500 mb-2" />
                <p className="text-[10px] font-bold uppercase">Fraud Check</p>
                <p className="text-[9px] text-muted-foreground mt-1">Invoices are hashed on-chain to prevent double-funding.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-in zoom-in-95 duration-300">
            <div className="mb-4 flex justify-between items-center">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setInvoiceData(null)}
                className="text-xs font-bold"
              >
                <ArrowLeft className="mr-2 h-3 w-3" /> Cancel & Restart
              </Button>
            </div>
            <InvoiceCorrection 
              data={invoiceData} 
              onSaveSuccess={() => setInvoiceData(null)} 
            />
          </div>
        )}
      </div>
    </div>
  );
}