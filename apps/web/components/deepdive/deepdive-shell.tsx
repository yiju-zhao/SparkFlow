"use client";

import Link from "next/link";
import { UserNav } from "@/components/user-nav";
import { Compass } from "lucide-react";

export interface DeepdiveShellProps {
  children: React.ReactNode;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  breadcrumb?: {
    label: string;
    href?: string;
  };
}

export function DeepdiveShell({ children, user, breadcrumb }: DeepdiveShellProps) {
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-background">
        <div className="mx-auto grid h-16 max-w-6xl grid-cols-3 items-center px-6">
          {/* Left: Logo or Breadcrumb */}
          <div className="flex items-center gap-2.5">
            {breadcrumb ? (
              <div className="flex items-center gap-2 text-sm">
                <Link
                  href="/"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  SparkFlow
                </Link>
                <span className="text-muted-foreground">/</span>
                <Link
                  href="/deepdive"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  deepdive
                </Link>
                <span className="text-muted-foreground">/</span>
                {breadcrumb.href ? (
                  <Link
                    href={breadcrumb.href}
                    className="text-foreground font-medium hover:underline"
                  >
                    {breadcrumb.label}
                  </Link>
                ) : (
                  <span className="text-foreground font-medium truncate max-w-48">
                    {breadcrumb.label}
                  </span>
                )}
              </div>
            ) : (
              <Link href="/" className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-red">
                  <span className="text-sm font-bold text-white">S</span>
                </div>
                <span className="text-lg font-semibold">SparkFlow</span>
              </Link>
            )}
          </div>

          {/* Center: empty */}
          <div />

          {/* Right: Explore link + User */}
          <div className="flex items-center justify-end gap-3">
            <Link
              href="/explore"
              className="group flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-widest transition-all hover:bg-muted"
            >
              <Compass className="h-4 w-4 text-[#00D084] transition-transform group-hover:scale-110" />
              <span>research-hub</span>
            </Link>
            {user && <UserNav user={user} />}
          </div>
        </div>
      </header>

      {/* Content */}
      {children}
    </div>
  );
}
