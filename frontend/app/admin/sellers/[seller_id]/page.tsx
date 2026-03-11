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
import { MetricCardSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { getSellerScore, type SellerScore } from "@/lib/api";
import { toast } from "sonner";

const GRID_STROKE = "hsl(220, 13%, 90%)";
const TICK_STYLE = { fill: "hsl(215, 15%, 47%)", fontSize: 11 };
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
      .catch(() => {
        if (mounted) toast.error("Seller not found");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [seller_id]);


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
      label: "Annual Income",
      value: seller.annual_income
        ? `$${seller.annual_income.toLocaleString()}`
        : "N/A",
    },
    {
      label: "Loan Amount",
      value: seller.loan_amount
        ? `$${seller.loan_amount.toLocaleString()}`
        : "N/A",
    },
    { label: "Debt to Income", value: seller.debt_to_income ?? "N/A" },
    { label: "Employment Years", value: seller.employment_years ?? "N/A" },
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
              <Button
                size="sm"
                variant="destructive"
                onClick={() => toast.success("Flagged for fraud review")}
              >
                <Flag className="h-3 w-3 mr-1" /> Flag for Review
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

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
              stroke="hsl(25, 90%, 55%)"
              strokeWidth={1.5}
              dot={{ fill: "hsl(25, 90%, 55%)", r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}
