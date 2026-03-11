import { cn } from "@/lib/utils";

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}

export function AuthCard({ title, subtitle, children, className }: AuthCardProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className={cn(
        "w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm",
        className
      )}>
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            InvoiceChain
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Blockchain-Based Invoice Factoring
          </p>
        </div>

        {/* Page title */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        {children}
      </div>
    </div>
  );
}