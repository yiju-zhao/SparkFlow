"use client";

import Link from "next/link";
import { useLocale } from "next-intl";

export function LocaleLink({ href, ...props }: React.ComponentProps<typeof Link>) {
  const locale = useLocale();
  const localizedHref =
    typeof href === "string" && href.startsWith("/") ? `/${locale}${href}` : href;
  return <Link href={localizedHref} {...props} />;
}
