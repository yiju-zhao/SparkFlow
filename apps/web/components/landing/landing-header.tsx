"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, Sparkles, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserNav } from "@/components/user-nav";
import { ThemeToggle } from "@/components/theme-toggle";
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
      setScrolled(!!isScrolled);
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

  const isIslandMode = scrolled;
  const islandClasses = cn(
    "pointer-events-auto transition-all duration-300 transform rounded-full px-4 py-2 -mx-4",
    isIslandMode
      ? "bg-background/80 backdrop-blur-lg shadow-lg translate-y-2"
      : "bg-transparent translate-y-0"
  );

  return (
    <header
      className={cn(
        "fixed z-50 transition-all duration-300 left-0 right-0",
        // Position & Shape
        isIslandMode ? "pointer-events-none" : "top-0",
        // Background & Borders
        scrolled
          ? "bg-transparent"
          : variant === "explore"
            ? "bg-background"
            : "bg-transparent"
      )}
    >
      <div
        className={cn(
          "grid h-16 grid-cols-2 md:grid-cols-3 items-center transition-all duration-300 mx-auto",
          variant === "explore" ? "w-full px-6 md:px-12" : "max-w-6xl px-6",
        )}
      >
        {/* Logo */}
        <div className={cn("flex justify-self-start", islandClasses)}>
          <Link href={`/${locale}`} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-red">
              <span className="text-sm font-bold text-white">S</span>
            </div>
            <span className="text-lg font-semibold">SparkFlow</span>
          </Link>
        </div>

        {/* Desktop Nav */}
        <nav className={cn("hidden items-center justify-center gap-1 md:flex", islandClasses)}>
          {links.map((link) => {
            if (isNavGroup(link)) {
              const group = link as NavLinkGroup;
              const isGroupActive = pathname.startsWith(group.href);
              return (
                <DropdownMenu key={group.href}>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "rounded-md px-3 py-2 text-sm transition-colors hover:text-foreground inline-flex items-center gap-1",
                        isGroupActive
                          ? "text-foreground font-medium"
                          : "text-muted-foreground"
                      )}
                    >
                      {group.label}
                      <svg width="10" height="10" viewBox="0 0 10 10" className="opacity-50">
                        <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center">
                    {group.children.map((child) => {
                      const isChildActive = pathname === child.href;
                      return (
                        <DropdownMenuItem key={child.href} asChild>
                          <Link
                            href={child.href}
                            className={cn(isChildActive && "font-medium")}
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
                  "rounded-md px-3 py-2 text-sm transition-colors hover:text-foreground",
                  isActive ? "text-foreground font-medium" : "text-muted-foreground"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop Actions */}
        <div className={cn("hidden items-center justify-end gap-2 md:flex justify-self-end", islandClasses)}>
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
          {isLoggedIn ? (
            <>
              <Link
                href={deepdiveHref}
                className="group flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-mono font-bold uppercase tracking-widest transition-all hover:bg-muted"
              >
                <Sparkles className="h-4 w-4 text-accent-red transition-transform group-hover:scale-110" />
                <span className="hidden md:inline">{t("deepdive").toLowerCase()}</span>
              </Link>
              <UserNav user={user} />
            </>
          ) : (
            <>
              <ThemeToggle />
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/${locale}/signup`}>{t("signUp")}</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <div className={cn("flex items-center gap-2 md:hidden justify-self-end", islandClasses)}>
          {isLoggedIn ? (
            <>
              <Link
                href={deepdiveHref}
                className="group flex items-center justify-center rounded-full p-2 transition-all hover:bg-muted"
                aria-label="Deepdive"
              >
                <Sparkles className="h-4 w-4 text-accent-red" />
              </Link>
              <UserNav user={user} />
            </>
          ) : (
            <ThemeToggle />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="border-b border-border bg-background/95 backdrop-blur-lg md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-4">
            {links.map((link) => {
              if (isNavGroup(link)) {
                const group = link as NavLinkGroup;
                return (
                  <div key={group.href} className="flex flex-col">
                    <span className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {group.label}
                    </span>
                    {group.children.map((child) => {
                      const isChildActive = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "rounded-md px-6 py-2 text-left text-sm transition-colors hover:text-foreground",
                            isChildActive ? "text-foreground font-medium" : "text-muted-foreground"
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
                    "rounded-md px-3 py-2 text-left text-sm transition-colors hover:text-foreground",
                    isActive ? "text-foreground font-medium" : "text-muted-foreground"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            {/* Mobile Language Switcher */}
            <div className="flex gap-2 py-2">
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
            <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
              {!isLoggedIn && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/${locale}/signup`}>{t("signUp")}</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
