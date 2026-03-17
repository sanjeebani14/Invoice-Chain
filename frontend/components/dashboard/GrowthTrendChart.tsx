"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";
import { ChartPanel } from "./ChartPanel";
import { PlatformStats } from "@/lib/api";

interface GrowthTrendChartProps {
  data: PlatformStats[];
  isLoading?: boolean;
}

export function GrowthTrendChart({
  data,
  isLoading = false,
}: GrowthTrendChartProps) {
  if (isLoading) {
    return <div className="h-80 bg-gray-200 rounded-lg animate-pulse" />;
  }

  const chartData = data.map((stat) => ({
    month: stat.period.slice(-2),
    gmv: stat.total_funded_volume / 1000000, // Convert to millions
    invoices: stat.total_invoices_funded,
    repaymentRate: stat.repayment_metrics.repayment_rate,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartPanel title="Funded Volume Trend (GMV)">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorGmv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 90%)" />
            <XAxis dataKey="month" stroke="hsl(215, 15%, 47%)" />
            <YAxis stroke="hsl(215, 15%, 47%)" label={{ value: "GMV ($M)", angle: -90, position: "insideLeft" }} />
            <Tooltip
              contentStyle={{
                background: "#fff",
                border: "1px solid hsl(220, 13%, 87%)",
                borderRadius: 4,
              }}
              formatter={(value) => {
                if (typeof value === 'number') {
                  return `$${value.toFixed(1)}M`;
                }
                return value;
              }}
            />
            <Area type="monotone" dataKey="gmv" stroke="#3b82f6" fillOpacity={1} fill="url(#colorGmv)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Repayment Rate Trend">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 90%)" />
            <XAxis dataKey="month" stroke="hsl(215, 15%, 47%)" />
            <YAxis stroke="hsl(215, 15%, 47%)" domain={[0, 100]} label={{ value: "Rate (%)", angle: -90, position: "insideLeft" }} />
            <Tooltip
              contentStyle={{
                background: "#fff",
                border: "1px solid hsl(220, 13%, 87%)",
                borderRadius: 4,
              }}
              formatter={(value) => {
                if (typeof value === 'number') {
                  return `${value.toFixed(1)}%`;
                }
                return value;
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="repaymentRate"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ fill: "#10b981", r: 4 }}
              activeDot={{ r: 6 }}
              name="Repayment Rate"
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}
