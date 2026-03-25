"use client";
import { useEffect, useState } from "react";
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
  const [actingId, setActingId] = useState<number | null>(null);

  useEffect(() => {
    getFraudQueue().then((d) => {
      setQueue(d);
      setLoading(false);
    });
  }, []);

  const handleAction = async (
    id: number,
    action: "clear" | "confirm_fraud",
  ) => {
    setActingId(id);
    try {
      await reviewFraudItem(id, action);
      setQueue((q) =>
        q.map((item) =>
          item.id === id
            ? {
                ...item,
                status: "Resolved" as const,
                resolution_action: action,
              }
            : item,
        ),
      );
      toast.success(
        action === "clear"
          ? `Flag #${id} cleared`
          : `Flag #${id} marked as confirmed fraud`,
      );
    } catch {
      toast.error("Failed to submit review action");
    } finally {
      setActingId(null);
    }
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

  const formatScore = (value?: number | null, digits: number = 3) => {
    if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
    return value.toFixed(digits);
  };

  const reasonsForItem = (item: FraudQueueItem) => {
    if (item.reasons && item.reasons.length > 0) return item.reasons;
    return item.fraud_reason
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
  };

  return (
    <div className="space-y-6">
      <div className="px-1 py-1">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Fraud Review Queue
        </h1>
        <p className="mt-1 text-sm text-slate-200">
          Explainable anomaly decisions for pending invoice flags.
        </p>
      </div>
      {loading ? (
        <TableSkeleton />
      ) : (
        <div className="grid gap-4">
          {queue.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-border bg-card px-4 py-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Queue #{item.id} • Invoice{" "}
                    {item.invoice_id ? `#${item.invoice_id}` : "N/A"} • Seller #
                    {item.seller_id}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <RiskBadge level={item.severity ?? "LOW"} />
                    <Badge
                      variant="outline"
                      className={statusColors[item.status]}
                    >
                      {item.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-right">
                  <p className="text-xs text-muted-foreground">Anomaly Score</p>
                  <p className="font-mono text-lg font-semibold">
                    {formatScore(item.anomaly_score ?? null, 4)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-background px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Risk vs Anomaly Context
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md bg-muted/40 px-2 py-2">
                      <p className="text-xs text-muted-foreground">
                        Seller Composite
                      </p>
                      <p className="font-mono font-semibold">
                        {formatScore(
                          item.seller_composite_score ?? item.risk_score,
                          0,
                        )}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/40 px-2 py-2">
                      <p className="text-xs text-muted-foreground">
                        Invoice Anomaly
                      </p>
                      <p className="font-mono font-semibold">
                        {formatScore(item.anomaly_score ?? null, 4)}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/40 px-2 py-2">
                      <p className="text-xs text-muted-foreground">
                        Global Score
                      </p>
                      <p className="font-mono font-semibold">
                        {formatScore(item.anomaly_score ?? null, 4)}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/40 px-2 py-2">
                      <p className="text-xs text-muted-foreground">
                        Fraud Probability
                      </p>
                      <p className="font-mono font-semibold">
                        {typeof item.risk_score === "number"
                          ? `${(item.risk_score * 100).toFixed(1)}%`
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-background px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Reasoning Panel
                  </p>
                  <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    {reasonsForItem(item)
                      .slice(0, 5)
                      .map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                  </ul>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {item.status !== "Resolved" ? (
                  <>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={actingId === item.id}
                      onClick={() => handleAction(item.id, "clear")}
                    >
                      Clear Flag
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={actingId === item.id}
                      onClick={() => handleAction(item.id, "confirm_fraud")}
                    >
                      Confirm Fraud
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-chart-blue"
                      disabled={explainLoading}
                      onClick={() => handleExplain(item.invoice_id)}
                    >
                      {explainLoading ? "Loading..." : "Refresh Explanation"}
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground">
                      Resolved via: {item.resolution_action ?? "manual"}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDeleteResolved(item.id)}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
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
