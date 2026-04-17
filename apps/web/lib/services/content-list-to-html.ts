import type { ContentListItem } from "./mineru-client";

type ContentValue = Record<string, unknown>;

function escapeHtml(s: unknown): string {
  if (s == null) return "";
  const str = typeof s === "string" ? s : String(s);
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveImage(imgPath: string | undefined, map: Map<string, string>): string | null {
  if (!imgPath) return null;
  if (map.has(imgPath)) return map.get(imgPath)!;
  const parts = imgPath.split("/");
  for (let i = 1; i < parts.length; i++) {
    const suffix = parts.slice(i).join("/");
    if (map.has(suffix)) return map.get(suffix)!;
  }
  return null;
}

/**
 * Extract math expressions from markdown ($...$ and $$...$$ ranges).
 * Returns sorted longest-first so multi-token expressions win over substrings.
 */
function extractMathFromMarkdown(markdown: string): { inline: string[]; display: string[] } {
  const display: string[] = [];
  const inline: string[] = [];

  // $$...$$ (multi-line OK)
  for (const match of markdown.matchAll(/\$\$([\s\S]+?)\$\$/g)) {
    display.push(match[1].trim());
  }

  // $...$ — exclude $$ blocks by removing them first
  const noDisplay = markdown.replace(/\$\$[\s\S]+?\$\$/g, "");
  for (const match of noDisplay.matchAll(/\$([^$\n]+?)\$/g)) {
    inline.push(match[1].trim());
  }

  // Sort longest-first so multi-token expressions win over substrings
  display.sort((a, b) => b.length - a.length);
  inline.sort((a, b) => b.length - a.length);

  return { inline, display };
}

/**
 * MinerU content_list_v2 strips $...$ delimiters from paragraph text, but the
 * markdown output preserves them. Use the markdown as ground truth to restore
 * delimiters in plain text: find each math expression and wrap it with $ or $$.
 */
function restoreMathDelimiters(
  text: string,
  mathHints: { inline: string[]; display: string[] },
): string {
  let out = text;

  // Apply display math first (longer, safer to wrap)
  for (const expr of mathHints.display) {
    if (!expr) continue;
    const idx = out.indexOf(expr);
    if (idx === -1) continue;
    // Skip if already wrapped
    const before = out.slice(Math.max(0, idx - 2), idx);
    const after = out.slice(idx + expr.length, idx + expr.length + 2);
    if (before.endsWith("$$") || after.startsWith("$$")) continue;
    out = out.slice(0, idx) + `$$${expr}$$` + out.slice(idx + expr.length);
  }

  // Then inline math
  for (const expr of mathHints.inline) {
    if (!expr) continue;
    // Search all occurrences (non-overlapping)
    let searchFrom = 0;
    while (true) {
      const idx = out.indexOf(expr, searchFrom);
      if (idx === -1) break;
      const before = out.charAt(idx - 1);
      const after = out.charAt(idx + expr.length);
      // Already wrapped? skip this occurrence
      if (before === "$" || after === "$") {
        searchFrom = idx + expr.length;
        continue;
      }
      out = out.slice(0, idx) + `$${expr}$` + out.slice(idx + expr.length);
      searchFrom = idx + expr.length + 2;
    }
  }

  return out;
}

type InlineContent = string | Array<{ type?: string; content?: string }>;
type MathHints = { inline: string[]; display: string[] };

/**
 * Extract plain text from a title_content or paragraph_content value.
 * content_list_v2 items may be a plain string or an array of inline items
 * like [{type: "text", content: "..."}, {type: "equation", content: "..."}].
 * If mathHints is provided, restore $...$ delimiters stripped by v2.
 */
function extractInlineText(value: InlineContent, mathHints?: MathHints): string {
  if (typeof value === "string") {
    const withMath = mathHints ? restoreMathDelimiters(value, mathHints) : value;
    return escapeHtml(withMath);
  }
  if (!Array.isArray(value)) return "";
  return value
    .map((item): string => {
      if (typeof item === "string") {
        const withMath = mathHints ? restoreMathDelimiters(item, mathHints) : item;
        return escapeHtml(withMath);
      }
      if (item?.type === "equation") {
        // Emit $...$ inline delimiters so KaTeX auto-render picks it up.
        // Don't wrap in <code> — KaTeX's default ignoredTags includes "code".
        const latex = item.content || "";
        const withDelim = latex.startsWith("$") && latex.endsWith("$") ? latex : `$${latex}$`;
        return escapeHtml(withDelim);
      }
      return escapeHtml(item?.content || "");
    })
    .join("");
}

/**
 * Render a single content_list_v2 item into inner HTML (without the block wrapper).
 * The caller wraps the output with `md-block md-block-{type}` for styling.
 */
function renderItemInner(
  item: ContentListItem,
  imageMap: Map<string, string>,
  mathHints?: MathHints,
): string {
  const type = item.type;
  const content =
    typeof item.content === "object" && item.content !== null ? (item.content as ContentValue) : {};

  // Title
  if (type === "title") {
    const level = Math.min((content.level as number) ?? 1, 6);
    const text = extractInlineText((content.title_content as string) ?? "", mathHints);
    return text ? `<h${level}>${text}</h${level}>` : "";
  }

  // Paragraph / page-structure blocks
  if (
    type === "paragraph" ||
    type === "page_header" ||
    type === "header" ||
    type === "page_footer" ||
    type === "footer" ||
    type === "page_number" ||
    type === "aside_text" ||
    type === "page_footnote"
  ) {
    const text = extractInlineText((content.paragraph_content as string) ?? "", mathHints);
    return text ? `<p>${text}</p>` : "";
  }

  // Equation block
  if (type === "equation_interline") {
    const latex = (content.math_content as string) ?? "";
    const imgSrc = resolveImage(content.img_path as string | undefined, imageMap);
    if (imgSrc) {
      return `<img src="${imgSrc}" alt="${escapeHtml(latex)}" />`;
    }
    // Fallback: emit $$...$$ so KaTeX auto-render picks it up.
    // Don't wrap in <code> — KaTeX's default ignoredTags includes "code".
    const withDelim =
      latex.trim().startsWith("$$") && latex.trim().endsWith("$$") ? latex : `$$${latex}$$`;
    return escapeHtml(withDelim);
  }

  // Image / chart
  if (type === "image" || type === "chart") {
    const imgSrc = resolveImage(content.img_path as string | undefined, imageMap);
    if (!imgSrc) return "";
    const captionList =
      (content.image_caption as string[] | undefined) ??
      (content.chart_caption as string[] | undefined) ??
      [];
    const caption = Array.isArray(captionList) ? captionList.join(" ") : "";
    return `<figure><img src="${imgSrc}" alt="${escapeHtml(caption)}" />${
      caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""
    }</figure>`;
  }

  // Caption as standalone block
  if (type === "image_caption" || type === "table_caption" || type === "chart_caption") {
    const captionList = content.content as string[] | undefined;
    const caption = Array.isArray(captionList) ? captionList.join(" ") : "";
    return caption ? `<p>${escapeHtml(caption)}</p>` : "";
  }

  // Table — MinerU gives us ready-to-use HTML
  if (type === "table") {
    const body = (content.table_body as string) ?? "";
    const captionList = (content.table_caption as string[]) ?? [];
    const caption = Array.isArray(captionList) ? captionList.join(" ") : "";
    const captionHtml = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "";
    return `<figure class="source-table">${captionHtml}${body}</figure>`;
  }

  // Code block
  if (type === "code") {
    const body = (content.code_body as string) ?? "";
    const lang = (content.code_language as string) ?? "";
    const langClass = lang ? ` class="lang-${escapeHtml(lang)}"` : "";
    return `<pre><code${langClass}>${escapeHtml(body)}</code></pre>`;
  }

  // Algorithm
  if (type === "algorithm") {
    const body = (content.algorithm_content as string) ?? "";
    return `<pre class="algorithm"><code>${escapeHtml(body)}</code></pre>`;
  }

  // Lists — list_items may be plain strings OR objects with nested structure
  if (type === "list" || type === "index") {
    const items = content.list_items as unknown;
    if (!Array.isArray(items) || items.length === 0) return "";
    const tag = type === "index" ? "ol" : "ul";
    const lis = items
      .map((li) => {
        if (typeof li === "string") return `<li>${escapeHtml(li)}</li>`;
        if (li && typeof li === "object") {
          const obj = li as Record<string, unknown>;
          // v2 may wrap text in {content: "..."} or {list_item_content: [...]}
          const inner =
            typeof obj.content === "string"
              ? escapeHtml(obj.content)
              : Array.isArray(obj.list_item_content)
                ? extractInlineText(obj.list_item_content as InlineContent)
                : extractInlineText(obj.content as InlineContent);
          return inner ? `<li>${inner}</li>` : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("");
    return lis ? `<${tag}>${lis}</${tag}>` : "";
  }

  return "";
}

function pageDivider(pageIdx: number): string {
  return `<div class="md-page-divider" aria-hidden="true"><span>Page ${pageIdx + 1}</span></div>`;
}

export function buildHtmlFromContentList(
  contentList: ContentListItem[],
  imagePathToApiUrl: Map<string, string>,
  markdown?: string,
): string {
  const parts: string[] = [];
  let lastPageIdx: number | null = null;
  const mathHints = markdown ? extractMathFromMarkdown(markdown) : undefined;

  for (const item of contentList) {
    const pageIdx = (item.page_idx as number | undefined) ?? 0;
    if (lastPageIdx !== null && pageIdx !== lastPageIdx) {
      parts.push(pageDivider(lastPageIdx));
    }
    lastPageIdx = pageIdx;

    const inner = renderItemInner(item, imagePathToApiUrl, mathHints);
    if (!inner) continue;
    // Sanitize type → css-safe class token
    const typeClass = (item.type || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
    parts.push(`<div class="md-block md-block-${typeClass}">${inner}</div>`);
  }

  if (lastPageIdx !== null) {
    parts.push(pageDivider(lastPageIdx));
  }

  return parts.join("\n");
}
