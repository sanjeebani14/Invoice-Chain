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
    <div className="page-shell flex">
      <aside className="w-64 border-r border-border bg-card p-4">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
          Admin
        </h2>
        <nav className="space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 bg-background p-6">{children}</main>
    </div>
  );
}
