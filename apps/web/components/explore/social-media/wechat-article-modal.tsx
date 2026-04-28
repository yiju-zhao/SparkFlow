"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2, MoreHorizontal, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AddToNotebookDialog } from "./add-to-notebook-dialog";
import { WechatArticleContent } from "./wechat-article-content";
import type { WechatArticleDetail, WechatArticleSummary } from "@/lib/wechat/queries";

interface Props {
  article: WechatArticleDetail;
  related: WechatArticleSummary[];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function readTimeMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const wpm = /[\u4e00-\u9fff]/.test(text) ? 400 : 220;
  return Math.max(1, Math.round(words / wpm));
}

export function WechatArticleModal({ article, related }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("explore.socialMedia.wechat");
  const [copied, setCopied] = useState(false);

  const closeHref = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("article");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  const handleClose = useCallback(
    (open: boolean) => {
      if (!open) router.push(closeHref, { scroll: false });
    },
    [router, closeHref],
  );

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // no-op; clipboard may be unavailable
    }
  };

  const publishDate = article.publish_time
    ? new Date(article.publish_time).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const readTime = readTimeMinutes(article.content_text ?? "");

  const relatedHref = (id: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("article", String(id));
    return `${pathname}?${params.toString()}`;
  };

  return (
    <Dialog open onOpenChange={handleClose}>
      <DialogContent
        showCloseButton={false}
        className="p-0 gap-0 max-w-5xl w-[min(96vw,1024px)] h-[min(92vh,921px)] overflow-hidden rounded-[12px] border border-sf-line sm:max-w-5xl sm:rounded-[12px] flex flex-col"
      >
        <DialogTitle className="sr-only">{article.title}</DialogTitle>

        {/* Action bar (always visible above scrolling body) */}
        <div className="shrink-0 bg-sf-surface/95 backdrop-blur-md px-5 h-16 border-b border-sf-line flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleClose(false)}
              aria-label={t("close")}
              className="flex items-center justify-center w-10 h-10 rounded-[6px] text-sf-ink-2 hover:bg-sf-bg-alt transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="hidden md:block h-5 w-px bg-sf-line" />
            <span className="hidden md:inline-flex text-[11px] font-bold uppercase tracking-[0.18em] text-sf-ink-3">
              {t("readingNow")}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="hidden sm:inline-flex items-center gap-2 px-3 h-9 border border-sf-line-strong rounded-[6px] text-sf-ink-2 text-sm font-medium hover:bg-sf-bg-alt transition-colors"
            >
              <Link2 className="h-4 w-4" />
              {copied ? t("linkCopied") : t("copyLink")}
            </button>
            <AddToNotebookDialog
              article={{
                title: article.title,
                originalUrl: article.original_url,
                contentText: article.content_text,
                contentHtml: article.content_html,
              }}
            />
            {article.original_url && (
              <a
                href={article.original_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center justify-center w-10 h-10 rounded-[6px] text-sf-ink-2 hover:bg-sf-bg-alt transition-colors"
                aria-label={t("openOriginal")}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              type="button"
              aria-label="More"
              className="flex items-center justify-center w-10 h-10 rounded-[6px] text-sf-ink-2 hover:bg-sf-bg-alt transition-colors"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto scroll-smooth bg-sf-surface">
          <div className="mx-auto max-w-3xl px-6 md:px-8 py-10 md:py-14">
            {/* Header block */}
            <header className="mb-10">
              <div className="flex items-center gap-3 mb-6">
                <span
                  className="h-11 w-11 rounded-full border border-sf-line bg-sf-bg-alt grid place-items-center text-xs font-bold text-sf-ink-2 shrink-0"
                  aria-hidden
                >
                  {initials(article.source_name)}
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-sf-ink text-[15px] leading-tight truncate">
                    {article.source_name}
                  </p>
                  <p className="text-xs text-sf-ink-3">
                    {publishDate ? `${publishDate} · ` : ""}
                    {t("readTime", { minutes: readTime })}
                  </p>
                </div>
              </div>

              <h1 className="text-[28px] md:text-[40px] font-black text-sf-ink leading-[1.1] tracking-[-0.015em] mb-6">
                {article.title}
              </h1>

              {article.author && (
                <p className="text-sm text-sf-ink-3">
                  {t("byAuthor")}{" "}
                  <span className="text-sf-ink-2 font-medium">{article.author}</span>
                </p>
              )}
            </header>

            {/* Cover image */}
            {article.cover_url && (
              <div className="relative w-full aspect-video overflow-hidden border border-sf-line rounded-[8px] mb-10 bg-sf-bg-alt">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/wechat/proxy-image?url=${encodeURIComponent(article.cover_url)}`}
                  alt=""
                  className="object-cover w-full h-full"
                />
              </div>
            )}

            {/* Body */}
            <div className="text-sf-ink-2">
              <WechatArticleContent
                html={article.content_html}
                fallbackText={article.content_text}
                images={article.images}
              />
            </div>

            {/* Footer action row */}
            <div className="border-t border-sf-line pt-10 mt-16 flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <p className="font-bold text-sf-ink">{t("enjoyedThis")}</p>
                <p className="text-sm text-sf-ink-3">{t("exploreMore")}</p>
              </div>
              {article.original_url && (
                <a
                  href={article.original_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 h-10 bg-sf-black text-white rounded-[6px] text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t("openOriginal")}
                </a>
              )}
            </div>

            {/* Related articles */}
            {related.length > 0 && (
              <section className="mt-16">
                <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-sf-ink-3 mb-5">
                  {t("moreFrom", { source: article.source_name })}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {related.map((r) => (
                    <Link
                      key={r.id}
                      href={relatedHref(r.id)}
                      scroll={false}
                      className="group block"
                    >
                      <div className="h-36 border border-sf-line rounded-[8px] mb-3 overflow-hidden bg-sf-bg-alt">
                        {r.cover_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/wechat/proxy-image?url=${encodeURIComponent(r.cover_url)}`}
                            alt=""
                            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="h-full w-full bg-gradient-to-br from-sf-accent-soft to-sf-bg-alt" />
                        )}
                      </div>
                      <h5 className="font-bold text-sf-ink leading-snug line-clamp-2 group-hover:text-sf-accent transition-colors">
                        {r.title}
                      </h5>
                      {r.publish_time && (
                        <p className="text-xs text-sf-ink-3 mt-1">
                          {new Date(r.publish_time).toLocaleDateString(
                            locale === "zh" ? "zh-CN" : "en-US",
                            { month: "short", day: "numeric", year: "numeric" },
                          )}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
