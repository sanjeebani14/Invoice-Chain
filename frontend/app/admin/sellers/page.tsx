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

export default function SellerExplorer() {
  const [sellers, setSellers] = useState<SellerScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const router = useRouter();
  const pageSize = 10;

  useEffect(() => {
    getAllSellers().then((data) => {
      setSellers(data);
      setLoading(false);
    });
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

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Seller Explorer</h1>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by Seller ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-9 bg-card border-border"
          />
        </div>
        <Select
          value={riskFilter}
          onValueChange={(v) => {
            setRiskFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-40 bg-card border-border">
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
          className="border-border"
        >
          Score {sortDir === "desc" ? "↓" : "↑"}
        </Button>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-card hover:bg-card">
                  <TableHead>Seller ID</TableHead>
                  <TableHead>Composite Score</TableHead>
                  <TableHead>Risk Level</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Credit Score
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    Debt/Income
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Employment Yrs
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Last Updated
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((s,index) => (
                  <TableRow
                    key={`seller-${s.seller_id}-${index}`}
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => router.push(`/admin/sellers/${s.seller_id}`)}
                  >
                    <TableCell className="font-mono">#{s.seller_id}</TableCell>
                    <TableCell className="font-semibold">
                      {s.composite_score}
                    </TableCell>
                    <TableCell>
                      <RiskBadge level={s.risk_level} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {s.credit_score}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {s.debt_to_income}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {s.employment_years}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                      {s.last_updated
                        ? new Date(s.last_updated).toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {filtered.length} sellers
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                className="border-border"
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground flex items-center px-2">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
                className="border-border"
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
