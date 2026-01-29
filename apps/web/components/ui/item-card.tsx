"use client";

import { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownItem {
  label: string;
  icon?: ReactNode;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}

export interface ItemCardProps {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  timestamp?: ReactNode;
  statusIndicator?: ReactNode;
  isSelected?: boolean;
  isPending?: boolean;
  onClick?: () => void;
  dropdownItems?: DropdownItem[];
  children?: ReactNode;
  className?: string;
}

/**
 * A reusable card component for list items (sources, notes, etc.)
 * Provides consistent hover effects, dropdown menu, and layout.
 */
export function ItemCard({
  title,
  subtitle,
  icon,
  badge,
  timestamp,
  statusIndicator,
  isSelected,
  isPending,
  onClick,
  dropdownItems,
  children,
  className,
}: ItemCardProps) {
  return (
    <div
      className={cn(
        "group flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 transition-all",
        "hover:bg-accent",
        isSelected && "bg-accent",
        isPending && "opacity-50",
        className
      )}
      onClick={onClick}
    >
      {/* Icon */}
      {icon && <div className="mt-0.5">{icon}</div>}

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {statusIndicator}
        </div>

        {/* Subtitle / Badge / Timestamp row */}
        {(subtitle || badge || timestamp) && (
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            {badge}
            {subtitle}
            {timestamp && <span suppressHydrationWarning>{timestamp}</span>}
          </div>
        )}

        {/* Additional content */}
        {children}
      </div>

      {/* Dropdown Menu */}
      {dropdownItems && dropdownItems.length > 0 && (
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild suppressHydrationWarning>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={isPending}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {dropdownItems.map((item, index) => (
                <DropdownMenuItem
                  key={index}
                  className={item.className}
                  onClick={item.onClick}
                >
                  {item.icon}
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
