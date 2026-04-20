"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLinkDef = { href: string; label: string; exact?: boolean };
const navLinks: NavLinkDef[] = [
  { href: "/explore", label: "Overview", exact: true },
  { href: "/explore/conferences", label: "Conferences" },
  { href: "/explore/social-media", label: "Social Insights" },
  { href: "/explore/toolbox", label: "Toolbox" },
];

export default function ExploreNavLinks() {
  const pathname = usePathname();

  return (
    <>
      {navLinks.map(({ href, label, exact }) => {
        const localeAwarePath = pathname.replace(/^\/(en|zh)(?=\/|$)/, "") || "/";
        const isActive = exact ? localeAwarePath === href : localeAwarePath.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`text-[13.5px] leading-none transition-colors border-b-2 pb-1 pt-1 ${
              isActive
                ? "text-sf-accent border-sf-accent font-semibold"
                : "text-sf-ink-3 border-transparent font-medium hover:text-sf-ink-2"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
