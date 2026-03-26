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
  type ConcentrationAnalysis,
  getRiskMetrics,
  getAllSellers,
  getPlatformConcentration,
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

const toFiniteNumber = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
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
  const [platformConcentration, setPlatformConcentration] =
    useState<ConcentrationAnalysis | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadRiskAnalytics = async () => {
      setLoading(true);
      try {
        const [metricsResult, sellersResult] = await Promise.allSettled([
          getRiskMetrics(),
          getAllSellers(),
        ]);

        const metrics =
          metricsResult.status === "fulfilled" ? metricsResult.value : null;
        const sellers =
          sellersResult.status === "fulfilled" ? sellersResult.value : [];

        if (!isMounted) return;

        setDistribution(metrics?.risk_distribution ?? []);
        setFraudTrend(metrics?.fraud_alerts_over_time ?? []);
        setMonthlyTrend(metrics?.seller_risk_trends ?? []);

        const filtered =
          riskFilter === "all"
            ? sellers
            : sellers.filter((s) => s.risk_level === riskFilter);

        const creditScatterData: CreditRiskPoint[] = filtered
          .map((s) => {
            const creditScore = toFiniteNumber(s.credit_score);
            const riskScore = toFiniteNumber(s.composite_score);
            if (creditScore === null || riskScore === null) return null;
            return {
              credit_score: creditScore,
              risk_score: riskScore,
            };
          })
          .filter((point): point is CreditRiskPoint => point !== null);

        const dtiScatterData: DtiRiskPoint[] = filtered
          .map((s) => {
            const dti = toFiniteNumber(s.debt_to_income);
            const riskScore = toFiniteNumber(s.composite_score);
            if (dti === null || riskScore === null) return null;
            return {
              dti,
              risk_score: riskScore,
            };
          })
          .filter((point): point is DtiRiskPoint => point !== null);

        setScatter(creditScatterData);
        setDtiScatter(dtiScatterData);
      } catch {
        if (!isMounted) return;
        setDistribution([]);
        setFraudTrend([]);
        setMonthlyTrend([]);
        setScatter([]);
        setDtiScatter([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadRiskAnalytics();

    return () => {
      isMounted = false;
    };
  }, [riskFilter]);

  // Load platform statistics
  useEffect(() => {
    let isMounted = true;

    // Fire all requests concurrently, but only block the skeleton on "health"
    // so the first KPI grid can appear quickly.
    setPlatformLoading(true);

    void getPlatformHealthMetrics()
      .then((data) => {
        if (!isMounted) return;
        setHealthMetrics(data);
      })
      .catch(() => {
        if (!isMounted) return;
        setHealthMetrics(null);
      })
      .finally(() => {
        if (!isMounted) return;
        setPlatformLoading(false);
      });

    void getPlatformTimeSeries(12, true)
      .then((data) => {
        if (!isMounted) return;
        setTimeSeriesData(data?.data ?? []);
      })
      .catch(() => {
        if (!isMounted) return;
        setTimeSeriesData([]);
      });

    void getRiskHeatmap()
      .then((data) => {
        if (!isMounted) return;
        setRiskHeatmap(data);
      })
      .catch(() => {
        if (!isMounted) return;
        setRiskHeatmap(null);
      });

    void getPlatformConcentration(20)
      .then((data) => {
        if (!isMounted) return;
        setPlatformConcentration(data);
      })
      .catch(() => {
        if (!isMounted) return;
        setPlatformConcentration(null);
      });

    return () => {
      isMounted = false;
    };
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
          {platformLoading && !healthMetrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <ChartSkeleton key={i} />
              ))}
            </div>
          )}
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

          {platformConcentration && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ChartPanel title="Platform Concentration Alerts">
                <div className="space-y-2 text-sm text-slate-700">
                  <p className="font-semibold text-foreground">
                    Top 5 sellers share{" "}
                    {platformConcentration.top_5_seller_share_pct.toFixed(2)}%
                    of total volume
                  </p>
                  {platformConcentration.alerts.length === 0 && (
                    <p>
                      No concentration alerts above{" "}
                      {platformConcentration.threshold_pct}%.
                    </p>
                  )}
                  {platformConcentration.alerts.slice(0, 6).map((alert) => (
                    <div
                      key={`${alert.type}-${alert.key}`}
                      className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
                    >
                      <span className="capitalize text-slate-900">
                        {alert.type}: {alert.key}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {alert.percentage.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              </ChartPanel>

              <ChartPanel title="Sector and Geo Concentration">
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div>
                    <p className="mb-1 font-semibold text-foreground">
                      Top Sectors
                    </p>
                    {platformConcentration.sector_breakdown
                      .slice(0, 5)
                      .map((item) => (
                        <div
                          key={item.key}
                          className="flex items-center justify-between"
                        >
                          <span className="text-white">{item.key}</span>
                          <span className="text-white">
                            {item.percentage.toFixed(2)}%
                          </span>
                        </div>
                      ))}
                  </div>
                  <div>
                    <p className="mb-1 font-semibold text-foreground">
                      Top Geographies
                    </p>
                    {platformConcentration.geo_breakdown
                      .slice(0, 5)
                      .map((item) => (
                        <div
                          key={item.key}
                          className="flex items-center justify-between"
                        >
                          <span className="text-white">{item.key}</span>
                          <span className="text-white">
                            {item.percentage.toFixed(2)}%
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </ChartPanel>
            </div>
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
                  {scatter.length === 0 ? (
                    <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                      No valid credit score data available for this filter.
                    </div>
                  ) : (
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
                        <Scatter
                          data={scatter}
                          fill="hsl(25, 90%, 55%)"
                          isAnimationActive={false}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  )}
                </ChartPanel>

                <ChartPanel title="Debt-to-Income vs Risk Score">
                  {dtiScatter.length === 0 ? (
                    <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                      No valid debt-to-income data available for this filter.
                    </div>
                  ) : (
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
                        <Scatter
                          data={dtiScatter}
                          fill="hsl(270, 50%, 55%)"
                          isAnimationActive={false}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  )}
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
