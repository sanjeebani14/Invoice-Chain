import Link from "next/link";

const NAV_GROUPS: Array<{
  title: string;
  items: Array<{ label: string; href: string }>;
}> = [
  {
    title: "Dashboard",
    items: [{ label: "Overview", href: "/admin/dashboard" }],
  },
  {
    title: "Operations",
    items: [
      { label: "Pending Invoices", href: "/admin/pending-invoices" },
      { label: "KYC Verifications", href: "/admin/kyc" },
      { label: "Settlement Tracker", href: "/admin/settlement-tracker" },
      { label: "Auctions", href: "/admin/auctions" },
      { label: "Marketplace Listings", href: "/admin/listings" },
    ],
  },
  {
    title: "Risk & Fraud",
    items: [
      { label: "Risk Metrics", href: "/admin/risk-metrics" },
      { label: "Fraud Review Queue", href: "/admin/fraud-queue" },
    ],
  },
  {
    title: "Users",
    items: [
      { label: "Sellers List", href: "/admin/sellers" },
      { label: "Investors List", href: "/admin/investors" },
      { label: "Admin Management", href: "/admin/users" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Portfolio Health", href: "/admin/analytics?tab=portfolio" },
      { label: "Platform Stats", href: "/admin/analytics?tab=platform" },
    ],
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-white text-black">
      <aside className="w-64 border-r border-gray-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-semibold text-gray-500">Admin</h2>
        <nav className="space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block rounded px-3 py-2 text-sm hover:bg-gray-100"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-6 bg-white">{children}</main>
    </div>
  );
}
