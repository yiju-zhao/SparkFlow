"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { UserNav } from "@/components/user-nav";
import { ArrowUpRight, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SparkflowLockup } from "@/components/ui/sparkflow-lockup";
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
    <div className="flex h-screen flex-col">
      <header className="shrink-0 border-b border-sf-line bg-sf-surface">
        <div className="flex h-16 w-full items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href={`/${locale}/deepdive`} className="flex items-center">
              <SparkflowLockup tag="DEEPDIVE" size="md" />
            </Link>
            {breadcrumb && (
              <>
                <span className="text-sf-line-strong">›</span>
                {breadcrumb.href ? (
                  <Link
                    href={`/${locale}${breadcrumb.href}`}
                    className="text-sf-ink-2 text-[15px] hover:text-sf-accent transition-colors"
                  >
                    {breadcrumb.label}
                  </Link>
                ) : (
                  <span className="text-sf-ink text-[17px] font-bold tracking-tight truncate max-w-72">
                    {breadcrumb.label}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Language">
                  <Globe className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {Object.entries(locales).map(([code, { name, flag }]) => (
                  <DropdownMenuItem
                    key={code}
                    onClick={() => switchLocale(code)}
                    className={cn(locale === code && "bg-sf-accent-soft text-sf-accent-ink")}
                  >
                    <span className="mr-2">{flag}</span>
                    {name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Link
              href={`/${locale}/explore`}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[12.5px] font-bold tracking-[0.14em] uppercase text-sf-ink-2 hover:text-sf-accent hover:bg-sf-bg-alt transition-colors"
            >
              {t("researchHub")}
              <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
            </Link>

            {user && (
              <div className="pl-3 border-l border-sf-line ml-1">
                <UserNav user={user} />
              </div>
            )}
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
