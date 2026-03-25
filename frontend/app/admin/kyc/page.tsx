"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  adminApproveKyc,
  adminListKyc,
  adminRejectKyc,
  KycStatus,
  KycSubmissionOut,
} from "@/lib/api";

type FilterValue = "all" | KycStatus;

function StatusBadge({ status }: { status: KycStatus }) {
  if (status === "approved") return <Badge>VERIFIED</Badge>;
  if (status === "rejected")
    return <Badge variant="destructive">REJECTED</Badge>;
  return <Badge variant="secondary">PENDING</Badge>;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

export default function AdminKycPage() {
  const [rows, setRows] = useState<KycSubmissionOut[]>([]);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalApproved = useMemo(
    () => rows.filter((row) => row.status === "approved").length,
    [rows],
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminListKyc({
        status_filter: filter === "all" ? undefined : filter,
        limit: 100,
      });
      setRows(data.submissions);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(detail || "Failed to load KYC submissions.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (submissionId: number) => {
    try {
      setWorkingId(submissionId);
      const updated = await adminApproveKyc(submissionId);
      setRows((prev) =>
        prev.map((row) => (row.id === submissionId ? updated : row)),
      );
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(detail || "Failed to approve KYC.");
    } finally {
      setWorkingId(null);
    }
  };

  const reject = async (submissionId: number) => {
    const reason = window.prompt("Reason for rejection:", "Document mismatch");
    if (!reason || !reason.trim()) return;

    try {
      setWorkingId(submissionId);
      const updated = await adminRejectKyc(submissionId, reason.trim());
      setRows((prev) =>
        prev.map((row) => (row.id === submissionId ? updated : row)),
      );
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(detail || "Failed to reject KYC.");
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">KYC Verification</h1>
          <p className="text-sm text-muted-foreground">
            Verify PAN uploads from non-admin users.
          </p>
        </div>

        <div className="w-56">
          <Select
            value={filter}
            onValueChange={(value) => setFilter(value as FilterValue)}
          >
            <SelectTrigger className="border-border bg-card text-foreground">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent className="border-border bg-card text-foreground">
              <SelectItem value="all" className="text-foreground focus:bg-accent">
                All
              </SelectItem>
              <SelectItem value="pending" className="text-foreground focus:bg-accent">
                Pending
              </SelectItem>
              <SelectItem value="approved" className="text-foreground focus:bg-accent">
                Approved
              </SelectItem>
              <SelectItem value="rejected" className="text-foreground focus:bg-accent">
                Rejected
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-border bg-card p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Showing
          </p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {rows.length}
          </p>
        </div>
        <div className="rounded border border-border bg-card p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Verified
          </p>
          <p className="mt-1 text-xl font-semibold text-green-700">
            {totalApproved}
          </p>
        </div>
        <div className="rounded border border-border bg-card p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Needs review
          </p>
          <p className="mt-1 text-xl font-semibold text-amber-700">
            {rows.filter((row) => row.status === "pending").length}
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-muted-foreground">Submission</TableHead>
              <TableHead className="text-muted-foreground">User</TableHead>
              <TableHead className="text-muted-foreground">Document</TableHead>
              <TableHead className="text-muted-foreground">Submitted</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Reviewed</TableHead>
              <TableHead className="text-right text-muted-foreground">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No KYC submissions found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const busy = workingId === row.id;
                return (
                  <TableRow key={row.id}>
                    <TableCell>#{row.id}</TableCell>
                    <TableCell>#{row.user_id}</TableCell>
                    <TableCell>
                      {row.original_filename || row.doc_type}
                    </TableCell>
                    <TableCell>{formatDate(row.submitted_at)}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>{formatDate(row.reviewed_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => approve(row.id)}
                          disabled={busy || row.status === "approved"}
                          className="bg-green-700 text-white hover:bg-green-800"
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reject(row.id)}
                          disabled={busy || row.status === "rejected"}
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
