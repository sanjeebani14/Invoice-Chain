"use client";
import { Badge } from "@/components/ui/badge";

interface RiskBadgeProps {
  level: "LOW" | "MEDIUM" | "HIGH";
}

export function RiskBadge({ level }: RiskBadgeProps) {
  const cls =
    level === "LOW"
      ? "risk-badge-low"
      : level === "MEDIUM"
        ? "risk-badge-medium"
        : "risk-badge-high";

  return (
    <Badge variant="outline" className={cls}>
      {level}
    </Badge>
  );
}
