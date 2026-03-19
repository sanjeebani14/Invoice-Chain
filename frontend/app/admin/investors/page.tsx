"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdminUsers, type AdminManagedUser } from "@/lib/api";

export default function InvestorsListPage() {
  const [rows, setRows] = useState<AdminManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getAdminUsers({ role: "investor" });
        setRows(data);
      } catch {
        setError("Failed to load investors list.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const activeCount = useMemo(
    () => rows.filter((row) => row.is_active).length,
    [rows],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Investors List</h1>
        <p className="text-sm text-gray-600">
          Live investor accounts from the users table.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">
            {rows.length}
          </p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Active
          </p>
          <p className="mt-1 text-xl font-semibold text-green-700">
            {activeCount}
          </p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Verified
          </p>
          <p className="mt-1 text-xl font-semibold text-blue-700">
            {rows.filter((row) => row.email_verified).length}
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">Investor</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Verified</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-center text-gray-500" colSpan={5}>
                  Loading investors...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-gray-500" colSpan={5}>
                  No investors found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.full_name || `Investor #${row.id}`}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        row.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {row.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        row.email_verified
                          ? "bg-blue-100 text-blue-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {row.email_verified ? "Verified" : "Pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
