import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import {
  getRelatedWechatArticles,
  getWechatArticle,
  getWechatArticles,
  getWechatSources,
} from "@/lib/wechat/queries";
import { parseWechatArticleFilters, WECHAT_PAGE_SIZE } from "@/lib/wechat/filters";
import { EmptyState } from "@/components/explore/shared";
import { WechatArticleRow } from "@/components/explore/social-media/wechat-article-row";
import { WechatArticleModal } from "@/components/explore/social-media/wechat-article-modal";
import { WechatSourcesChips } from "./_components/wechat-filter-bar";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WechatArticlesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const searchParamsResolved = await searchParams;
  const filters = parseWechatArticleFilters(searchParamsResolved);

  const articleParam = searchParamsResolved.article;
  const articleId = typeof articleParam === "string" ? parseInt(articleParam, 10) : NaN;

  const [{ articles, total }, sources, modalArticle] = await Promise.all([
    getWechatArticles(filters),
    getWechatSources(),
    Number.isFinite(articleId) ? getWechatArticle(articleId) : Promise.resolve(null),
  ]);

  const related = modalArticle
    ? await getRelatedWechatArticles(modalArticle.source_id, modalArticle.id, 4)
    : [];

  const totalPages = Math.max(1, Math.ceil(total / WECHAT_PAGE_SIZE));
  const pageStart = total === 0 ? 0 : filters.page * WECHAT_PAGE_SIZE + 1;
  const pageEnd = Math.min(total, pageStart + articles.length - 1);
  const currentPage = filters.page + 1;

  const paginationPages: (number | "ellipsis")[] = (() => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 6) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1, 2, 3);
      if (currentPage > 4 && currentPage < totalPages - 2) {
        pages.push("ellipsis");
        pages.push(currentPage);
        pages.push("ellipsis");
      } else {
        pages.push("ellipsis");
      }
      pages.push(totalPages);
    }
    return pages;
  })();

  const pageHref = (page0: number) => {
    const params = new URLSearchParams();
    Object.entries(searchParamsResolved).forEach(([k, v]) => {
      if (typeof v === "string") params.set(k, v);
    });
    params.set("page", String(page0));
    return `?${params.toString()}`;
  };

  return (
    <div className="flex flex-col">
      {/* Full-bleed header band */}
      <section
        className="relative isolate -mt-24 pt-28 pb-8 mb-10
          before:content-[''] before:absolute before:inset-0 before:left-1/2
          before:-translate-x-1/2 before:w-screen before:bg-sf-surface
          before:border-b before:border-sf-line before:-z-10"
      >
        <div className="space-y-6">
          {/* Title row + Sort dropdown */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-[24px] md:text-[28px] font-bold text-sf-ink tracking-[-0.015em]">
              WeChat Articles Explorer
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-sf-ink-3 uppercase tracking-[0.18em]">
                Sort by:
              </span>
              <select
                data-guide="wechat-sort-select"
                className="bg-transparent border-none text-sm font-semibold text-sf-accent focus:ring-0 focus:outline-none cursor-pointer"
                defaultValue="latest"
              >
                <option value="latest">Latest Published</option>
                <option value="shared">Most Shared</option>
                <option value="impact">Highest Impact</option>
              </select>
            </div>
          </div>

          {/* Article Sources chip cluster */}
          <div data-guide="wechat-sources-filter">
            <WechatSourcesChips sources={sources} />
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="flex flex-col gap-5">
        {articles.length === 0 ? (
          <EmptyState title="No articles found" description="Try different filters." icon="inbox" />
        ) : (
          articles.map((article, i) => (
            <div key={article.id} data-guide={i === 0 ? "wechat-article-row" : undefined}>
              <WechatArticleRow article={article} index={i} />
            </div>
          ))
        )}
      </section>

      {/* Pagination */}
      {total > 0 && (
        <div className="mt-12 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-sm text-sf-ink-3 font-medium">
            Showing{" "}
            <span className="text-sf-ink font-bold tabular-nums">
              {pageStart}-{pageEnd}
            </span>{" "}
            of <span className="text-sf-ink font-bold tabular-nums">{total.toLocaleString()}</span>{" "}
            articles
          </div>

          <nav className="flex items-center gap-2" aria-label="Pagination">
            <Link
              href={pageHref(Math.max(0, filters.page - 1))}
              aria-disabled={filters.page === 0}
              className={`w-10 h-10 flex items-center justify-center border border-sf-line-strong rounded-[6px] transition-colors ${
                filters.page === 0
                  ? "text-sf-ink-4 opacity-50 pointer-events-none"
                  : "text-sf-ink-3 hover:bg-sf-bg-alt"
              }`}
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            {paginationPages.map((p, idx) =>
              p === "ellipsis" ? (
                <span key={`e-${idx}`} className="px-2 text-sf-ink-4 font-mono select-none">
                  …
                </span>
              ) : (
                <Link
                  key={p}
                  href={pageHref(p - 1)}
                  aria-current={p === currentPage ? "page" : undefined}
                  className={`w-10 h-10 flex items-center justify-center font-medium text-sm rounded-[6px] transition-colors ${
                    p === currentPage
                      ? "bg-sf-accent text-white font-bold"
                      : "border border-sf-line-strong text-sf-ink-2 hover:bg-sf-bg-alt"
                  }`}
                >
                  {p}
                </Link>
              ),
            )}
            <Link
              href={pageHref(Math.min(totalPages - 1, filters.page + 1))}
              aria-disabled={currentPage === totalPages}
              className={`w-10 h-10 flex items-center justify-center border border-sf-line-strong rounded-[6px] transition-colors ${
                currentPage === totalPages
                  ? "text-sf-ink-4 opacity-50 pointer-events-none"
                  : "text-sf-ink-3 hover:bg-sf-bg-alt"
              }`}
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </nav>

          <div className="text-sm font-medium text-sf-ink-3">
            Page <span className="text-sf-ink font-bold tabular-nums">{currentPage}</span> of{" "}
            <span className="text-sf-ink font-bold tabular-nums">{totalPages}</span>
          </div>
        </div>
      )}

      {modalArticle && <WechatArticleModal article={modalArticle} related={related} />}
    </div>
  );
}
