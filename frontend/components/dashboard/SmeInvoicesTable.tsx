"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, AlertCircle, CheckCircle2, Clock } from "lucide-react";

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export function SmeInvoicesTable({ invoices }: { invoices: any[] }) {
  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "approved":
      case "verified":
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none">Verified</Badge>;
      case "pending":
      case "review":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none">In Review</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[120px]">Invoice #</TableHead>
          <TableHead>Client / Debtor</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((inv) => (
          <TableRow key={inv.id}>
            <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
            <TableCell className="font-medium">{inv.client_name}</TableCell>
            <TableCell>{INR.format(inv.amount)}</TableCell>
            <TableCell>{getStatusBadge(inv.status)}</TableCell>
            <TableCell className="text-right">
              <button className="p-2 hover:bg-muted rounded-full transition-colors">
                <Eye className="h-4 w-4 text-muted-foreground" />
              </button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}