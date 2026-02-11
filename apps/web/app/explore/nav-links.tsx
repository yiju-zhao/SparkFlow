"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/explore/conferences", label: "conferences" },
  { href: "/explore/publications", label: "publications" },
  { href: "/explore/sessions", label: "sessions" },
] as const;

export default function ExploreNavLinks() {
  const pathname = usePathname();

  return (
    <>
      {navLinks.map(({ href, label }) => {
        const isActive = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`relative flex items-center justify-center text-sm transition-colors ${
              isActive ? "text-white" : "text-[#999] hover:text-white"
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
