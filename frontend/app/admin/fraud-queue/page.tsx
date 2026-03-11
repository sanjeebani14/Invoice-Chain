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
import { getFraudQueue, reviewFraudItem, type FraudQueueItem } from "@/lib/api";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  Pending: "bg-risk-medium/15 text-risk-medium border-risk-medium/30",
  "Under Review": "bg-chart-blue/15 text-chart-blue border-chart-blue/30",
  Resolved: "bg-risk-low/15 text-risk-low border-risk-low/30",
};

export default function FraudQueue() {
  const [queue, setQueue] = useState<FraudQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

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
                <TableHead>Seller ID</TableHead>
                <TableHead>Risk Score</TableHead>
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
                  <TableCell className="font-mono">#{item.seller_id}</TableCell>
                  <TableCell>
                    <RiskBadge
                      level={
                        item.risk_score >= 80
                          ? "HIGH"
                          : item.risk_score >= 50
                            ? "MEDIUM"
                            : "LOW"
                      }
                    />
                    <span className="ml-2 text-sm">{item.risk_score}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-48 truncate">
                    {item.fraud_reason}
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
                          className="text-risk-medium h-7 text-xs hidden lg:inline-flex"
                          onClick={() => handleAction(item.id, "escalate")}
                        >
                          Escalate
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Done
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
