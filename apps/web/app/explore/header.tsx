"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserNav } from "@/components/user-nav";
import { cn } from "@/lib/utils";

interface ExploreHeaderProps {
    title: string;
    subtitle?: string;
    navLinks?: React.ReactNode;
    actionButton?: React.ReactNode;
    user?: {
        name?: string | null;
        email?: string | null;
        image?: string | null;
    };
}

export function ExploreHeader({ title, subtitle, navLinks, actionButton, user }: ExploreHeaderProps) {
    const accentColor = "text-[#00D084]";
    const pathname = usePathname();
    const [hidden, setHidden] = useState(false);
    const lastScrollY = useRef(0);
    const navRef = useRef<HTMLElement>(null);

    // Disable collapsing on detail pages (publications/[id], sessions/[id])
    const isDetailPage = /\/(publications|sessions)\/[^/]+$/.test(pathname);

    // Reset header visibility when navigating to a detail page
    useEffect(() => {
        if (isDetailPage) setHidden(false);
    }, [isDetailPage]);

    useEffect(() => {
        if (isDetailPage) return;

        // Find the scrollable sibling container
        const nav = navRef.current;
        if (!nav) return;
        const parent = nav.parentElement;
        if (!parent) return;

        const scrollContainer = Array.from(parent.children).find(
            (el) => el !== nav && (el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight
        ) as HTMLElement | undefined;

        if (!scrollContainer) return;

        const handleScroll = () => {
            const currentY = scrollContainer.scrollTop;
            const delta = currentY - lastScrollY.current;
            const atBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 1;

            // Ignore tiny deltas (sub-pixel jitter) and elastic bounce at boundaries
            if (Math.abs(delta) < 5 || currentY <= 0 || atBottom) {
                lastScrollY.current = currentY;
                return;
            }

            if (delta > 0 && currentY > 50) {
                setHidden(true);
            } else if (delta < 0) {
                setHidden(false);
            }
            lastScrollY.current = currentY;
        };

        scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
        return () => scrollContainer.removeEventListener("scroll", handleScroll);
    }, [isDetailPage]);

    return (
        <nav
            ref={navRef}
            className={cn(
                "bg-foreground/75 backdrop-blur-lg text-background z-100 border-b border-white/10 transition-all duration-300 overflow-hidden",
                hidden ? "max-h-0 opacity-0" : "max-h-14 opacity-100"
            )}
        >
            <div className="grid grid-cols-3 h-14 items-center px-12">
                {/* Left: Logo */}
                <div className="flex items-center gap-3">
                    <Link href="/" className="font-medium text-sm opacity-60 hover:opacity-100 transition-opacity">
                        sparkflow
                    </Link>
                    <Link href="/explore" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                        <span className={`${accentColor} font-bold text-base`}>&gt;</span>
                        <span className="font-medium text-sm">{title}</span>
                    </Link>
                    {subtitle && (
                        <>
                            <span className={`${accentColor} font-bold text-base`}>&gt;</span>
                            <span className="font-medium text-sm truncate max-w-[300px]">{subtitle}</span>
                        </>
                    )}
                </div>

                {/* Center: Nav links */}
                <div className="flex items-center justify-center gap-8">
                    {navLinks}
                </div>

                {/* Right: Actions & User */}
                <div className="flex items-center justify-end gap-4">
                    {actionButton}
                    {user && (
                        <div className="text-secondary pl-4 border-l border-white/10">
                            <UserNav user={user} />
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
}
