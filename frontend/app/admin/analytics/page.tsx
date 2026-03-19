"use client";
import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartPanel } from "@/components/dashboard/ChartPanel";
import { ChartSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { PlatformMetricsGrid } from "@/components/dashboard/PlatformMetricsGrid";
import { GrowthTrendChart } from "@/components/dashboard/GrowthTrendChart";
import { SectorExposureChart } from "@/components/dashboard/SectorExposureChart";
import {
  getRiskMetrics,
  getAllSellers,
  getPlatformHealthMetrics,
  getPlatformTimeSeries,
  getRiskHeatmap,
  PlatformHealthMetrics,
  PlatformStats,
  RiskHeatmapData,
} from "@/lib/api";

const GRID = "hsl(220, 13%, 90%)";
const TICK = { fill: "hsl(215, 15%, 47%)", fontSize: 11 };
const TT = {
  background: "#fff",
  border: "1px solid hsl(220, 13%, 87%)",
  borderRadius: 4,
  color: "hsl(220, 20%, 14%)",
};

type RiskDistributionPoint = {
  score_range: string;
  count: number;
};

type CreditRiskPoint = {
  credit_score: number;
  risk_score: number;
};

type DtiRiskPoint = {
  dti: number;
  risk_score: number;
};

type FraudTrendPoint = {
  date: string;
  alerts: number;
};

type MonthlyRiskPoint = {
  month: string;
  low: number;
  medium: number;
  high: number;
};

export default function Analytics() {
  // Risk Analytics state
  const [loading, setLoading] = useState(true);
  const [riskFilter, setRiskFilter] = useState("all");
  const [distribution, setDistribution] = useState<RiskDistributionPoint[]>([]);
  const [scatter, setScatter] = useState<CreditRiskPoint[]>([]);
  const [dtiScatter, setDtiScatter] = useState<DtiRiskPoint[]>([]);
  const [fraudTrend, setFraudTrend] = useState<FraudTrendPoint[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyRiskPoint[]>([]);

  // Platform Statistics state
  const [platformLoading, setPlatformLoading] = useState(true);
  const [healthMetrics, setHealthMetrics] =
    useState<PlatformHealthMetrics | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<PlatformStats[]>([]);
  const [riskHeatmap, setRiskHeatmap] = useState<RiskHeatmapData | null>(null);

  useEffect(() => {
    Promise.all([getRiskMetrics(), getAllSellers()]).then(
      ([metrics, sellers]) => {
        setDistribution(metrics.risk_distribution);
        setFraudTrend(metrics.fraud_alerts_over_time);
        setMonthlyTrend(metrics.seller_risk_trends);

        const filtered =
          riskFilter === "all"
            ? sellers
            : sellers.filter((s) => s.risk_level === riskFilter);
        setScatter(
          filtered
            .filter((s) => s.credit_score !== undefined)
            .map((s) => ({
              credit_score: s.credit_score as number,
              risk_score: s.composite_score,
            })),
        );
        setDtiScatter(
          filtered
            .filter((s) => s.debt_to_income !== undefined)
            .map((s) => ({
              dti: s.debt_to_income as number,
              risk_score: s.composite_score,
            })),
        );
        setLoading(false);
      },
    );
  }, [riskFilter]);

  // Load platform statistics
  useEffect(() => {
    Promise.all([
      getPlatformHealthMetrics(),
      getPlatformTimeSeries(12),
      getRiskHeatmap(),
    ]).then(([health, timeseries, heatmap]) => {
      setHealthMetrics(health);
      setTimeSeriesData(timeseries.data);
      setRiskHeatmap(heatmap);
      setPlatformLoading(false);
    });
  }, []);

  if (loading && platformLoading)
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ChartSkeleton key={i} />
          ))}
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Platform Analytics</h1>

      <Tabs defaultValue="platform" className="w-full">
        <TabsList>
          <TabsTrigger value="platform">Platform Statistics</TabsTrigger>
          <TabsTrigger value="risk">Risk Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="platform" className="space-y-6">
          {platformLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <ChartSkeleton key={i} />
              ))}
            </div>
          ) : (
            <>
              {healthMetrics && (
                <PlatformMetricsGrid
                  metrics={healthMetrics}
                  isLoading={platformLoading}
                />
              )}

              {timeSeriesData.length > 0 && (
                <GrowthTrendChart
                  data={timeSeriesData}
                  isLoading={platformLoading}
                />
              )}

              {riskHeatmap && (
                <SectorExposureChart
                  data={riskHeatmap}
                  isLoading={platformLoading}
                />
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="risk" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Risk Analytics</h2>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-36 border-gray-300 bg-white text-gray-900">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent className="border-gray-200 bg-white text-gray-900">
                <SelectItem
                  value="all"
                  className="text-gray-900 focus:bg-gray-100"
                >
                  All Levels
                </SelectItem>
                <SelectItem
                  value="LOW"
                  className="text-gray-900 focus:bg-gray-100"
                >
                  Low Risk
                </SelectItem>
                <SelectItem
                  value="MEDIUM"
                  className="text-gray-900 focus:bg-gray-100"
                >
                  Medium Risk
                </SelectItem>
                <SelectItem
                  value="HIGH"
                  className="text-gray-900 focus:bg-gray-100"
                >
                  High Risk
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <ChartSkeleton key={i} />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ChartPanel title="Risk Score Distribution">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={distribution}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={GRID}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="score_range"
                        tick={TICK}
                        axisLine={{ stroke: GRID }}
                      />
                      <YAxis tick={TICK} axisLine={{ stroke: GRID }} />
                      <Tooltip contentStyle={TT} />
                      <Bar
                        dataKey="count"
                        fill="hsl(210, 65%, 55%)"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartPanel>

                <ChartPanel title="Credit Score vs Risk Score">
                  <ResponsiveContainer width="100%" height={240}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                      <XAxis
                        dataKey="credit_score"
                        name="Credit Score"
                        tick={TICK}
                        axisLine={{ stroke: GRID }}
                      />
                      <YAxis
                        dataKey="risk_score"
                        name="Risk Score"
                        tick={TICK}
                        axisLine={{ stroke: GRID }}
                      />
                      <Tooltip contentStyle={TT} />
                      <Scatter data={scatter} fill="hsl(25, 90%, 55%)" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </ChartPanel>

                <ChartPanel title="Debt-to-Income vs Risk Score">
                  <ResponsiveContainer width="100%" height={240}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                      <XAxis
                        dataKey="dti"
                        name="DTI"
                        tick={TICK}
                        axisLine={{ stroke: GRID }}
                      />
                      <YAxis
                        dataKey="risk_score"
                        name="Risk Score"
                        tick={TICK}
                        axisLine={{ stroke: GRID }}
                      />
                      <Tooltip contentStyle={TT} />
                      <Scatter data={dtiScatter} fill="hsl(270, 50%, 55%)" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </ChartPanel>

                <ChartPanel title="Fraud Probability Trends">
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={fraudTrend}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={GRID}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        tick={TICK}
                        axisLine={{ stroke: GRID }}
                      />
                      <YAxis tick={TICK} axisLine={{ stroke: GRID }} />
                      <Tooltip contentStyle={TT} />
                      <Line
                        type="monotone"
                        dataKey="alerts"
                        stroke="hsl(0, 65%, 55%)"
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartPanel>
              </div>

              <ChartPanel title="Monthly Risk Trends">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={monthlyTrend}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={GRID}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tick={TICK}
                      axisLine={{ stroke: GRID }}
                    />
                    <YAxis tick={TICK} axisLine={{ stroke: GRID }} />
                    <Tooltip contentStyle={TT} />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="low"
                      stackId="1"
                      stroke="hsl(120, 40%, 55%)"
                      fill="hsl(120, 40%, 55%)"
                      fillOpacity={0.15}
                      strokeWidth={1.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="medium"
                      stackId="1"
                      stroke="hsl(38, 92%, 50%)"
                      fill="hsl(38, 92%, 50%)"
                      fillOpacity={0.15}
                      strokeWidth={1.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="high"
                      stackId="1"
                      stroke="hsl(0, 65%, 55%)"
                      fill="hsl(0, 65%, 55%)"
                      fillOpacity={0.15}
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartPanel>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
