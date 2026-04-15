import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getWechatArticle } from "@/lib/wechat/queries";
import { WechatArticleContent } from "@/components/explore/social-media/wechat-article-content";
import { AddToNotebookDialog } from "@/components/explore/social-media/add-to-notebook-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function WechatArticleDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const articleId = parseInt(id, 10);
  if (isNaN(articleId)) notFound();

  const article = await getWechatArticle(articleId);
  if (!article) notFound();

  const t = await getTranslations("explore.socialMedia.wechat");

  const publishDate = article.publish_time
    ? new Date(article.publish_time).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {/* Breadcrumb */}
      <p className="text-sm text-muted-foreground">
        {t("breadcrumb")}/{article.source_name}
      </p>

      {/* Title */}
      <h1 className="text-3xl font-bold tracking-tight leading-tight">
        {article.title}
      </h1>

      {/* Meta row */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="secondary">{article.source_name}</Badge>
        {article.author && (
          <span className="text-sm text-muted-foreground">{article.author}</span>
        )}
        {publishDate && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground">{publishDate}</span>
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {article.original_url && (
          <Button variant="outline" size="sm" asChild>
            <a href={article.original_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              {t("openOriginal")}
            </a>
          </Button>
        )}
        <AddToNotebookDialog
          article={{
            title: article.title,
            originalUrl: article.original_url,
            contentText: article.content_text,
            contentHtml: article.content_html,
            images: article.images,
          }}
        />
      </div>

      {/* Article content card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-6 md:p-10">
          <WechatArticleContent
            html={article.content_html}
            fallbackText={article.content_text}
            images={article.images}
          />
        </div>
      </div>
    </div>
  );
}
