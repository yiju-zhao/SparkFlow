import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { useCitationSafe } from "@/lib/context/citation-context";
import "katex/dist/katex.min.css";

interface MarkdownProps {
  children: string;
  className?: string;
}

const HTML_TABLE_REGEX = /<table[\s\S]*?<\/table>/gi;
const CITATION_REGEX = /\[ref:([a-zA-Z0-9_-]+)\]/g;
const DISALLOWED_RAW_TAGS = ["think", "answer"];

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

const HtmlTable = memo(function HtmlTable({ html }: { html: string }) {
  return (
    <div className="my-4 w-full overflow-x-auto">
      <div
        className="[&_table]:w-full [&_table]:text-sm [&_table]:border-collapse [&_table]:border [&_table]:border-border [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:text-left [&_td]:text-xs"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
});

/**
 * Normalize LaTeX delimiters to $/$$ that remark-math understands.
 * Simple string replacements — no complex regex to avoid backtracking.
 */
function preprocessLatex(content: string): string {
  let result = content;

  // 1. \begin{env}...\end{env} → wrap in $$
  // Use a simple scan instead of regex to avoid backtracking
  const beginRegex = /\\begin\{(\w+)\}/g;
  let match;
  while ((match = beginRegex.exec(result)) !== null) {
    const env = match[1];
    const endTag = `\\end{${env}}`;
    const endIdx = result.indexOf(endTag, match.index + match[0].length);
    if (endIdx === -1) continue;
    const fullEnd = endIdx + endTag.length;
    const before = result.slice(0, match.index);
    const mathBlock = result.slice(match.index, fullEnd);
    const after = result.slice(fullEnd);
    // Only wrap if not already in $$
    if (!before.trimEnd().endsWith("$$")) {
      result = before + "\n$$\n" + mathBlock + "\n$$\n" + after;
      beginRegex.lastIndex = before.length + mathBlock.length + 8; // skip past what we inserted
    }
  }

  // 2. \[...\] → $$...$$
  result = result.split("\\[").reduce((acc, part, i) => {
    if (i === 0) return part;
    const closeIdx = part.indexOf("\\]");
    if (closeIdx === -1) return acc + "\\[" + part;
    const math = part.slice(0, closeIdx);
    const rest = part.slice(closeIdx + 2);
    return acc + "\n$$\n" + math + "\n$$\n" + rest;
  }, "");

  // 3. \(...\) → $...$
  result = result.split("\\(").reduce((acc, part, i) => {
    if (i === 0) return part;
    const closeIdx = part.indexOf("\\)");
    if (closeIdx === -1) return acc + "\\(" + part;
    const math = part.slice(0, closeIdx);
    const rest = part.slice(closeIdx + 2);
    return acc + "$" + math + "$" + rest;
  }, "");

  return result;
}

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

const CitationLink = memo(function CitationLink({
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
});

const STATIC_COMPONENTS: Partial<Components> = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-red font-medium hover:underline hover:opacity-80 transition-colors cursor-pointer"
    >
      {children}
    </a>
  ),
  code: ({ className: codeClassName, children }) => {
    const isBlock = codeClassName?.includes("lang-");
    return isBlock ? (
      <div className="relative my-4 rounded-lg bg-zinc-950 p-4 overflow-x-auto max-w-full">
        <code
          className={cn(
            "text-xs font-mono text-zinc-50 block whitespace-pre-wrap break-all",
            codeClassName,
          )}
        >
          {children}
        </code>
      </div>
    ) : (
      <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <div className="max-w-full overflow-x-auto">{children}</div>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-4 my-2 space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-4 my-2 space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="my-0.5">{children}</li>,
  h1: ({ children }) => (
    <h1 className="text-lg font-bold mt-4 mb-2">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-bold mt-3 mb-2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-4 italic text-muted-foreground my-2">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-4 w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse border border-border">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
  tbody: ({ children }) => (
    <tbody className="divide-y divide-border">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-muted/50 transition-colors">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-muted px-3 py-2 text-left font-semibold text-xs">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-3 py-2 text-left text-xs">
      {children}
    </td>
  ),
  img: ({ src, alt }) => (
    <span className="block max-w-full overflow-hidden my-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || ""}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        style={{
          maxWidth: "100%",
          height: "auto",
          display: "block",
          backgroundColor: "hsl(var(--muted))",
        }}
        onLoad={(e) => {
          (e.currentTarget as HTMLImageElement).style.backgroundColor = "transparent";
        }}
      />
    </span>
  ),
};

export const Markdown = memo(function Markdown({
  children,
  className,
}: MarkdownProps) {
  const { processed: contentWithoutTables, tables } = useMemo(
    () => extractHtmlTables(children),
    [children],
  );
  const processedContent = useMemo(
    () => preprocessCitations(preprocessLatex(contentWithoutTables)),
    [contentWithoutTables],
  );

  const tableRef = useMemo(() => tables, [tables]);

  const components = useMemo<Components>(() => ({
    ...STATIC_COMPONENTS,
    "citation-ref": ({
      "data-chunk": chunkId,
      "data-index": index,
    }: {
      "data-chunk": string;
      "data-index": string;
    }) => <CitationLink data-chunk={chunkId} data-index={index} />,
    "html-table-placeholder": ({
      "data-index": dataIndex,
    }: {
      "data-index": string;
    }) => {
      const idx = parseInt(dataIndex, 10);
      const html = tableRef[idx];
      return html ? <HtmlTable html={html} /> : null;
    },
    p: ({ children: pChildren }) => {
      const hasBlockChild = hasNestedBlockElement(pChildren);
      const Tag = hasBlockChild ? "div" : "p";
      return (
        <Tag className="mb-2 last:mb-0 leading-relaxed">{pChildren}</Tag>
      );
    },
  }), [tableRef]);

  return (
    <div
      className={cn("wrap-break-word", className)}
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 500px" }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        disallowedElements={DISALLOWED_RAW_TAGS}
        unwrapDisallowed
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
});

function hasNestedBlockElement(child: unknown): boolean {
  if (!child || typeof child !== "object") return false;
  const c = child as {
    type?: { name?: string } | string;
    props?: {
      "data-index"?: string;
      className?: string;
      children?: unknown;
    };
  };

  if (c.props?.["data-index"] !== undefined) return true;

  const typeName = typeof c.type === "object" ? c.type?.name : c.type;
  if (typeName === "span" && c.props?.className?.includes("katex-display")) {
    return true;
  }

  const nested = c.props?.children;
  if (!nested) return false;
  if (Array.isArray(nested)) return nested.some(hasNestedBlockElement);
  return hasNestedBlockElement(nested);
}
