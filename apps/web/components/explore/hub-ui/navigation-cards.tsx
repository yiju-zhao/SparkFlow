"use client";

import Link from "next/link";
import { useLocale } from "next-intl";

export interface NavigationData {
  pages: Array<{
    title: string;
    path: string;
    description?: string;
  }>;
}

export function NavigationCards({ data }: { data: NavigationData }) {
  const locale = useLocale();

  if (!data.pages || data.pages.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {data.pages.map((page, i) => {
        const href = `/${locale}${page.path.startsWith("/") ? "" : "/"}${page.path}`;
        return (
          <Link
            key={i}
            href={href}
            className="block rounded-xl border border-border p-3 bg-background hover:bg-muted/50 hover:border-[#00D084]/50 transition-colors"
          >
            <div className="text-sm font-medium text-foreground">{page.title}</div>
            {page.description && (
              <div className="text-xs text-muted-foreground mt-0.5">{page.description}</div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
