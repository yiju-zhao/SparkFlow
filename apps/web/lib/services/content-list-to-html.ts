import type { ContentListItem } from "./mineru-client";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveImage(imgPath: string | undefined, map: Map<string, string>): string | null {
  if (!imgPath) return null;
  // Try exact, then suffixes
  if (map.has(imgPath)) return map.get(imgPath)!;
  const parts = imgPath.split("/");
  for (let i = 1; i < parts.length; i++) {
    const suffix = parts.slice(i).join("/");
    if (map.has(suffix)) return map.get(suffix)!;
  }
  return null;
}

/**
 * Extract plain text from a title_content or paragraph_content value.
 * v2 format: [{type: "text", content: "..."}, {type: "equation", content: "..."}, ...]
 * legacy:    plain string
 */
function extractInlineText(value: any): string {
  if (typeof value === "string") return escapeHtml(value);
  if (!Array.isArray(value)) return "";
  return value
    .map((item: any) => {
      if (typeof item === "string") return escapeHtml(item);
      if (item?.type === "equation") {
        return `<code class="inline-equation">${escapeHtml(item.content || "")}</code>`;
      }
      return escapeHtml(item?.content || "");
    })
    .join("");
}

function renderItem(item: ContentListItem, imageMap: Map<string, string>): string {
  const type = item.type;

  // Title (v2 + legacy)
  if (type === "title" || (type === "text" && item.text_level)) {
    const level = Math.min(item.content?.level ?? item.text_level ?? 1, 6);
    const text = extractInlineText(item.content?.title_content ?? item.text ?? "");
    return `<h${level}>${text}</h${level}>`;
  }

  // Paragraph / plain text
  if (type === "paragraph" || type === "text") {
    const text = extractInlineText(item.content?.paragraph_content ?? item.text ?? "");
    return text ? `<p>${text}</p>` : "";
  }

  // Equation block
  if (type === "equation_interline" || type === "equation") {
    const latex = item.content?.math_content ?? item.text ?? "";
    const imgSrc = resolveImage(item.img_path, imageMap);
    if (imgSrc) {
      return `<div class="math-block"><img src="${imgSrc}" alt="${escapeHtml(latex)}" /></div>`;
    }
    // Fallback: raw LaTeX in code tag
    return `<div class="math-block"><code>${escapeHtml(latex)}</code></div>`;
  }

  // Image
  if (type === "image") {
    const imgSrc = resolveImage(item.img_path ?? item.content?.img_path, imageMap);
    if (!imgSrc) return "";
    const captionList = item.image_caption ?? item.content?.image_caption ?? [];
    const caption = Array.isArray(captionList) ? captionList.join(" ") : "";
    return `<figure><img src="${imgSrc}" alt="${escapeHtml(caption)}" />${
      caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""
    }</figure>`;
  }

  // Table — MinerU gives us ready-to-use HTML
  if (type === "table") {
    const body = item.table_body ?? item.content?.table_body ?? "";
    const captionList = item.table_caption ?? item.content?.table_caption ?? [];
    const caption = Array.isArray(captionList) ? captionList.join(" ") : "";
    const captionHtml = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "";
    // Wrap in figure for consistent styling
    return `<figure class="source-table">${captionHtml}${body}</figure>`;
  }

  // Chart — treat like image
  if (type === "chart") {
    const imgSrc = resolveImage(item.img_path ?? item.content?.img_path, imageMap);
    if (!imgSrc) return "";
    const captionList = item.chart_caption ?? [];
    const caption = Array.isArray(captionList) ? captionList.join(" ") : "";
    return `<figure><img src="${imgSrc}" alt="${escapeHtml(caption)}" />${
      caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""
    }</figure>`;
  }

  // Code block
  if (type === "code") {
    const body = item.code_body ?? item.content?.code_body ?? "";
    const lang = item.content?.code_language ?? "";
    const langClass = lang ? ` class="lang-${escapeHtml(lang)}"` : "";
    return `<pre><code${langClass}>${escapeHtml(body)}</code></pre>`;
  }

  // Algorithm
  if (type === "algorithm") {
    const body = item.content?.algorithm_content ?? "";
    return `<pre class="algorithm"><code>${escapeHtml(body)}</code></pre>`;
  }

  // Lists
  if (type === "list" || type === "index") {
    const items = item.list_items ?? item.content?.list_items ?? [];
    if (!Array.isArray(items) || items.length === 0) return "";
    const tag = type === "index" ? "ol" : "ul";
    const lis = items.map((li: string) => `<li>${escapeHtml(li)}</li>`).join("");
    return `<${tag}>${lis}</${tag}>`;
  }

  // Skip: page_header, page_footer, page_number, aside_text, page_footnote
  return "";
}

export function buildHtmlFromContentList(
  contentList: ContentListItem[],
  imagePathToApiUrl: Map<string, string>,
): string {
  const parts = contentList.map((item) => renderItem(item, imagePathToApiUrl)).filter(Boolean);
  return parts.join("\n");
}
