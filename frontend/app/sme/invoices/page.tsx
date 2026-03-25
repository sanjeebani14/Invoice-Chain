"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function SmeInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMyInvoices = async () => {
      try {
        const { data } = await api.get("/invoice/me"); // Custom endpoint for SME's own invoices
        setInvoices(data);
      } catch (err) {
        console.error("Failed to fetch invoices");
      } finally {
        setLoading(false);
      }
    };
    fetchMyInvoices();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="container mx-auto py-10 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">My Invoices</h1>
          <p className="text-sm text-muted-foreground">Track and manage your listed receivables.</p>
        </div>
        <Button asChild>
          <Link href="/sme/upload"><Plus className="mr-2 h-4 w-4" /> New Invoice</Link>
        </Button>
      </div>

      {/* Insert Table Component Here */}
      {invoices.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed rounded-xl">
          <p className="text-muted-foreground">No invoices found. Start by uploading one.</p>
        </div>
      ) : (
        <div className="rounded-md border bg-card">
           {/* Map your invoices into a Table.Root here */}
        </div>
      )}
    </div>
  );
}