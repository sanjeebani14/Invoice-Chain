"use client";
import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/components/dashboard/RiskBadge";
import { TableSkeleton } from "@/components/dashboard/LoadingSkeleton";
import {
  getFraudQueue,
  reviewFraudItem,
  deleteFraudItem,
  explainInvoiceAnomaly,
  type FraudQueueItem,
  type InvoiceAnomalyExplanation,
} from "@/lib/api";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  Pending: "bg-risk-medium/15 text-risk-medium border-risk-medium/30",
  "Under Review": "bg-chart-blue/15 text-chart-blue border-chart-blue/30",
  Resolved: "bg-risk-low/15 text-risk-low border-risk-low/30",
};

export default function FraudQueue() {
  const [queue, setQueue] = useState<FraudQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExplanation, setSelectedExplanation] =
    useState<InvoiceAnomalyExplanation | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);

  useEffect(() => {
    getFraudQueue().then((d) => {
      setQueue(d);
      setLoading(false);
    });
  }, []);

  const handleAction = async (id: number, action: string) => {
    await reviewFraudItem(id, action);
    setQueue((q) =>
      q.map((item) =>
        item.id === id ? { ...item, status: "Resolved" as const } : item,
      ),
    );
    toast.success(`Item #${id} ${action}d`);
  };

  const handleExplain = async (invoiceId?: number) => {
    if (!invoiceId) {
      toast.error("No invoice associated with this flag.");
      return;
    }
    setExplainLoading(true);
    try {
      const data = await explainInvoiceAnomaly(invoiceId);
      setSelectedExplanation(data);
    } catch {
      toast.error("Failed to fetch anomaly explanation");
    } finally {
      setExplainLoading(false);
    }
  };

  const handleDeleteResolved = async (id: number) => {
    const confirmed = window.confirm(
      "Delete this resolved fraud review item from the queue?",
    );
    if (!confirmed) return;

    try {
      await deleteFraudItem(id);
      setQueue((q) => q.filter((item) => item.id !== id));
      toast.success(`Removed item #${id}`);
    } catch {
      toast.error("Failed to delete queue item");
    }
  };

  const splitReasons = (reason: string) =>
    reason
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Fraud Review Queue</h1>
      {loading ? (
        <TableSkeleton />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-card hover:bg-card">
                <TableHead>Queue ID</TableHead>
                <TableHead>Invoice ID</TableHead>
                <TableHead>Seller ID</TableHead>
                <TableHead>Risk Score</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead className="hidden md:table-cell">
                  Fraud Reason
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  Created At
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((item) => (
                <TableRow key={item.id} className="hover:bg-accent">
                  <TableCell className="font-mono">#{item.id}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.invoice_id ? `#${item.invoice_id}` : "-"}
                  </TableCell>
                  <TableCell className="font-mono">#{item.seller_id}</TableCell>
                  <TableCell>
                    <RiskBadge
                      level={
                        item.severity ??
                        (item.risk_score >= 80
                          ? "HIGH"
                          : item.risk_score >= 50
                            ? "MEDIUM"
                            : "LOW")
                      }
                    />
                    <span className="ml-2 text-sm">{item.risk_score}</span>
                  </TableCell>
                  <TableCell>
                    <RiskBadge
                      level={
                        item.severity ??
                        (item.risk_score >= 80
                          ? "HIGH"
                          : item.risk_score >= 50
                            ? "MEDIUM"
                            : "LOW")
                      }
                    />
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[26rem]">
                    <div className="space-y-1">
                      {splitReasons(item.fraud_reason)
                        .slice(0, 2)
                        .map((reason, idx) => (
                          <p key={idx} className="truncate" title={reason}>
                            {reason}
                          </p>
                        ))}
                      {splitReasons(item.fraud_reason).length > 2 ? (
                        <p className="text-xs text-muted-foreground/80">
                          +{splitReasons(item.fraud_reason).length - 2} more
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={statusColors[item.status]}
                    >
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.status !== "Resolved" ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-risk-low h-7 text-xs"
                          onClick={() => handleAction(item.id, "approve")}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive h-7 text-xs"
                          onClick={() => handleAction(item.id, "reject")}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-chart-blue h-7 text-xs"
                          disabled={explainLoading}
                          onClick={() => handleExplain(item.invoice_id)}
                        >
                          {explainLoading ? "Explaining..." : "Why flagged?"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-risk-medium h-7 text-xs hidden lg:inline-flex"
                          onClick={() => handleAction(item.id, "escalate")}
                        >
                          Escalate
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Done
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive h-7 text-xs"
                          onClick={() => handleDeleteResolved(item.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {selectedExplanation && (
        <div className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <p className="font-semibold">
              Invoice #{selectedExplanation.invoice_id} anomaly details
            </p>
            <button
              className="text-muted-foreground hover:underline"
              onClick={() => setSelectedExplanation(null)}
            >
              Close
            </button>
          </div>
          <p>
            Severity:{" "}
            <span className="font-medium">
              {selectedExplanation.anomaly.severity}
            </span>{" "}
            | Anomaly score:{" "}
            <span className="font-mono">
              {selectedExplanation.anomaly.anomaly_score.toFixed(4)}
            </span>{" "}
            | Amount z-score:{" "}
            <span className="font-mono">
              {selectedExplanation.anomaly.amount_velocity_zscore.toFixed(2)}
            </span>{" "}
            | Benford deviation:{" "}
            <span className="font-mono">
              {selectedExplanation.anomaly.benford_deviation.toFixed(3)}
            </span>
          </p>
          <ul className="list-disc list-inside text-muted-foreground">
            {selectedExplanation.anomaly.reasons.map((r, idx) => (
              <li key={idx}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
