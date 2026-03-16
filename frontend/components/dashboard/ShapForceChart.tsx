"use client";

import { FC, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";

type ShapForceChartProps = {
  contributors?: Record<string, number> | null;
};

type ShapPoint = {
  feature: string;
  impact: number;
  direction: "push_up" | "push_down";
};

// Light-mode friendly colors aligned with dashboard charts
const GRID = "hsl(210, 16%, 90%)";
const TICK = { fill: "hsl(215, 15%, 35%)", fontSize: 11 };
const TT = {
  background: "#fff",
  border: "1px solid hsl(220, 13%, 87%)",
  borderRadius: 4,
  color: "hsl(220, 20%, 14%)",
};

export const ShapForceChart: FC<ShapForceChartProps> = ({ contributors }) => {
  const data: ShapPoint[] = useMemo(() => {
    if (!contributors) return [];
    const entries = Object.entries(contributors);
    // Sort by absolute impact and take top 7 for readability
    const sorted = entries
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 7);

    return sorted.map(([feature, impact]) => ({
      feature,
      impact,
      direction: impact >= 0 ? "push_up" : "push_down",
    }));
  }, [contributors]);

  if (!data.length) {
    return (
      <div className="text-xs text-muted-foreground">
        No feature attributions available yet for this seller.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 24, left: 24, bottom: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis
          type="number"
          tick={TICK}
          axisLine={{ stroke: GRID }}
          tickFormatter={(v) => `${v}`}
        />
        <YAxis
          type="category"
          dataKey="feature"
          tick={TICK}
          axisLine={{ stroke: GRID }}
          width={140}
        />
        <Tooltip
          contentStyle={TT}
          formatter={(value, _name, item) => {
            const v = value as number;
            const dir =
              (item.payload as ShapPoint).direction === "push_up"
                ? "increases"
                : "reduces";
            return [`${v.toFixed(2)} pts (${dir} risk)`, "Impact"];
          }}
          labelFormatter={(label) => `Feature: ${label}`}
        />
        <Bar dataKey="impact" fill="hsl(222, 84%, 56%)" radius={[2, 2, 2, 2]}>
          <LabelList
            dataKey="impact"
            position="right"
            formatter={(label) => {
              const numeric = typeof label === "number" ? label : Number(label ?? 0);
              return Number.isFinite(numeric) ? numeric.toFixed(1) : "0.0";
            }}
            className="text-[10px] fill-foreground"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

