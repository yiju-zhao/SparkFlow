import { getTranslations, setRequestLocale } from "next-intl/server";
import { getWechatArticles, getWechatSources } from "@/lib/wechat/queries";
import { parseWechatArticleFilters, WECHAT_PAGE_SIZE } from "@/lib/wechat/filters";
import { WechatArticleGrid } from "@/components/explore/social-media/wechat-article-grid";
import { Pagination, EmptyState } from "@/components/explore/shared";
import { WechatFilterBar } from "./wechat-filter-bar";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WechatArticlesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const searchParamsResolved = await searchParams;
  const filters = parseWechatArticleFilters(searchParamsResolved);
  const t = await getTranslations("explore");

  const [{ articles, total }, sources] = await Promise.all([
    getWechatArticles(filters),
    getWechatSources(),
  ]);

  const totalPages = Math.ceil(total / WECHAT_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 border-b border-sf-line pb-6">
        <p className="sf-eyebrow">{t("socialMedia.wechat.breadcrumb")}</p>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="sf-h1">{t("socialMedia.wechat.title")}</h1>
            <p className="sf-meta mt-2">
              {t("socialMedia.wechat.found", { count: total.toLocaleString() })}
            </p>
          </div>
          <div className="hidden md:block text-right">
            <div className="font-extrabold text-sf-ink text-[32px] tabular-nums leading-none">
              {sources.length.toLocaleString()}
            </div>
            <div className="sf-eyebrow mt-2">Active sources</div>
          </div>
        </div>
      </header>

      <WechatFilterBar sources={sources} />

      {articles.length === 0 ? (
        <EmptyState
          title={t("socialMedia.wechat.noArticles")}
          description={t("socialMedia.wechat.noArticlesDesc")}
          icon="inbox"
        />
      ) : (
        <>
          <WechatArticleGrid articles={articles} />
          {totalPages > 1 && (
            <div className="sf-card">
              <Pagination
                currentPage={filters.page}
                totalPages={totalPages}
                totalItems={total}
                pageSize={WECHAT_PAGE_SIZE}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
