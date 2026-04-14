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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Search } from "lucide-react";
import type { WechatSource } from "@/lib/wechat/queries";

interface WechatFilterBarProps {
  sources: WechatSource[];
}

export function WechatFilterBar({ sources }: WechatFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("explore.socialMedia.wechat");

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
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
    startTransition(() => {
      router.push(pathname);
    });
  };

  const hasFilters = searchParams.has("source") || searchParams.has("dateFrom") || searchParams.has("dateTo") || searchParams.has("search");

  return (
    <div className={`flex flex-wrap items-center gap-3 ${isPending ? "opacity-70" : ""}`}>
      {/* Source filter */}
      <Select
        value={searchParams.get("source") || "all"}
        onValueChange={(v) => updateParam("source", v === "all" ? null : v)}
      >
        <SelectTrigger className="w-45">
          <SelectValue placeholder={t("source")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("allSources")}</SelectItem>
          {sources.map((s) => (
            <SelectItem key={s.id} value={s.id.toString()}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Date from */}
      <Input
        type="date"
        value={searchParams.get("dateFrom") || ""}
        onChange={(e) => updateParam("dateFrom", e.target.value || null)}
        className="w-40"
      />

      {/* Date to */}
      <Input
        type="date"
        value={searchParams.get("dateTo") || ""}
        onChange={(e) => updateParam("dateTo", e.target.value || null)}
        className="w-40"
      />

      {/* Search */}
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("searchPlaceholder")}
          defaultValue={searchParams.get("search") || ""}
          className="pl-9"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              updateParam("search", (e.target as HTMLInputElement).value || null);
            }
          }}
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="h-10">
          <X className="h-4 w-4 mr-1" />
          {t("source") === "Source" ? "Clear" : "清除"}
        </Button>
      )}
    </div>
  );
}
