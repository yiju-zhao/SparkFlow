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
  // Last-resort: try the basename alone
  const basename = parts[parts.length - 1];
  if (basename && map.has(basename)) return map.get(basename)!;
  return null;
}

/**
 * MinerU v2 stores image paths under `content.image_source.path`. Legacy v1
 * uses `content.img_path`. Accept either so an older zip still renders.
 */
function getImagePath(content: ContentValue): string | undefined {
  const source = content.image_source;
  if (source && typeof source === "object") {
    const path = (source as { path?: unknown }).path;
    if (typeof path === "string" && path) return path;
  }
  const imgPath = content.img_path;
  if (typeof imgPath === "string" && imgPath) return imgPath;
  return undefined;
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
 * delimiters: collect all candidate matches (display + inline), pick a maximal
 * non-overlapping set (longest wins), then splice delimiters in from the end
 * so indices don't shift.
 */
function restoreMathDelimiters(
  text: string,
  mathHints: { inline: string[]; display: string[] },
): string {
  interface Match {
    start: number;
    end: number;
    expr: string;
    display: boolean;
  }
  const candidates: Match[] = [];

  const collect = (exprs: string[], display: boolean) => {
    for (const expr of exprs) {
      if (!expr) continue;
      let from = 0;
      while (true) {
        const idx = text.indexOf(expr, from);
        if (idx === -1) break;
        candidates.push({ start: idx, end: idx + expr.length, expr, display });
        from = idx + 1;
      }
    }
  };
  collect(mathHints.display, true);
  collect(mathHints.inline, false);

  // Prefer: display over inline, then longer, then earlier
  candidates.sort((a, b) => {
    if (a.display !== b.display) return a.display ? -1 : 1;
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenB !== lenA) return lenB - lenA;
    return a.start - b.start;
  });

  // Greedy pick non-overlapping matches
  const chosen: Match[] = [];
  for (const c of candidates) {
    const overlaps = chosen.some((x) => !(c.end <= x.start || c.start >= x.end));
    if (!overlaps) chosen.push(c);
  }

  // Apply from end to start so earlier indices remain valid
  chosen.sort((a, b) => b.start - a.start);
  let out = text;
  for (const c of chosen) {
    const delim = c.display ? "$$" : "$";
    out = out.slice(0, c.start) + delim + c.expr + delim + out.slice(c.end);
  }
  return out;
}

type InlineContent = string | Array<string | { type?: string; content?: unknown }>;
type MathHints = { inline: string[]; display: string[] };

/**
 * Convert a caption value — which in v2 is a span-array like
 * [{type:"text",content:"..."},{type:"equation_inline",content:"\\sigma"}] —
 * into inline HTML with $...$ delimiters preserved for KaTeX auto-render.
 * Falls back to joining plain-string arrays (legacy v1 shape).
 */
