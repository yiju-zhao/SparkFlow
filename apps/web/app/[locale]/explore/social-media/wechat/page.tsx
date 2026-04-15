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
    <div className="flex flex-col gap-10">
      {/* Title Section */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">{t("socialMedia.wechat.breadcrumb")}</p>
        <h1 className="text-4xl font-bold tracking-tight">{t("socialMedia.wechat.title")}</h1>
        <p className="text-muted-foreground mt-2">
          {t("socialMedia.wechat.found", { count: total.toLocaleString() })}
        </p>
      </div>

      {/* Filters */}
      <WechatFilterBar sources={sources} />

      {/* Articles */}
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
            <Pagination
              currentPage={filters.page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={WECHAT_PAGE_SIZE}
            />
          )}
        </>
      )}
    </div>
  );
}
