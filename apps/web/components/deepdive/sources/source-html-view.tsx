"use client";

import DOMPurify from "dompurify";
import { useEffect, useRef, useMemo } from "react";

interface SourceHtmlViewProps {
  html: string;
  sourceId: string;
  className?: string;
}

/**
 * Renders rich HTML content (from MinerU/Webpage/WeChat) with:
 * - DOMPurify sanitization
 * - Fallback image resolver for unresolved relative paths
 */
export function SourceHtmlView({ html, sourceId, className }: SourceHtmlViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const clean = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        ADD_TAGS: ["figure", "figcaption", "section"],
        ADD_ATTR: ["colspan", "rowspan", "data-src"],
      }),
    [html],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      if (!src) return;

      // Absolute URL or already resolved? leave it
      if (src.startsWith("/api/") || /^https?:\/\//.test(src)) {
        img.onerror = () => {
          img.style.display = "none";
        };
        return;
      }

      // Relative path — route through fallback resolver
      const fallbackUrl = `/api/images/by-source/${sourceId}/${src.replace(/^\//, "")}`;
      img.src = fallbackUrl;
      img.onerror = () => {
        img.style.display = "none";
      };
    });
  }, [clean, sourceId]);

  return (
    <div
      ref={containerRef}
      className={`source-html-content prose prose-sm max-w-none
        prose-headings:text-foreground prose-p:text-foreground/90
        prose-a:text-accent-red prose-img:rounded-lg prose-img:mx-auto
        prose-table:border-collapse prose-table:w-full
        prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2
        prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2
        prose-blockquote:border-accent-red/30 prose-blockquote:text-muted-foreground
        ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
