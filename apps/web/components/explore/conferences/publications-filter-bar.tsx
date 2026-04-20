"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Search } from "lucide-react";

export interface PublicationsFilterOption {
  value: string;
  label: string;
}

export interface PublicationsFilterConfig {
  key: string;
  label: string;
  defaultLabel: string; // e.g. "All Venues"
  options: PublicationsFilterOption[];
}

interface Props {
  filters: PublicationsFilterConfig[];
  searchPlaceholder: string;
}

export function PublicationsFilterBar({ filters, searchPlaceholder }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

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

  const clearAll = () => {
    startTransition(() => router.push(pathname));
  };

  const hasActiveFilters = filters.some((f) => {
    const v = searchParams.get(f.key);
    return v && v !== "all";
  });

  const activeSearch = searchParams.get("q") ?? "";

  return (
    <div className={`flex flex-col gap-5 ${isPending ? "opacity-70" : ""}`}>
      {/* Full-width search */}
      <div className="relative w-full">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-sf-ink-4 pointer-events-none" />
        <input
          type="text"
          defaultValue={activeSearch}
          placeholder={searchPlaceholder}
          onChange={(e) => {
            const params = new URLSearchParams(searchParams.toString());
            if (e.target.value) params.set("q", e.target.value);
            else params.delete("q");
            params.set("page", "0");
            startTransition(() => router.replace(`${pathname}?${params.toString()}`));
          }}
          className="w-full h-12 pl-12 pr-4 bg-sf-bg border border-sf-line-strong focus:outline-none focus:ring-2 focus:ring-sf-accent focus:border-sf-accent text-sm rounded-[6px] text-sf-ink placeholder:text-sf-ink-4"
        />
      </div>

      {/* Filter chip row */}
      <div className="flex flex-wrap items-center gap-2.5">
        {filters.map((filter) => {
          const selected = searchParams.get(filter.key);
          const active = selected && selected !== "all";
          const selectedLabel =
            active && selected
              ? filter.options.find((o) => o.value === selected)?.label ?? selected
              : filter.defaultLabel;

          return (
            <DropdownMenu key={filter.key}>
              <DropdownMenuTrigger asChild>
                <button
                  className={`flex items-center justify-between gap-2 px-3 py-2 border text-xs font-medium bg-sf-surface rounded-[6px] transition-colors ${
                    active
                      ? "border-sf-accent text-sf-accent"
                      : "border-sf-line-strong text-sf-ink-2 hover:border-sf-accent"
                  }`}
                >
                  <span className="whitespace-nowrap">
                    <span className={active ? "font-semibold" : "text-sf-ink-3"}>
                      {filter.label}:
                    </span>{" "}
                    <span className={active ? "font-semibold" : ""}>{selectedLabel}</span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44 max-h-80 overflow-y-auto">
                <DropdownMenuItem onClick={() => updateFilter(filter.key, null)}>
                  {filter.defaultLabel}
                </DropdownMenuItem>
                {filter.options.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => updateFilter(filter.key, opt.value)}
                    className={selected === opt.value ? "bg-sf-accent-soft text-sf-accent-ink" : ""}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-semibold text-sf-accent px-4 py-2 hover:underline"
          >
            Clear All
          </button>
        )}
      </div>
    </div>
  );
}
