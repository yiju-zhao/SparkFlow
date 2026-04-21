import Link from "next/link";
import { useLocale } from "next-intl";
import type { WechatArticleSummary } from "@/lib/wechat/queries";

interface WechatArticleCardProps {
  article: WechatArticleSummary;
}

export function WechatArticleCard({ article }: WechatArticleCardProps) {
  const locale = useLocale();
  const publishDate = article.publish_time
    ? new Date(article.publish_time).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <Link
      href={`/${locale}/explore/social-media/wechat?article=${article.id}`}
      className="group sf-card card-hoverable p-0 overflow-hidden flex flex-col"
    >
      <div className="relative h-44 w-full bg-sf-bg-alt overflow-hidden">
        {article.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/wechat/proxy-image?url=${encodeURIComponent(article.cover_url)}`}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sf-ink-4">
            <span className="sf-icon-tile">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 9h18" />
              </svg>
            </span>
            <span className="sf-eyebrow">No Cover</span>
          </div>
        )}
        <span className="sf-badge sf-badge-black absolute left-3 top-3">WECHAT</span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="text-[15px] font-semibold leading-snug line-clamp-3 text-sf-ink group-hover:text-sf-accent transition-colors">
          {article.title}
        </h3>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="sf-badge sf-badge-soft truncate max-w-[16ch]">
            {article.source_name}
          </span>
          {publishDate && (
            <span className="font-mono tabular-nums text-[11px] text-sf-ink-4">{publishDate}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
