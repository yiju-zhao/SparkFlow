"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { UserNav } from "@/components/user-nav";
import { Compass, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const locales = {
  en: { name: "English", flag: "🇺🇸" },
  zh: { name: "中文", flag: "🇨🇳" },
} as const;

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
  const locale = useLocale();
  const t = useTranslations("deepdive");
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (newLocale: string) => {
    const segments = pathname.split("/");
    segments[1] = newLocale;
    router.push(segments.join("/"));
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="shrink-0 border-b-2 border-border bg-background">
        <div className="flex h-16 w-full items-center justify-between px-6">
          {/* Left: Logo or Breadcrumb */}
          <div className="flex items-center gap-2.5">
            {breadcrumb ? (
              <div className="flex items-center gap-2 text-base">
                <Link
                  href={`/${locale}`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  SparkFlow
                </Link>
                <span className="text-muted-foreground">/</span>
                <Link
                  href={`/${locale}/deepdive`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  deepdive
                </Link>
                <span className="text-muted-foreground">/</span>
                {breadcrumb.href ? (
                  <Link
                    href={`/${locale}${breadcrumb.href}`}
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
              <Link href={`/${locale}`} className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-red">
                  <span className="text-base font-bold text-white">S</span>
                </div>
                <span className="text-lg font-semibold">SparkFlow</span>
              </Link>
            )}
          </div>

          {/* Right: Language Switcher + Explore link + User */}
          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Globe className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {Object.entries(locales).map(([code, { name, flag }]) => (
                  <DropdownMenuItem
                    key={code}
                    onClick={() => switchLocale(code)}
                    className={cn(locale === code && "bg-accent")}
                  >
                    <span className="mr-2">{flag}</span>
                    {name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Link
              href={`/${locale}/explore`}
              className="group flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-mono font-bold uppercase tracking-widest transition-all hover:bg-muted"
            >
              <Compass className="h-4 w-4 text-[#00D084] transition-transform group-hover:scale-110" />
              <span>{t("researchHub")}</span>
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
