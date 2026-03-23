import Link from "next/link";
import { ReactNode } from "react";

interface AuthCardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footerText?: string;
  footerActionText?: string;
  footerHref?: string;
}

export function AuthCard({
  title = "Welcome Back",
  subtitle = "Access your InvoiceChain account to manage your dashboard.",
  children,
  footerText,
  footerActionText,
  footerHref,
}: AuthCardProps) {
  return (
    <div className="bg-background min-h-screen flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground leading-tight">
            {title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div className="p-6 sm:p-8 rounded-2xl bg-card border border-border shadow-lg text-card-foreground">
          {children}
          
          {footerHref && (
            <div className="mt-6 text-center text-sm text-muted-foreground border-t pt-6">
              {footerText}{" "}
              <Link 
                href={footerHref} 
                className="font-medium text-primary hover:underline"
              >
                {footerActionText}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}