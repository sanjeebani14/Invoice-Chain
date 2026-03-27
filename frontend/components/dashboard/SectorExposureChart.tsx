"use client";

import { ChartPanel } from "./ChartPanel";
import { RiskHeatmapData } from "@/lib/api";

interface SectorExposureChartProps {
  data: RiskHeatmapData;
  isLoading?: boolean;
}

export function SectorExposureChart({
  data,
  isLoading = false,
}: SectorExposureChartProps) {
  if (isLoading) {
    return <div className="h-80 bg-gray-200 rounded-lg animate-pulse" />;
  }

  const concentrationRatio =
    typeof data.concentration_ratio === "number"
      ? data.concentration_ratio
      : Number(data.concentration_ratio);

  return (
    <ChartPanel title="Sector Exposure Analysis">
      <div>
        <h4 className="text-sm font-semibold mb-4 text-foreground">
          Concentration Metrics
        </h4>
        <div className="space-y-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm text-slate-700">Top Sector</div>
            <div className="text-lg font-bold text-blue-600">
              {data.top_sector || "N/A"}
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-sm text-slate-700">
              Concentration Ratio (Top 3)
            </div>
            <div className="text-lg font-bold text-purple-600">
              {Number.isFinite(concentrationRatio)
                ? concentrationRatio.toFixed(1)
                : "0.0"}
              %
            </div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-sm text-slate-700">Risk Distribution</div>
            <div className="text-sm space-y-1 mt-2">
              <div className="flex justify-between">
                <span className="text-slate-700">High Risk:</span>
                <span className="font-semibold text-red-600">
                  {data.risk_levels.high}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-700">Medium Risk:</span>
                <span className="font-semibold text-yellow-600">
                  {data.risk_levels.medium}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-700">Low Risk:</span>
                <span className="font-semibold text-green-600">
                  {data.risk_levels.low}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ChartPanel>
  );
}
