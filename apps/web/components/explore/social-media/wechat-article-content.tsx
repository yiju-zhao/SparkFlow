"use client";

import DOMPurify from "dompurify";
import { useEffect, useRef } from "react";

export interface WechatImage {
  id: number;
  image_type: string;
  image_index: number;
  original_url?: string;
}

interface WechatArticleContentProps {
  html: string;
  fallbackText: string;
  images?: WechatImage[];
}

export function WechatArticleContent({ html, fallbackText, images }: WechatArticleContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Build maps for matching: original_url → DB id, and image_index → DB id
    const urlToId = new Map<string, number>();
    if (images) {
      for (const img of images) {
        if (img.original_url) {
          urlToId.set(img.original_url, img.id);
        }
      }
    }

    // Pattern: scraper rewrites img src to "/api/images/{id}" where id is the DB image id
    const scraperPathPattern = /^\/api\/images\/(\d+)$/;

    const imgElements = containerRef.current.querySelectorAll("img");
    imgElements.forEach((img) => {
      const originalSrc = img.getAttribute("data-src") || img.getAttribute("src") || "";
      if (!originalSrc) return;

      // Case 1: Scraper-rewritten paths like "/api/images/94" → "/api/wechat/images/94"
      const scraperMatch = originalSrc.match(scraperPathPattern);
      if (scraperMatch) {
        img.src = `/api/wechat/images/${scraperMatch[1]}`;
        img.onerror = () => { img.style.display = "none"; };
        return;
      }

      // Case 2: Match by original WeChat CDN URL against DB images
      const dbImageId = urlToId.get(originalSrc);
      if (dbImageId) {
        img.src = `/api/wechat/images/${dbImageId}`;
        img.onerror = () => {
          if (!img.src.includes("proxy-image")) {
            img.src = `/api/wechat/proxy-image?url=${encodeURIComponent(originalSrc)}`;
          } else {
            img.style.display = "none";
          }
        };
        return;
      }

      // Case 3: Fallback to proxy for external URLs
      img.src = `/api/wechat/proxy-image?url=${encodeURIComponent(originalSrc)}`;
      img.onerror = () => { img.style.display = "none"; };
    });
  }, [html, images]);

  if (!html) {
    return (
      <div className="whitespace-pre-wrap text-foreground leading-relaxed">
        {fallbackText}
      </div>
    );
  }

  const clean = DOMPurify.sanitize(html, {
    ADD_TAGS: ["section"],
    ADD_ATTR: ["data-src"],
  });

  return (
    <div
      ref={containerRef}
      className="wechat-article-content prose prose-sm max-w-none
        prose-headings:text-foreground prose-p:text-foreground/90
        prose-a:text-accent-red prose-img:rounded-lg prose-img:mx-auto
        prose-blockquote:border-accent-red/30 prose-blockquote:text-muted-foreground"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
