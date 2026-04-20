"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal } from "lucide-react";

export interface ConferencesFilterOption {
  value: string;
  label: string;
}

interface ConferencesFilterBarProps {
  venues: ConferencesFilterOption[];
  years: ConferencesFilterOption[];
}

export function ConferencesFilterBar({ venues, years }: ConferencesFilterBarProps) {
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
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div
      className={`bg-sf-surface p-4 md:p-5 flex flex-wrap items-end justify-between gap-4 border border-sf-line rounded-[10px] ${
        isPending ? "opacity-70" : ""
      }`}
    >
      <div className="flex flex-wrap items-end gap-3">
        {/* Venue */}
        <div className="flex flex-col gap-1.5 min-w-[180px]">
          <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-sf-ink-3">
            Venue
          </label>
          <Select
            value={searchParams.get("venue") || "all"}
            onValueChange={(v) => updateFilter("venue", v)}
          >
            <SelectTrigger className="h-10 bg-sf-bg border-sf-line-strong text-sm focus:ring-sf-accent">
              <SelectValue placeholder="All Venues" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Venues</SelectItem>
              {venues.map((v) => (
                <SelectItem key={v.value} value={v.value}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Year */}
        <div className="flex flex-col gap-1.5 min-w-[120px]">
          <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-sf-ink-3">
            Year
          </label>
          <Select
            value={searchParams.get("year") || "all"}
            onValueChange={(v) => updateFilter("year", v)}
          >
            <SelectTrigger className="h-10 bg-sf-bg border-sf-line-strong text-sm focus:ring-sf-accent">
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map((y) => (
                <SelectItem key={y.value} value={y.value}>
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search */}
        <div className="flex flex-col gap-1.5 min-w-[240px]">
          <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-sf-ink-3">
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-sf-ink-4 pointer-events-none" />
            <input
              type="text"
              placeholder="Search conference names…"
              defaultValue={searchParams.get("q") ?? ""}
              onChange={(e) => {
                const params = new URLSearchParams(searchParams.toString());
                if (e.target.value) params.set("q", e.target.value);
                else params.delete("q");
                startTransition(() => router.replace(`${pathname}?${params.toString()}`));
              }}
              className="w-full h-10 pl-10 pr-3 bg-sf-bg border border-sf-line-strong text-sm focus:ring-2 focus:ring-sf-accent focus:border-sf-accent outline-none rounded-[6px] text-sf-ink"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end">
        <Button
          variant="outline"
          className="h-10 border-sf-line-strong bg-sf-surface text-sf-ink hover:bg-sf-bg-alt gap-2"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Advanced Filters
        </Button>
      </div>
    </div>
  );
}
