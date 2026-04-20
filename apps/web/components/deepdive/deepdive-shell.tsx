"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { UserNav } from "@/components/user-nav";
import { BookOpen, ChevronRight, Globe } from "lucide-react";
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
    role?: string | null;
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
      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex h-14 w-full items-center justify-between px-6">
          {/* Left: Wordmark + DEEPDIVE tag + optional breadcrumb */}
          <div className="flex items-center gap-3">
            <Link href={`/${locale}`} className="flex items-center gap-2">
              <span className="text-[15px] font-semibold tracking-tight text-foreground">
                SPARKFLOW
              </span>
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-foreground">
                DEEPDIVE
              </span>
            </Link>
            {breadcrumb && (
              <div className="flex items-center gap-2 pl-3 text-[13px] text-muted-foreground">
                <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
                <Link
                  href={`/${locale}/deepdive`}
                  className="transition-colors hover:text-foreground"
                >
                  deepdive
                </Link>
                <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
                {breadcrumb.href ? (
                  <Link
                    href={`/${locale}${breadcrumb.href}`}
                    className="truncate max-w-60 font-medium text-foreground hover:underline"
                  >
                    {breadcrumb.label}
                  </Link>
                ) : (
                  <span className="truncate max-w-60 font-medium text-foreground">
                    {breadcrumb.label}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right: Language Switcher + Research Hub + User */}
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
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
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-accent-red-hover"
            >
              <BookOpen className="h-3.5 w-3.5" />
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
