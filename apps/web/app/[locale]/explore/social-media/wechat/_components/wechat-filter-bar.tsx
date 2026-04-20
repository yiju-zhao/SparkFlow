"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Network } from "lucide-react";
import type { WechatSource } from "@/lib/wechat/queries";

interface Props {
  sources: WechatSource[];
}

const INITIAL_VISIBLE = 10;

export function WechatSourcesChips({ sources }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  const activeSource = searchParams.get("source");

  const updateSource = (value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("source", value);
    else params.delete("source");
    params.set("page", "0");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  if (sources.length === 0) return null;

  const visible = expanded ? sources : sources.slice(0, INITIAL_VISIBLE);
  const hidden = Math.max(0, sources.length - visible.length);

  return (
    <div className={`space-y-3 ${isPending ? "opacity-70" : ""}`}>
      <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-sf-ink-2 flex items-center gap-2">
        <Network className="h-3.5 w-3.5" /> Article Sources
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => updateSource(null)}
          className={`px-3 py-1.5 text-xs font-medium border rounded-[6px] transition-colors ${
            !activeSource
              ? "bg-sf-accent text-white border-sf-accent"
              : "bg-sf-bg text-sf-ink-2 border-sf-line-strong hover:border-sf-accent"
          }`}
        >
          All sources
        </button>
        {visible.map((s) => {
          const active = activeSource === String(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => updateSource(active ? null : String(s.id))}
              className={`px-3 py-1.5 text-xs font-medium border rounded-[6px] transition-colors ${
                active
                  ? "bg-sf-accent text-white border-sf-accent"
                  : "bg-sf-bg text-sf-ink-2 border-sf-line-strong hover:border-sf-accent"
              }`}
            >
              {s.name}
            </button>
          );
        })}
        {hidden > 0 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="px-3 py-1.5 text-xs font-bold text-sf-accent hover:underline"
          >
            + {hidden} more
          </button>
        )}
        {expanded && sources.length > INITIAL_VISIBLE && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="px-3 py-1.5 text-xs font-bold text-sf-accent hover:underline"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}