function renderCaption(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return extractInlineText(value);
  if (Array.isArray(value)) {
    // All-string array (v1): join plain
    if (value.every((v) => typeof v === "string")) {
      return extractInlineText(value.join(" "));
    }
    return extractInlineText(value as InlineContent);
  }
  return "";
}

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
      // MinerU v2 uses `equation_inline`; older dumps may use equation / inline_equation / latex.
      const itemType = item?.type;
      if (
        itemType === "equation" ||
        itemType === "inline_equation" ||
        itemType === "equation_inline" ||
        itemType === "latex"
      ) {
        // Emit $...$ inline delimiters so KaTeX auto-render picks it up.
        // Don't wrap in <code> — KaTeX's default ignoredTags includes "code".
        const latex = typeof item.content === "string" ? item.content : "";
        const withDelim = latex.startsWith("$") && latex.endsWith("$") ? latex : `$${latex}$`;
        return escapeHtml(withDelim);
      }
      const content = typeof item?.content === "string" ? item.content : "";
      return escapeHtml(content);
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
    const level = Math.min(Math.max((content.level as number) ?? 1, 1), 6);
    // title_content is a span-array in v2; may be a string in legacy dumps.
    const raw =
      (content.title_content as InlineContent | undefined) ??
      (content.text as InlineContent | undefined) ??
      "";
    const text = extractInlineText(raw, mathHints);
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
    type === "page_aside_text" ||
    type === "page_footnote" ||
    type === "text"
  ) {
    // v2 uses `paragraph_content`; v1 legacy dumps sometimes use `text` or `content`.
    // The value may be a plain string or a span-array with equation_inline items.
    const raw =
      (content.paragraph_content as InlineContent | undefined) ??
      (content[`${type}_content`] as InlineContent | undefined) ??
      (content.text as InlineContent | undefined) ??
      (content.content as InlineContent | undefined) ??
      "";
    const text = extractInlineText(raw, mathHints);
    return text ? `<p>${text}</p>` : "";
  }

  // Display equation block
  if (type === "equation_interline") {
    const latex = (content.math_content as string) ?? "";
    const imgSrc = resolveImage(getImagePath(content), imageMap);
    if (imgSrc) {
      return `<figure class="source-equation"><img src="${imgSrc}" alt="${escapeHtml(latex)}" /></figure>`;
    }
    // Fallback: emit $$...$$ so KaTeX auto-render picks it up.
    const withDelim =
      latex.trim().startsWith("$$") && latex.trim().endsWith("$$") ? latex : `$$${latex}$$`;
    return escapeHtml(withDelim);
  }

  // Image / chart
  if (type === "image" || type === "chart") {
    const imgSrc = resolveImage(getImagePath(content), imageMap);
    const captionSource =
      type === "chart" ? content.chart_caption : content.image_caption;
    const footnoteSource =
      type === "chart" ? content.chart_footnote : content.image_footnote;
    const caption = renderCaption(captionSource);
    const footnote = renderCaption(footnoteSource);
    if (!imgSrc) {
      // Skip figure if we couldn't resolve the image (nothing useful to show).
      return "";
    }
    // Use caption as alt text with no math delimiters, so screen readers aren't
    // confused by $...$ markers.
    const altText = typeof captionSource === "string"
      ? captionSource
      : Array.isArray(captionSource)
        ? captionSource
            .map((item) =>
              typeof item === "string" ? item : (item as { content?: unknown })?.content ?? "",
            )
            .join(" ")
        : "";
    return (
      `<figure><img src="${imgSrc}" alt="${escapeHtml(altText)}" />` +
      (caption ? `<figcaption>${caption}</figcaption>` : "") +
      (footnote ? `<figcaption class="source-footnote">${footnote}</figcaption>` : "") +
      `</figure>`
    );
  }

  // Seal — rendered as a figure with the extracted image and the seal text caption.
  if (type === "seal") {
    const imgSrc = resolveImage(getImagePath(content), imageMap);
    const caption = renderCaption(content.seal_content);
    if (!imgSrc && !caption) return "";
    return (
      `<figure class="source-seal">` +
      (imgSrc ? `<img src="${imgSrc}" alt="${escapeHtml(caption)}" />` : "") +
      (caption ? `<figcaption>${caption}</figcaption>` : "") +
      `</figure>`
    );
  }

  // Caption as standalone block (legacy v1 shape — kept for defensive parsing).
  if (type === "image_caption" || type === "table_caption" || type === "chart_caption") {
    const caption = renderCaption(
      (content.content as InlineContent | undefined) ??
        (content.text as InlineContent | undefined),
    );
    return caption ? `<p>${caption}</p>` : "";
  }

  // Table — v2 stores HTML at `content.html`, legacy v1 uses `content.table_body`.
  if (type === "table" || type === "table_body") {
    const body =
      (typeof content.html === "string" && content.html) ||
      (typeof content.table_body === "string" && content.table_body) ||
      "";
    const caption = renderCaption(content.table_caption);
    const footnote = renderCaption(content.table_footnote);
    const imgSrc = body ? null : resolveImage(getImagePath(content), imageMap);
    const captionHtml = caption ? `<figcaption>${caption}</figcaption>` : "";
    const footnoteHtml = footnote
      ? `<figcaption class="source-footnote">${footnote}</figcaption>`
      : "";
    const inner = body || (imgSrc ? `<img src="${imgSrc}" alt="${escapeHtml(caption)}" />` : "");
    if (!inner && !captionHtml) return "";
    return `<figure class="source-table">${captionHtml}${inner}${footnoteHtml}</figure>`;
  }

  // Code block — v2 stores body at `code_content` (span-array), legacy at `code_body`.
  if (type === "code") {
    const raw =
      (content.code_content as InlineContent | undefined) ??
      (content.code_body as InlineContent | undefined) ??
      "";
    const body = extractInlineText(raw);
    const lang = typeof content.code_language === "string" ? content.code_language : "";
    const langClass = lang ? ` class="lang-${escapeHtml(lang)}"` : "";
    const caption = renderCaption(content.code_caption);
    const captionHtml = caption ? `<figcaption>${caption}</figcaption>` : "";
    if (!body && !captionHtml) return "";
    return `<figure class="source-code">${captionHtml}<pre><code${langClass}>${body}</code></pre></figure>`;
  }

  // Algorithm — v2 stores body at `algorithm_content` (span-array).
  if (type === "algorithm") {
    const raw =
      (content.algorithm_content as InlineContent | undefined) ??
      (content.algorithm_body as InlineContent | undefined) ??
      "";
    const body = extractInlineText(raw);
    const caption = renderCaption(content.algorithm_caption);
    const captionHtml = caption ? `<figcaption>${caption}</figcaption>` : "";
    if (!body && !captionHtml) return "";
    return `<figure class="source-algorithm">${captionHtml}<pre><code>${body}</code></pre></figure>`;
  }

  // Lists — v2 items: {item_type, item_content: span-array}. Legacy: strings or {content}.
  if (type === "list" || type === "index") {
    const items = content.list_items as unknown;
    if (!Array.isArray(items) || items.length === 0) return "";
    const tag = type === "index" ? "ol" : "ul";
    const lis = items
      .map((li) => {
        if (typeof li === "string") return `<li>${escapeHtml(li)}</li>`;
        if (li && typeof li === "object") {
          const obj = li as Record<string, unknown>;
          const raw =
            (obj.item_content as InlineContent | undefined) ??
            (obj.list_item_content as InlineContent | undefined) ??
            (obj.content as InlineContent | undefined) ??
            "";
          const inner = extractInlineText(raw, mathHints);
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

export function buildHtmlFromContentList(
  contentList: ContentListItem[],
  imagePathToApiUrl: Map<string, string>,
  markdown?: string,
): string {
  const parts: string[] = [];
  const mathHints = markdown ? extractMathFromMarkdown(markdown) : undefined;

  for (const item of contentList) {
    // Page numbers carry no meaning in the continuous reading view — skip them.
    if (item.type === "page_number") continue;

    const inner = renderItemInner(item, imagePathToApiUrl, mathHints);
    if (!inner) continue;
    const typeClass = (item.type || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
    parts.push(`<div class="md-block md-block-${typeClass}">${inner}</div>`);
  }

  return parts.join("\n");
}
