"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { WechatArticleSummary } from "@/lib/wechat/queries";

interface Props {
  article: WechatArticleSummary;
}

function relativeTimeLabel(d: Date) {
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  if (h < 48) return "Yesterday";
  const days = Math.round(h / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

// Deterministic tag: idx 0 → High Impact, 1 → Emerging Trend, 2 → Hub Pick, else null
function impactTag(id: number, idx: number) {
  const variants = [
    { label: "High Impact", className: "bg-sf-accent-soft text-sf-accent-ink" },
    { label: "Emerging Trend", className: "bg-sf-warn-soft text-sf-warn" },
    { label: "Hub Pick", className: "bg-sf-success-soft text-sf-success" },
  ];
  if (idx < 3) return variants[idx];
  if (id % 7 === 0) return variants[0];
  if (id % 11 === 0) return variants[1];
  return null;
}

export function WechatArticleRow({ article, index = 0 }: Props & { index?: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const publishedAt = article.publish_time ? new Date(article.publish_time) : null;
  const rel = publishedAt ? relativeTimeLabel(publishedAt) : null;
  const tag = impactTag(article.id, index);

  const href = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("article", String(article.id));
    return `${pathname}?${params.toString()}`;
  })();

  return (
    <Link
      href={href}
      scroll={false}
      className="group bg-sf-surface border border-sf-line rounded-[10px] overflow-hidden hover:border-sf-accent transition-all duration-300 flex flex-col md:flex-row"
    >
      {/* Cover — left */}
      <div className="w-full md:w-72 aspect-video md:aspect-auto md:min-h-[180px] overflow-hidden flex-shrink-0 bg-sf-bg-alt">
        {article.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/wechat/proxy-image?url=${encodeURIComponent(article.cover_url)}`}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-sf-accent-soft to-sf-bg-alt" />
        )}
      </div>

      {/* Body — right */}
      <div className="flex-grow p-5 md:p-6 flex flex-col justify-start min-w-0">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="h-7 w-7 rounded-full border border-sf-line bg-sf-bg-alt grid place-items-center text-[10px] font-bold text-sf-ink-2 shrink-0"
              aria-hidden
            >
              {initials(article.source_name)}
            </span>
            <span className="text-xs font-bold text-sf-ink truncate">{article.source_name}</span>
            {rel && (
              <span className="text-[10px] text-sf-ink-4 font-medium font-mono tabular-nums whitespace-nowrap">
                · {rel}
              </span>
            )}
          </div>
          {tag && (
            <span
              className={`px-2 py-0.5 ${tag.className} text-[10px] font-bold uppercase tracking-[0.14em] rounded-[3px] shrink-0`}
            >
              {tag.label}
            </span>
          )}
        </div>

        <h3 className="text-[17px] md:text-[18px] font-bold text-sf-ink leading-snug mb-2 group-hover:text-sf-accent transition-colors line-clamp-2">
          {article.title}
        </h3>

        {article.author && (
          <p className="text-sm text-sf-ink-3 line-clamp-1 leading-relaxed">
            By <span className="text-sf-ink-2 font-medium">{article.author}</span>
          </p>
        )}
      </div>
    </Link>
  );
}
