"use client";

import Link from "next/link";
import { UserNav } from "./user-nav";

interface UnifiedHeaderProps {
    theme: "green" | "red";
    title: string;
    navLinks?: React.ReactNode;
    actionButton?: React.ReactNode;
    user?: {
        name?: string | null;
        email?: string | null;
        image?: string | null;
    };
}

export function UnifiedHeader({ theme, title, navLinks, actionButton, user }: UnifiedHeaderProps) {
    const accentColor = theme === "green" ? "text-[#00D084]" : "text-[#CE0E2D]"; // Huawei Red approximation

    // Base link for logo - if in Explore (green), go to Explore root. If in Deepdive (red), go to Deepdive.
    const logoHref = theme === "green" ? "/explore" : "/deepdive";

    return (
        <nav className="shrink-0 bg-foreground text-background z-[100]">
            <div className="grid grid-cols-3 h-14 items-center px-12">
                {/* Left: Logo */}
                <div className="flex items-center">
                    <Link href={logoHref} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                        <span className={`${accentColor} font-bold text-base`}>&gt;</span>
                        <span className="font-medium text-lg">{title}</span>
                    </Link>
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
