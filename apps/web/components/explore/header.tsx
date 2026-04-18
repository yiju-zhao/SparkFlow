"use client";

import Link from "next/link";
import { UserNav } from "@/components/user-nav";
import { SparkflowLockup } from "@/components/ui/sparkflow-lockup";

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
  navLinks,
  actionButton,
  user,
  isScrolled,
}: ExploreHeaderProps) {
  return (
    <nav
      aria-label="Primary"
      className={`pointer-events-auto shrink-0 border-b border-sf-line transition-all duration-300 ${
        isScrolled
          ? "bg-sf-surface/85 backdrop-blur-lg"
          : "bg-sf-surface"
      }`}
    >
      <div className="flex h-16 items-center px-8 gap-10">
        <Link href="/explore" className="flex items-center">
          <SparkflowLockup tag="HUB" size="sm" />
        </Link>

        <div className="flex items-center gap-6 flex-1">{navLinks}</div>

        <div className="flex items-center gap-3">
          {actionButton}
          {user && (
            <div className="pl-3 border-l border-sf-line">
              <UserNav user={user} />
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
