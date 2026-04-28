"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useGuides } from "@/components/guides/guide-provider";

const locales = {
  en: { name: "English", flag: "🇺🇸" },
  zh: { name: "中文", flag: "🇨🇳" },
} as const;

interface LocaleSwitcherProps {
  variant?: "icon" | "text";
  className?: string;
}

export function LocaleSwitcher({ variant = "icon", className }: LocaleSwitcherProps) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Expose menu open/close to the guide player so the language-theme guide
  // can walk the user into the dropdown content.
  const { registerGuideAction } = useGuides();
  useEffect(() => {
    const unregisterOpen = registerGuideAction("locale-menu:open", () => setMenuOpen(true));
    const unregisterClose = registerGuideAction("locale-menu:close", () => setMenuOpen(false));
    return () => {
      unregisterOpen();
      unregisterClose();
    };
  }, [registerGuideAction]);

  const switchLocale = (newLocale: string) => {
    // Replace the current locale in the path
    const segments = pathname.split("/");
    segments[1] = newLocale;
    router.push(segments.join("/"));
  };

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          data-guide="language-switcher"
          variant="ghost"
          size={variant === "icon" ? "icon" : "sm"}
          className={cn(className)}
        >
          <Globe className="h-4 w-4" />
          {variant === "text" && (
            <span className="ml-2">{locales[locale as keyof typeof locales]?.name || locale}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent data-guide="locale-menu-content" align="end">
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
  );
}
