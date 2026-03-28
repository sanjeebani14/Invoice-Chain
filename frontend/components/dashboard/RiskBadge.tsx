"use client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RiskBadgeProps {
  level: "LOW" | "MEDIUM" | "HIGH";
  className?: string;
}

export function RiskBadge({ level, className }: RiskBadgeProps) {
  // Apply Tailwind colors directly so the badge is styled consistently.
  // (We don't rely on external CSS classes like `risk-badge-high`.)
  const cls =
    level === "LOW"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : level === "MEDIUM"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : "border-red-600 bg-red-50 text-red-800";

  return (
    <Badge variant="outline" className={cn(cls, className)}>
      {level}
    </Badge>
  );
}
