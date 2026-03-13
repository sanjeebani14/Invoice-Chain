"use client";
import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Flag } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskBadge } from "@/components/dashboard/RiskBadge";
import { ChartPanel } from "@/components/dashboard/ChartPanel";
import { ShapForceChart } from "@/components/dashboard/ShapForceChart";
import { MetricCardSkeleton } from "@/components/dashboard/LoadingSkeleton";
import {
  getSellerScore,
  getSellerFraudFlags,
  manualFraudFlag,
  type SellerScore,
} from "@/lib/api";
import { toast } from "sonner";

// Light-mode friendly chart colors
const GRID_STROKE = "hsl(210, 16%, 90%)";
const TICK_STYLE = { fill: "hsl(215, 15%, 35%)", fontSize: 11 };
const TOOLTIP_STYLE = {
  background: "#fff",
  border: "1px solid hsl(220, 13%, 87%)",
  borderRadius: 4,
  color: "hsl(220, 20%, 14%)",
};

export default function SellerDetails() {
  const params = useParams();
  const seller_id = params?.seller_id as string | undefined;
  const router = useRouter();
  const [seller, setSeller] = useState<SellerScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [inQueue, setInQueue] = useState(false);
  const [flagging, setFlagging] = useState(false);

  const deterministicOffset = (seed: number, index: number) => {
    const n = ((seed * 9301 + (index + 1) * 49297) % 233280) / 233280;
    return Math.floor(n * 20 - 10); // -10..9
  };

  const mockHistory = useMemo(() => {
    if (!seller) return [];
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return Array.from({ length: 12 }, (_, i) => ({
      month: months[i],
      score: Math.max(
        0,
        Math.min(
          100,
          (seller.composite_score ?? 50) +
            deterministicOffset(seller.seller_id, i),
        ),
      ),
    }));
  }, [seller]);

  useEffect(() => {
    if (!seller_id) return;
    let mounted = true;
    getSellerScore(Number(seller_id))
      .then((data) => {
        if (mounted) setSeller(data);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [seller_id]);

  useEffect(() => {
    if (!seller_id) return;
    getSellerFraudFlags(Number(seller_id))
      .then((flags) => {
        // Consider any non-resolved flag as "in the queue"
        setInQueue(flags.some((f) => f.status !== "Resolved"));
      })
      .catch(() => {
        // Ignore errors here – queue is an enhancement
      });
  }, [seller_id]);

  const handleManualFlag = async () => {
    if (!seller) return;
    const reason = window.prompt("Enter fraud reason for this seller:", "");
    if (reason === null) return;

    const cleanedReason = reason.trim();
    if (!cleanedReason) {
      toast.error("Fraud reason is required");
      return;
    }

    setFlagging(true);
    try {
      await manualFraudFlag({
        seller_id: seller.seller_id,
        reason: cleanedReason,
        severity: "HIGH",
      });
      setInQueue(true);
      toast.success("Seller flagged for fraud review");
    } catch {
      toast.error("Failed to flag seller for review");
    } finally {
      setFlagging(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!seller)
    return <div className="text-muted-foreground">Seller not found.</div>;

  const details = [
    { label: "Seller ID", value: `#${seller.seller_id}` },
    { label: "Credit Score", value: seller.credit_score ?? "N/A" },
    {
      label: "Financial Risk (0-100)",
      value: seller.breakdown?.financial_risk ?? "N/A",
    },
    {
      label: "Relationship Stability (yrs)",
      value:
        seller.breakdown?.relationship_stability !== undefined
          ? seller.breakdown.relationship_stability.toFixed(1)
          : "N/A",
    },
    {
      label: "Core Enterprise Quality",
      value: seller.breakdown?.buyer_quality ?? "N/A",
    },
    {
      label: "Logistics Consistency",
      value: seller.breakdown?.logistics_quality ?? "N/A",
    },
    {
      label: "ESG Score",
      value: seller.breakdown?.esg_score ?? "N/A",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/admin/sellers")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Seller #{seller.seller_id}</h1>
        <RiskBadge level={seller.risk_level} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Seller Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              {details.map((d) => (
                <div key={d.label}>
                  <dt className="text-xs text-muted-foreground">{d.label}</dt>
                  <dd className="text-sm font-medium mt-1">{d.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Risk Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-xs text-muted-foreground">
                Composite Risk Score
              </span>
              <div className="text-3xl font-bold mt-1">
                {seller.composite_score}
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Risk Level</span>
              <div className="mt-1">
                <RiskBadge level={seller.risk_level} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={() => toast.success("Risk score recalculated")}
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Recalculate
              </Button>
              {inQueue ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push("/admin/fraud-queue")}
                >
                  <Flag className="h-3 w-3 mr-1" /> View in Queue
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={flagging}
                  onClick={handleManualFlag}
                >
                  <Flag className="h-3 w-3 mr-1" />{" "}
                  {flagging ? "Flagging..." : "Flag for Review"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {seller.insights && seller.insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Actionable Insights (Model Explanation)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground list-disc list-inside">
              {seller.insights.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartPanel title="Historical Risk Score">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={mockHistory}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={GRID_STROKE}
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={TICK_STYLE}
                axisLine={{ stroke: GRID_STROKE }}
              />
              <YAxis
                tick={TICK_STYLE}
                domain={[0, 100]}
                axisLine={{ stroke: GRID_STROKE }}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line
                type="monotone"
                dataKey="score"
                stroke="hsl(222, 84%, 56%)"
                strokeWidth={1.5}
                dot={{ fill: "hsl(222, 84%, 56%)", r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Feature Impact on Risk (SHAP-style)">
          <ShapForceChart contributors={seller.risk_contributors} />
        </ChartPanel>
      </div>
    </div>
  );
}
