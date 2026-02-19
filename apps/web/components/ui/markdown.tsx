import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import { useCitationSafe } from "@/lib/context/citation-context";
import "katex/dist/katex.min.css";

interface MarkdownProps {
  children: string;
  className?: string;
}

// Hoisted regexes for better performance
const HTML_TABLE_REGEX = /<table[\s\S]*?<\/table>/gi;
const CITATION_REGEX = /\[ref:([a-zA-Z0-9_-]+)\]/g;

// Extract HTML tables and replace with placeholders
function extractHtmlTables(content: string): {
  processed: string;
  tables: string[];
} {
  const tables: string[] = [];
  const processed = content.replace(HTML_TABLE_REGEX, (match) => {
    const index = tables.length;
    tables.push(match);
    return `<html-table-placeholder data-index="${index}"></html-table-placeholder>`;
  });
  return { processed, tables };
}

// Component to render raw HTML table
function HtmlTable({ html }: { html: string }) {
  return (
    <div className="my-4 w-full overflow-x-auto">
      <div
        className="[&_table]:w-full [&_table]:text-sm [&_table]:border-collapse [&_table]:border [&_table]:border-border [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:text-left [&_td]:text-xs"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// Preprocess citations: [ref:chunkId] -> clickable element with index
// Same chunkId gets the same index number
function preprocessCitations(content: string): string {
  const chunkIndexMap = new Map<string, number>();
  let nextIndex = 1;

  return content.replace(CITATION_REGEX, (_, chunkId) => {
    let index = chunkIndexMap.get(chunkId);
    if (index === undefined) {
      index = nextIndex++;
      chunkIndexMap.set(chunkId, index);
    }
    return `<citation-ref data-chunk="${chunkId}" data-index="${index}"></citation-ref>`;
  });
}

// Citation link component - renders as clickable numbered badge
function CitationLink({
  "data-chunk": chunkId,
  "data-index": index,
}: {
  "data-chunk": string;
  "data-index": string;
}) {
  const citationContext = useCitationSafe();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    citationContext?.navigateToChunk(chunkId);
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center justify-center h-5 w-5 text-[10px] font-semibold bg-amber-100 dark:bg-indigo-500/20 text-amber-700 dark:text-indigo-300 border border-amber-200 dark:border-indigo-500/30 rounded-full hover:bg-amber-200 dark:hover:bg-indigo-500/30 transition-colors cursor-pointer align-super"
      title="Navigate to source"
    >
      {index}
    </button>
  );
}

export const Markdown = memo(function Markdown({
  children,
  className,
}: MarkdownProps) {
  // Extract HTML tables first, then process citations
  const { processed: contentWithoutTables, tables } = useMemo(
    () => extractHtmlTables(children),
    [children],
  );
  const processedContent = useMemo(
    () => preprocessCitations(contentWithoutTables),
    [contentWithoutTables],
  );

  // Build components with custom elements using type assertion
  const components = {
    // Custom citation component
    "citation-ref": ({
      "data-chunk": chunkId,
      "data-index": index,
    }: {
      "data-chunk": string;
      "data-index": string;
    }) => <CitationLink data-chunk={chunkId} data-index={index} />,
    // HTML table placeholder
    "html-table-placeholder": ({
      "data-index": dataIndex,
    }: {
      "data-index": string;
    }) => {
      const index = parseInt(dataIndex, 10);
      const html = tables[index];
      return html ? <HtmlTable html={html} /> : null;
    },
    a: ({ href, children: linkChildren }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent-red font-medium hover:underline hover:opacity-80 transition-colors cursor-pointer"
      >
        {linkChildren}
      </a>
    ),
    code: ({ className: codeClassName, children: codeChildren }) => {
      const isBlock = codeClassName?.includes("lang-");
      return isBlock ? (
        <div className="relative my-4 rounded-lg bg-zinc-950 p-4 overflow-x-auto max-w-full">
          <code
            className={cn(
              "text-xs font-mono text-zinc-50 block whitespace-pre-wrap break-all",
              codeClassName,
            )}
          >
            {codeChildren}
          </code>
        </div>
      ) : (
        <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
          {codeChildren}
        </code>
      );
    },
    pre: ({ children: preChildren }) => (
      <div className="max-w-full overflow-x-auto">{preChildren}</div>
    ),
    ul: ({ children: ulChildren }) => (
      <ul className="list-disc pl-4 my-2 space-y-1">{ulChildren}</ul>
    ),
    ol: ({ children: olChildren }) => (
      <ol className="list-decimal pl-4 my-2 space-y-1">{olChildren}</ol>
    ),
    li: ({ children: liChildren }) => (
      <li className="my-0.5">{liChildren}</li>
    ),
    p: ({ children: pChildren }) => {
      // Helper to check if a child is a block-level element
      const isBlockElement = (child: unknown): boolean => {
        if (!child || typeof child !== "object") return false;
        const c = child as {
          type?: { name?: string } | string;
          props?: {
            "data-index"?: string;
            className?: string;
            children?: unknown;
          };
        };

        // Check for HtmlTable placeholder (renders div)
        if (c.props?.["data-index"] !== undefined) {
          return true;
        }

        // Check for KaTeX block math (has katex-display class in children)
        const typeName = typeof c.type === "object" ? c.type?.name : c.type;
        if (typeName === "span" && c.props?.className?.includes("katex-display")) {
          return true;
        }

        // Recursively check children for block elements
        if (c.props?.children) {
          if (Array.isArray(c.props.children)) {
            return c.props.children.some(isBlockElement);
          }
          return isBlockElement(c.props.children);
        }

        return false;
      };

      // Check if children contain block-level elements
      const hasBlockChild = Array.isArray(pChildren)
        ? pChildren.some(isBlockElement)
        : isBlockElement(pChildren);

      // Use div instead of p if there are block children to avoid hydration errors
      const Tag = hasBlockChild ? "div" : "p";
      return (
        <Tag className="mb-2 last:mb-0 leading-relaxed">{pChildren}</Tag>
      );
    },
    h1: ({ children: h1Children }) => (
      <h1 className="text-lg font-bold mt-4 mb-2">{h1Children}</h1>
    ),
    h2: ({ children: h2Children }) => (
      <h2 className="text-base font-bold mt-3 mb-2">{h2Children}</h2>
    ),
    h3: ({ children: h3Children }) => (
      <h3 className="text-sm font-bold mt-2 mb-1">{h3Children}</h3>
    ),
    blockquote: ({ children: bqChildren }) => (
      <blockquote className="border-l-2 border-border pl-4 italic text-muted-foreground my-2">
        {bqChildren}
      </blockquote>
    ),
    table: ({ children: tableChildren }) => (
      <div className="my-4 w-full overflow-x-auto">
        <table className="w-full text-sm border-collapse border border-border">
          {tableChildren}
        </table>
      </div>
    ),
    thead: ({ children: theadChildren }) => (
      <thead className="bg-muted">{theadChildren}</thead>
    ),
    tbody: ({ children: tbodyChildren }) => (
      <tbody className="divide-y divide-border">{tbodyChildren}</tbody>
    ),
    tr: ({ children: trChildren }) => (
      <tr className="hover:bg-muted/50 transition-colors">{trChildren}</tr>
    ),
    th: ({ children: thChildren }) => (
      <th className="border border-border bg-muted px-3 py-2 text-left font-semibold text-xs">
        {thChildren}
      </th>
    ),
    td: ({ children: tdChildren }) => (
      <td className="border border-border px-3 py-2 text-left text-xs">
        {tdChildren}
      </td>
    ),
    img: ({ src, alt }) => (
      <span className="block max-w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt || ""}
          loading="lazy"
          decoding="async"
          style={{
            maxWidth: "100%",
            height: "auto",
            display: "block",
          }}
        />
      </span>
    ),
  } as Components;

  return (
    <div className={cn("wrap-break-word", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
});
