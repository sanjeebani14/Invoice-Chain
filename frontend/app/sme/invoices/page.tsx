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
        const { data } = await api.get("/invoice/");
        setInvoices(data.invoices || []);
      } catch (err) {
        console.error("Failed to fetch invoices:", err);
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
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-semibold">Invoice #</th>
                <th className="px-4 py-3 text-left font-semibold">Client</th>
                <th className="px-4 py-3 text-left font-semibold">Amount</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice: any) => (
                <tr key={invoice.id} className="border-b hover:bg-muted/30 transition">
                  <td className="px-4 py-3">{invoice.invoice_number || '-'}</td>
                  <td className="px-4 py-3">{invoice.client_name || '-'}</td>
                  <td className="px-4 py-3">
                    {invoice.amount ? `₹${invoice.amount.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      invoice.status === 'approved' ? 'bg-green-100 text-green-800' :
                      invoice.status === 'pending_review' ? 'bg-yellow-100 text-yellow-800' :
                      invoice.status === 'flagged' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {invoice.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">{new Date(invoice.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}