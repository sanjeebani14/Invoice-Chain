"use client";
import { ReactNode } from "react";
import { Info } from "lucide-react";

interface ChartPanelProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function ChartPanel({
  title,
  children,
  className = "",
}: ChartPanelProps) {
  return (
    <div className={`chart-panel ${className}`}>
      <div className="chart-panel-header">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{title}</span>
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
