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

    // Build a map from original WeChat CDN URLs to local DB image IDs
    const urlToId = new Map<string, number>();
    if (images) {
      for (const img of images) {
        if (img.original_url) {
          urlToId.set(img.original_url, img.id);
        }
      }
    }

    const imgElements = containerRef.current.querySelectorAll("img");
    imgElements.forEach((img) => {
      const originalSrc = img.getAttribute("data-src") || img.getAttribute("src") || "";
      if (!originalSrc) return;

      // Prefer DB-stored image if we have a match by original URL
      const dbImageId = urlToId.get(originalSrc);
      if (dbImageId) {
        img.src = `/api/wechat/images/${dbImageId}`;
      } else {
        // Fallback to proxy for images not in the DB
        img.src = `/api/wechat/proxy-image?url=${encodeURIComponent(originalSrc)}`;
      }

      img.onerror = () => {
        // If DB image failed, try proxy as last resort
        if (dbImageId && !img.src.includes("proxy-image")) {
          img.src = `/api/wechat/proxy-image?url=${encodeURIComponent(originalSrc)}`;
        } else {
          img.style.display = "none";
        }
      };
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
