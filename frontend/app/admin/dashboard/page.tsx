"use client";
import { useEffect, useState } from "react";
import {
  Users,
  AlertTriangle,
  Shield,
  TrendingUp,
  Activity,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ChartPanel } from "@/components/dashboard/ChartPanel";
import {
  MetricCardSkeleton,
  ChartSkeleton,
} from "@/components/dashboard/LoadingSkeleton";
import { getRiskMetrics, type RiskMetrics } from "@/lib/api";

const COLORS = {
  green: "hsl(120, 40%, 55%)",
  yellow: "hsl(38, 92%, 50%)",
  red: "hsl(0, 65%, 55%)",
  blue: "hsl(210, 65%, 55%)",
  orange: "hsl(25, 90%, 55%)",
  purple: "hsl(270, 50%, 55%)",
};

const PIE_COLORS = [COLORS.green, COLORS.yellow, COLORS.red];

const GRID_STROKE = "hsl(220, 13%, 90%)";
const TICK_STYLE = { fill: "hsl(215, 15%, 47%)", fontSize: 11 };
const TOOLTIP_STYLE = {
  background: "#fff",
  border: "1px solid hsl(220, 13%, 87%)",
  borderRadius: 4,
  color: "hsl(220, 20%, 14%)",
};

export default function Dashboard() {
  const [metrics, setMetrics] = useState<RiskMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const data = await getRiskMetrics();
      setMetrics(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ChartSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Risk Monitoring Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard
          title="Total Sellers"
          value={metrics.total_sellers.toLocaleString()}
          icon={Users}
          trend="+12 this week"
        />
        <MetricCard
          title="High Risk"
          value={metrics.high_risk}
          icon={AlertTriangle}
          color="red"
          trend="7.1% of total"
        />
        <MetricCard
          title="Medium Risk"
          value={metrics.medium_risk}
          icon={Shield}
          color="yellow"
          trend="27.4% of total"
        />
        <MetricCard
          title="Low Risk"
          value={metrics.low_risk}
          icon={Shield}
          color="green"
          trend="65.4% of total"
        />
        <MetricCard
          title="Avg Risk Score"
          value={metrics.avg_composite_score.toFixed(1)}
          icon={Activity}
          trend="Last 30 days"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartPanel title="Risk Score Distribution">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={metrics.risk_distribution}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={GRID_STROKE}
                vertical={false}
              />
              <XAxis
                dataKey="score_range"
                tick={TICK_STYLE}
                axisLine={{ stroke: GRID_STROKE }}
              />
              <YAxis tick={TICK_STYLE} axisLine={{ stroke: GRID_STROKE }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" fill={COLORS.blue} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Fraud Alerts Over Time">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={metrics.fraud_alerts_over_time}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={GRID_STROKE}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={TICK_STYLE}
                axisLine={{ stroke: GRID_STROKE }}
              />
              <YAxis tick={TICK_STYLE} axisLine={{ stroke: GRID_STROKE }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line
                type="monotone"
                dataKey="alerts"
                stroke={COLORS.red}
                strokeWidth={1.5}
                dot={false}
              />
              <defs>
                <linearGradient id="alertsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.red} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={COLORS.red} stopOpacity={0} />
                </linearGradient>
              </defs>
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Seller Risk Trends">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={metrics.seller_risk_trends}>
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
              <YAxis tick={TICK_STYLE} axisLine={{ stroke: GRID_STROKE }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area
                type="monotone"
                dataKey="low"
                stackId="1"
                stroke={COLORS.green}
                fill={COLORS.green}
                fillOpacity={0.2}
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="medium"
                stackId="1"
                stroke={COLORS.yellow}
                fill={COLORS.yellow}
                fillOpacity={0.2}
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="high"
                stackId="1"
                stroke={COLORS.red}
                fill={COLORS.red}
                fillOpacity={0.2}
                strokeWidth={1.5}
              />
              <Legend />
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Risk Level Breakdown">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={metrics.risk_level_breakdown}
                dataKey="count"
                nameKey="level"
                cx="50%"
                cy="50%"
                outerRadius={75}
                label={(entry) => `${entry.payload.level}: ${entry.payload.count}`}
                fontSize={11}
              >
                {metrics.risk_level_breakdown.map((_, index) => (
                  <Cell
                    key={index}
                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <ChartPanel title="Top 10 High Risk Sellers">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={metrics.top_high_risk_sellers} layout="vertical">
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={GRID_STROKE}
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={TICK_STYLE}
              axisLine={{ stroke: GRID_STROKE }}
            />
            <YAxis
              dataKey="seller_id"
              type="category"
              tick={TICK_STYLE}
              width={60}
              axisLine={{ stroke: GRID_STROKE }}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="score" fill={COLORS.red} radius={[0, 2, 2, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}
