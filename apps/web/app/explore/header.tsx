"use client";

import Link from "next/link";
import { UserNav } from "@/components/user-nav";

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

    return (
        <nav className="shrink-0 bg-foreground/75 backdrop-blur-lg text-background z-100 border-b border-white/10">
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
