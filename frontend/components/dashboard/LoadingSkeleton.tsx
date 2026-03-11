"use client";
import { Skeleton } from "@/components/ui/skeleton";

export function MetricCardSkeleton() {
  return (
    <div className="metric-card">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-4 rounded" />
      </div>
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-24 mt-2" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="chart-panel">
      <div className="chart-panel-header">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="p-4">
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
