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
      className={`z-100 shrink-0 transition-all duration-500 ease-in-out ${isScrolled
        ? "bg-transparent border-transparent pt-4 px-6"
        : "border-b border-white/10 bg-foreground text-background"
        }`}
    >
      <div
        className={`grid h-14 items-center transition-all duration-500 ${isScrolled ? "grid-cols-[auto_1fr_auto] gap-4" : "grid-cols-3 px-12"
          }`}
      >
        {/* Left: Logo */}
        <div
          className={`flex items-center gap-3 transition-all duration-500 pointer-events-auto ${isScrolled
            ? "bg-foreground/90 text-background backdrop-blur-md px-6 h-11 rounded-full shadow-huawei-md"
            : ""
            }`}
        >
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
              <span className="font-medium text-sm truncate max-w-[200px]">
                {subtitle}
              </span>
            </>
          )}
        </div>

        {/* Center: Nav links */}
        <div className="flex items-center justify-center">
          <div
            className={`flex items-center gap-8 transition-all duration-500 pointer-events-auto ${isScrolled
              ? "bg-foreground/80 text-background backdrop-blur-md px-8 h-11 rounded-full shadow-huawei-md"
              : ""
              }`}
          >
            {navLinks}
          </div>
        </div>

        {/* Right: Actions & User */}
        <div
          className={`flex items-center gap-4 transition-all duration-500 pointer-events-auto ${isScrolled
            ? "bg-foreground/90 text-background backdrop-blur-md px-6 h-11 rounded-full shadow-huawei-md"
            : "justify-end"
            }`}
        >
          {actionButton}
          {user && (
            <div
              className={`pl-4 border-l border-white/10 ${isScrolled ? "text-background" : "text-secondary"
                }`}
            >
              <UserNav user={user} />
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
