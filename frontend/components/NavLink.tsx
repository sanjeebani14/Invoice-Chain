"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import { forwardRef, type AnchorHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type NavLinkCompatProps = Omit<LinkProps, "href"> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className"> & {
    to: string;
    className?: string;
    activeClassName?: string;
    pendingClassName?: string;
    end?: boolean;
  };

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  (
    {
      className,
      activeClassName,
      pendingClassName: _pendingClassName,
      to,
      end = false,
      ...props
    },
    ref,
  ) => {
    const pathname = usePathname();

    const isActive =
      to === "/"
        ? pathname === "/"
        : end
          ? pathname === to
          : pathname === to || pathname.startsWith(`${to}/`);

    return (
      <Link
        ref={ref}
        href={to}
        className={cn(className, isActive && activeClassName)}
        {...props}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
