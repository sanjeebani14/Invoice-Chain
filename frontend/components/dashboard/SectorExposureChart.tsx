"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { ChartPanel } from "./ChartPanel";
import { RiskHeatmapData } from "@/lib/api";

interface SectorExposureChartProps {
  data: RiskHeatmapData;
  isLoading?: boolean;
}

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

export function SectorExposureChart({
  data,
  isLoading = false,
}: SectorExposureChartProps) {
  if (isLoading) {
    return <div className="h-80 bg-gray-200 rounded-lg animate-pulse" />;
  }

  const sectorData = Object.entries(data.sector_exposure).map(([sector, percentage]) => ({
    name: sector,
    value: percentage,
  }));

  return (
    <ChartPanel title="Sector Exposure Analysis">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-semibold mb-4">Volume by Sector</h4>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={sectorData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value.toFixed(1)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {sectorData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => {
                if (typeof value === 'number') {
                  return `${value.toFixed(2)}%`;
                }
                return value;
              }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div>
          <h4 className="text-sm font-semibold mb-4">Concentration Metrics</h4>
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-gray-600">Top Sector</div>
              <div className="text-lg font-bold text-blue-600">{data.top_sector || "N/A"}</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-sm text-gray-600">Concentration Ratio (Top 3)</div>
              <div className="text-lg font-bold text-purple-600">{data.concentration_ratio.toFixed(1)}%</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-gray-600">Risk Distribution</div>
              <div className="text-sm space-y-1 mt-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">High Risk:</span>
                  <span className="font-semibold text-red-600">{data.risk_levels.high}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Medium Risk:</span>
                  <span className="font-semibold text-yellow-600">{data.risk_levels.medium}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Low Risk:</span>
                  <span className="font-semibold text-green-600">{data.risk_levels.low}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ChartPanel>
  );
}
