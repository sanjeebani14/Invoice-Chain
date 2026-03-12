"use client";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  color?: "default" | "green" | "yellow" | "red";
}

const colorMap = {
  default: "text-primary",
  green: "text-risk-low",
  yellow: "text-risk-medium",
  red: "text-risk-high",
};

export function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  color = "default",
}: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        <Icon className={`h-4 w-4 ${colorMap[color]}`} />
      </div>
      <div className={`text-2xl font-bold ${colorMap[color]}`}>{value}</div>
      {trend && <p className="text-xs text-muted-foreground mt-1">{trend}</p>}
    </div>
  );
}
