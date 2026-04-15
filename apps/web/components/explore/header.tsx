"use client";

import Link from "next/link";
import { UserNav } from "@/components/user-nav";

export interface ExploreHeaderProps {
  title: string;
  subtitle?: string;
  navLinks?: React.ReactNode;
  actionButton?: React.ReactNode;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string | null;
  };
  isScrolled?: boolean;
}

export function ExploreHeader({
  title,
  subtitle,
  navLinks,
  actionButton,
  user,
  isScrolled,
}: ExploreHeaderProps) {
  const accentColor = "text-[#00D084]";

  return (
    <nav
      className={`z-100 shrink-0 transition-all duration-500 ease-in-out border-b border-border ${
        isScrolled ? "bg-background/80 backdrop-blur-lg" : "bg-background"
      }`}
    >
      <div className={`grid h-14 items-center transition-all duration-500 px-12 grid-cols-3`}>
        {/* Left: Logo */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="font-medium text-sm opacity-60 hover:opacity-100 transition-opacity"
          >
            sparkflow
          </Link>
          <Link
            href="/explore"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <span className={`${accentColor} font-bold text-base`}>&gt;</span>
            <span className="font-medium text-sm">{title}</span>
          </Link>
          {subtitle && (
            <>
              <span className={`${accentColor} font-bold text-base`}>&gt;</span>
              <span className="font-medium text-sm truncate max-w-50">{subtitle}</span>
            </>
          )}
        </div>

        {/* Center: Nav links */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-8">{navLinks}</div>
        </div>

        {/* Right: Actions & User */}
        <div className="flex items-center justify-end gap-4">
          {actionButton}
          {user && (
            <div className="pl-4 border-l border-border">
              <UserNav user={user} />
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
