import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-white text-black">
      <aside className="w-64 border-r border-gray-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-semibold text-gray-500">Admin</h2>
        <nav className="space-y-1">
          <Link
            href="/admin/dashboard"
            className="block rounded px-3 py-2 hover:bg-gray-100"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/analytics"
            className="block rounded px-3 py-2 hover:bg-gray-100"
          >
            Analytics
          </Link>
          <Link
            href="/admin/sellers"
            className="block rounded px-3 py-2 hover:bg-gray-100"
          >
            Sellers
          </Link>
          <Link
            href="/admin/fraud-queue"
            className="block rounded px-3 py-2 hover:bg-gray-100"
          >
            Fraud Queue
          </Link>
        </nav>
      </aside>

      <main className="flex-1 p-6 bg-white">{children}</main>
    </div>
  );
}
