"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserNav } from "@/components/user-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

interface LandingHeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
  navLinks?: { label: string; href: string }[];
  isScrolled?: boolean;
  onScrollContainer?: boolean;
  variant?: "landing" | "explore";
}

const defaultNavLinks = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "FAQ", href: "#faq" },
];

export function LandingHeader({
  user,
  navLinks: customNavLinks,
  isScrolled,
  onScrollContainer,
  variant = "landing",
}: LandingHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isLoggedIn = !!user;
  const deepdiveHref = isLoggedIn ? "/deepdive" : "/login";
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
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-red">
              <span className="text-sm font-bold text-white">S</span>
            </div>
            <span className="text-lg font-semibold">SparkFlow</span>
          </Link>
        </div>

        {/* Desktop Nav */}
        <nav className={cn("hidden items-center justify-center gap-1 md:flex", islandClasses)}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className={cn("hidden items-center justify-end gap-2 md:flex justify-self-end", islandClasses)}>
          {isLoggedIn ? (
            <UserNav user={user} />
          ) : (
            <>
              <ThemeToggle />
              <Button variant="ghost" size="sm" asChild>
                <Link href="/signup">Sign Up</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <div className={cn("flex items-center gap-2 md:hidden justify-self-end", islandClasses)}>
          {isLoggedIn ? <UserNav user={user} /> : <ThemeToggle />}
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
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
              {!isLoggedIn && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/signup">Sign Up</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
