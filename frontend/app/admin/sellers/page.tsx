"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/dashboard/RiskBadge";
import { TableSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { getAllSellers, type SellerScore } from "@/lib/api";

function formatDebtToIncome(value?: number) {
  if (value === undefined || value === null) {
    return "N/A";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatEmploymentYears(value?: number) {
  if (value === undefined || value === null) {
    return "N/A";
  }

  return `${value.toFixed(1)} yrs`;
}

export default function SellerExplorer() {
  const [sellers, setSellers] = useState<SellerScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const router = useRouter();
  const pageSize = 10;

  useEffect(() => {
    getAllSellers()
      .then((data) => {
        setSellers(data);
        setLoadError(null);
      })
      .catch(() => {
        setSellers([]);
        setLoadError("Unable to load sellers right now.");
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = sellers
    .filter((s) => riskFilter === "all" || s.risk_level === riskFilter)
    .filter((s) => !search || s.seller_id.toString().includes(search))
    .sort((a, b) =>
      sortDir === "desc"
        ? b.composite_score - a.composite_score
        : a.composite_score - b.composite_score,
    );

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const currentPage = filtered.length === 0 ? 0 : page + 1;

  return (
    <div className="space-y-6 bg-slate-50 text-slate-900">
      <div className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Admin Overview
            </p>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-slate-900">
                Seller Explorer
              </h1>
              <p className="max-w-2xl text-sm text-slate-600">
                Review seller risk posture, scan for outliers, and jump into
                detailed profiles.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                Total Sellers
              </p>
              <p className="mt-2 text-2xl font-semibold text-emerald-950">
                {filtered.length}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                High Risk
              </p>
              <p className="mt-2 text-2xl font-semibold text-amber-950">
                {sellers.filter((s) => s.risk_level === "HIGH").length}
              </p>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 col-span-2 sm:col-span-1">
              <p className="text-xs font-medium uppercase tracking-wide text-sky-700">
                Sort Order
              </p>
              <p className="mt-2 text-lg font-semibold text-sky-950">
                Score {sortDir === "desc" ? "High to Low" : "Low to High"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Seller ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-9 text-slate-900 placeholder:text-slate-400 focus-visible:border-slate-300 focus-visible:ring-slate-200"
            />
          </div>
          <Select
            value={riskFilter}
            onValueChange={(v) => {
              setRiskFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="h-11 w-full rounded-2xl border-slate-200 bg-slate-50 text-slate-900 sm:w-44">
              <SelectValue placeholder="Risk Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
            className="h-11 rounded-2xl border-slate-200 bg-white px-5 text-slate-700 hover:bg-slate-100"
          >
            Score {sortDir === "desc" ? "↓" : "↑"}
          </Button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : loadError ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700 shadow-sm">
          {loadError}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 bg-slate-50 hover:bg-slate-50">
                  <TableHead className="text-slate-600">Seller ID</TableHead>
                  <TableHead className="text-slate-600">
                    Composite Score
                  </TableHead>
                  <TableHead className="text-slate-600">Risk Level</TableHead>
                  <TableHead className="hidden text-slate-600 md:table-cell">
                    Credit Score
                  </TableHead>
                  <TableHead className="hidden text-slate-600 md:table-cell">
                    Debt/Income
                  </TableHead>
                  <TableHead className="hidden text-slate-600 lg:table-cell">
                    Employment Yrs
                  </TableHead>
                  <TableHead className="hidden text-slate-600 lg:table-cell">
                    Last Updated
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((s, index) => (
                  <TableRow
                    key={`seller-${s.seller_id}-${index}`}
                    className="cursor-pointer border-slate-100 bg-white hover:bg-slate-50"
                    onClick={() => router.push(`/admin/sellers/${s.seller_id}`)}
                  >
                    <TableCell className="font-mono text-slate-700">
                      #{s.seller_id}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-900">
                      {s.composite_score}
                    </TableCell>
                    <TableCell>
                      <RiskBadge level={s.risk_level} />
                    </TableCell>
                    <TableCell className="hidden text-slate-700 md:table-cell">
                      {s.credit_score ?? "N/A"}
                    </TableCell>
                    <TableCell className="hidden text-slate-700 md:table-cell">
                      {formatDebtToIncome(s.debt_to_income)}
                    </TableCell>
                    <TableCell className="hidden text-slate-700 lg:table-cell">
                      {formatEmploymentYears(s.employment_years)}
                    </TableCell>
                    <TableCell className="hidden text-sm text-slate-500 lg:table-cell">
                      {s.last_updated
                        ? new Date(s.last_updated).toLocaleDateString()
                        : "Not updated"}
                    </TableCell>
                  </TableRow>
                ))}
                {!paged.length && (
                  <TableRow className="border-slate-100 bg-white hover:bg-white">
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-sm text-slate-500"
                    >
                      No sellers match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-slate-600">
              {filtered.length} sellers
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                className="rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:bg-slate-50"
              >
                Previous
              </Button>
              <span className="flex items-center px-2 text-sm text-slate-500">
                {currentPage} / {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
                className="rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:bg-slate-50"
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
