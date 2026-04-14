"use client";

import DOMPurify from "dompurify";
import { useEffect, useRef } from "react";

interface WechatArticleContentProps {
  html: string;
  fallbackText: string;
}

export function WechatArticleContent({ html, fallbackText }: WechatArticleContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const images = containerRef.current.querySelectorAll("img");
    images.forEach((img) => {
      const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      if (src.includes("mmbiz.qpic.cn") || src.includes("mmbiz.qlogo.cn")) {
        img.onerror = () => {
          img.style.display = "none";
        };
      }
    });
  }, [html]);

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
