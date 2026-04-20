// apps/web/components/explore/shared/filter-bar.tsx

"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[];
  placeholder?: string;
}

interface FilterBarProps {
  filters: FilterConfig[];
  className?: string;
}

export function FilterBar({ filters, className }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("explore.filters");

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("page", "0");

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const clearAllFilters = () => {
    startTransition(() => {
      router.push(pathname);
    });
  };

  const hasActiveFilters = filters.some((f) => searchParams.has(f.key));

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${className ?? ""} ${isPending ? "opacity-70" : ""}`}
    >
      {filters.map((filter) => {
        const active = searchParams.get(filter.key) && searchParams.get(filter.key) !== "all";
        return (
          <Select
            key={filter.key}
            value={searchParams.get(filter.key) || "all"}
            onValueChange={(value) => updateFilter(filter.key, value)}
          >
            <SelectTrigger
              className={`h-9 w-auto min-w-36 gap-2 rounded-md border-sf-line-strong bg-sf-surface px-3 text-[13px] font-medium ${
                active ? "border-sf-accent text-sf-accent" : "text-sf-ink-2"
              }`}
            >
              <SelectValue placeholder={filter.placeholder || filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{filter.label}: All</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAllFilters}
          className="h-9 text-sf-accent hover:text-sf-accent-ink"
        >
          <X className="h-3.5 w-3.5" />
          {t("clear")}
        </Button>
      )}
    </div>
  );
}
