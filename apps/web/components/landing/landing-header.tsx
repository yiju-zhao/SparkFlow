"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserNav } from "@/components/user-nav";
import { SparkflowLockup } from "@/components/ui/sparkflow-lockup";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type NavLink, type NavLinkGroup, isNavGroup } from "@/components/explore/explore-shell";

const locales = {
  en: { name: "English", flag: "🇺🇸" },
  zh: { name: "中文", flag: "🇨🇳" },
} as const;

interface LandingHeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string | null;
  } | null;
  navLinks?: NavLink[];
  isScrolled?: boolean;
  onScrollContainer?: boolean;
  variant?: "landing" | "explore";
}

export function LandingHeader({
  user,
  navLinks: customNavLinks,
  isScrolled,
  onScrollContainer,
  variant = "landing",
}: LandingHeaderProps) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isLoggedIn = !!user;
  const deepdiveHref = isLoggedIn ? `/${locale}/deepdive` : `/${locale}/login`;

  const defaultNavLinks = [
    { label: t("howItWorks"), href: "#how-it-works" },
    { label: t("features"), href: "#features" },
    { label: t("faq"), href: "#faq" },
  ];
  const links = customNavLinks || defaultNavLinks;

  useEffect(() => {
    if (onScrollContainer) {
      queueMicrotask(() => setScrolled(!!isScrolled));
      return;
    }
    const container = document.getElementById("landing-scroll-container");
    if (!container) return;
    const handleScroll = () => setScrolled(container.scrollTop > 10);
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [isScrolled, onScrollContainer]);

  const switchLocale = (newLocale: string) => {
    const segments = pathname.split("/");
    segments[1] = newLocale;
    router.push(segments.join("/"));
  };

  const productTag = variant === "explore" ? "HUB" : null;

  const surfaceClasses = cn(
    "fixed left-0 right-0 top-0 z-50 border-b transition-colors duration-300",
    scrolled || variant === "explore"
      ? "border-sf-line bg-sf-surface/90 backdrop-blur-md"
      : "border-transparent bg-transparent",
  );

  return (
    <header className={surfaceClasses}>
      <div
        className={cn(
          "mx-auto flex h-16 items-center gap-8",
          variant === "explore" ? "max-w-none px-8" : "max-w-[1280px] px-6",
        )}
      >
        {/* Lockup */}
        <Link
          href={`/${locale}${variant === "explore" ? "/explore" : ""}`}
          className="flex items-center hover:opacity-85 transition-opacity"
        >
          <SparkflowLockup
            tag={productTag}
            size={variant === "explore" ? "md" : "md"}
            withGlyph={variant === "landing"}
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden flex-1 items-center gap-6 md:flex">
          {links.map((link) => {
            if (isNavGroup(link)) {
              const group = link as NavLinkGroup;
              const isGroupActive = pathname.startsWith(group.href);
              return (
                <DropdownMenu key={group.href}>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "inline-flex items-center gap-1 border-b-2 pb-1 pt-1 text-[13.5px] transition-colors",
                        isGroupActive
                          ? "border-sf-accent text-sf-accent font-semibold"
                          : "border-transparent text-sf-ink-3 font-medium hover:text-sf-ink-2",
                      )}
                    >
                      {group.label}
                      <svg width="10" height="10" viewBox="0 0 10 10" className="opacity-60">
                        <path
                          d="M2 4l3 3 3-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {group.children.map((child) => {
                      const isChildActive = pathname === child.href;
                      return (
                        <DropdownMenuItem key={child.href} asChild>
                          <Link
                            href={child.href}
                            className={cn(isChildActive && "font-semibold text-sf-accent")}
                          >
                            {child.label}
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "border-b-2 pb-1 pt-1 text-[13.5px] transition-colors",
                  isActive
                    ? "border-sf-accent text-sf-accent font-semibold"
                    : "border-transparent text-sf-ink-3 font-medium hover:text-sf-ink-2",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-2 md:flex">
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

          {isLoggedIn ? (
            <>
              <Button size="sm" asChild>
                <Link href={deepdiveHref} className="font-black uppercase tracking-[0.1em]">
                  DeepDive
                </Link>
              </Button>
              <UserNav user={user} />
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/${locale}/login`}>Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href={`/${locale}/signup`}>{t("signUp")}</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile menu trigger */}
        <div className="ml-auto flex items-center gap-2 md:hidden">
          {isLoggedIn ? <UserNav user={user} /> : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-sf-line bg-sf-surface md:hidden">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-1 px-6 py-4">
            {links.map((link) => {
              if (isNavGroup(link)) {
                const group = link as NavLinkGroup;
                return (
                  <div key={group.href} className="flex flex-col">
                    <span className="sf-eyebrow px-3 py-2">{group.label}</span>
                    {group.children.map((child) => {
                      const isChildActive = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "rounded-md px-6 py-2 text-left text-sm transition-colors",
                            isChildActive
                              ? "text-sf-accent font-semibold"
                              : "text-sf-ink-3 hover:text-sf-ink-2",
                          )}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                );
              }
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-md px-3 py-2 text-left text-sm transition-colors",
                    isActive ? "text-sf-accent font-semibold" : "text-sf-ink-3 hover:text-sf-ink-2",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="mt-2 flex gap-2 border-t border-sf-line pt-3">
              {Object.entries(locales).map(([code, { name, flag }]) => (
                <Button
                  key={code}
                  variant={locale === code ? "default" : "outline"}
                  size="sm"
                  onClick={() => switchLocale(code)}
                >
                  <span className="mr-1">{flag}</span>
                  {name}
                </Button>
              ))}
            </div>
            {!isLoggedIn && (
              <Button className="mt-3" size="sm" asChild>
                <Link href={`/${locale}/signup`}>{t("signUp")}</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
