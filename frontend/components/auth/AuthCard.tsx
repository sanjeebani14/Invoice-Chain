import Link from "next/link";
import { ReactNode } from "react";

interface AuthCardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  registerHref?: string;
}

export function AuthCard({
  title = "Seamless Login for Exclusive Access",
  subtitle = "Immerse yourself in a hassle-free login journey with our intuitively designed form. Effortlessly access your account.",
  children,
  registerHref = "/register",
}: AuthCardProps) {
  return (
    <div className="bg-background min-h-screen flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-card-foreground leading-tight">{title}</h1>
          <p className="mt-4 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div className="p-6 sm:p-8 rounded-2xl bg-card border border-border shadow-sm text-card-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}