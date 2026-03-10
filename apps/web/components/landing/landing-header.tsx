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

  return (
    <header
      className={cn(
        "fixed z-50 transition-all duration-300",
        // Position & Shape
        variant === "explore" && scrolled
          ? "top-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-5xl rounded-full"
          : "top-0 left-0 right-0",
        // Background & Borders
        scrolled
          ? variant === "explore"
            ? "bg-background/80 backdrop-blur-lg border border-border shadow-lg"
            : "bg-background/80 backdrop-blur-lg border-b border-border shadow-huawei-subtle"
          : variant === "explore"
            ? "bg-background"
            : "bg-transparent"
      )}
    >
      <div
        className={cn(
          "grid h-16 grid-cols-3 items-center",
          variant === "explore" 
            ? scrolled ? "px-6 md:px-8" : "px-12" 
            : "mx-auto max-w-6xl px-6",
        )}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-red">
            <span className="text-sm font-bold text-white">S</span>
          </div>
          <span className="text-lg font-semibold">SparkFlow</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center justify-center gap-1 md:flex">
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
        <div className="hidden items-center justify-end gap-2 md:flex">
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
        <div className="flex items-center gap-2 md:hidden">
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
