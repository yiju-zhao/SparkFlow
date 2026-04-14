"use client";

import { WechatArticleCard } from "./wechat-article-card";
import type { WechatArticleSummary } from "@/lib/wechat/queries";

interface WechatArticleGridProps {
  articles: WechatArticleSummary[];
}

export function WechatArticleGrid({ articles }: WechatArticleGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <WechatArticleCard key={article.id} article={article} />
      ))}
    </div>
  );
}
