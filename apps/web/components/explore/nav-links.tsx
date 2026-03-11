"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

export default function ExploreNavLinks() {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("explore");

  const navLinks = [
    { href: `/${locale}/explore`, label: t("overview") },
    { href: `/${locale}/explore/conferences`, label: t("conferences.title") },
    { href: `/${locale}/explore/publications`, label: t("publications.title") },
    { href: `/${locale}/explore/sessions`, label: t("sessions.title") },
    { href: `/${locale}/explore/toolbox`, label: t("toolbox.title") },
  ] as const;

  return (
    <>
      {navLinks.map(({ href, label }) => {
        const isActive = href === `/${locale}/explore`
        ? pathname === `/${locale}/explore`
        : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`relative flex items-center justify-center text-sm transition-all ${isActive ? "font-medium opacity-100" : "opacity-60 hover:opacity-100"
              }`}
          >
            {isActive && (
              <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#00D084]" />
            )}
            {label}
          </Link>
        );
      })}
    </>
  );
}
