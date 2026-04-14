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
      href={`/${locale}/explore/social-media/wechat/${article.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
    >
      {/* Cover image */}
      <div className="relative h-40 w-full bg-muted overflow-hidden">
        {article.cover_url ? (
          <img
            src={article.cover_url}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No Cover
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-foreground">
          {article.title}
        </h3>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            {article.source_name}
          </span>
          {publishDate && (
            <span className="text-xs text-muted-foreground">{publishDate}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
