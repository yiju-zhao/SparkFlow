import { memo, useMemo } from "react";
import MarkdownToJsx from "markdown-to-jsx";
import TeX from "@matejmazur/react-katex";
import { cn } from "@/lib/utils";
import "katex/dist/katex.min.css";

interface MarkdownProps {
    children: string;
    className?: string;
}

// Custom component for rendering math blocks
function MathBlock({ math }: { math: string }) {
    return (
        <div className="my-4 overflow-x-auto">
            <TeX block>{math}</TeX>
        </div>
    );
}

// Custom component for rendering inline math
function MathInline({ math }: { math: string }) {
    return <TeX>{math}</TeX>;
}

// Preprocess markdown to convert LaTeX delimiters to custom components
function preprocessMath(content: string): string {
    // Replace block math $$...$$ with a custom marker
    let processed = content.replace(
        /\$\$([\s\S]*?)\$\$/g,
        (_, math) => `<math-block math="${encodeURIComponent(math.trim())}"></math-block>`
    );

    // Replace inline math $...$ (but not $$)
    // Use negative lookbehind/lookahead to avoid matching $$
    processed = processed.replace(
        /(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g,
        (_, math) => `<math-inline math="${encodeURIComponent(math.trim())}"></math-inline>`
    );

    return processed;
}

// Extract HTML tables and replace with placeholders to avoid markdown-to-jsx parsing issues
function extractHtmlTables(content: string): { processed: string; tables: string[] } {
    const tables: string[] = [];
    const processed = content.replace(/<table[\s\S]*?<\/table>/gi, (match) => {
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

export const Markdown = memo(function Markdown({ children, className }: MarkdownProps) {
    // Extract HTML tables first, then process math
    const { processed: contentWithoutTables, tables } = useMemo(
        () => extractHtmlTables(children),
        [children]
    );
    const processedContent = useMemo(
        () => preprocessMath(contentWithoutTables),
        [contentWithoutTables]
    );

    return (
        <div className={cn("break-words", className)}>
            <MarkdownToJsx
                options={{
                    overrides: {
                        // Custom math components
                        "math-block": {
                            component: ({ math }: { math: string }) => (
                                <MathBlock math={decodeURIComponent(math)} />
                            ),
                        },
                        "math-inline": {
                            component: ({ math }: { math: string }) => (
                                <MathInline math={decodeURIComponent(math)} />
                            ),
                        },
                        "html-table-placeholder": {
                            component: ({ "data-index": dataIndex }: { "data-index": string }) => {
                                const index = parseInt(dataIndex, 10);
                                const html = tables[index];
                                return html ? <HtmlTable html={html} /> : null;
                            },
                        },
                        a: {
                            props: {
                                target: "_blank",
                                rel: "noopener noreferrer",
                                className: "text-accent-blue hover:underline cursor-pointer",
                            },
                        },
                        code: {
                            component: ({ className: codeClassName, children: codeChildren, ...props }) => {
                                const isBlock = codeClassName?.includes("lang-");
                                return isBlock ? (
                                    <div className="relative my-4 rounded-lg bg-zinc-950 p-4 overflow-x-auto max-w-full">
                                        <code className={cn("text-xs font-mono text-zinc-50 block whitespace-pre-wrap break-all", codeClassName)} {...props}>
                                            {codeChildren}
                                        </code>
                                    </div>
                                ) : (
                                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                                        {codeChildren}
                                    </code>
                                );
                            },
                        },
                        pre: {
                            component: ({ children: preChildren }) => (
                                <div className="max-w-full overflow-x-auto">{preChildren}</div>
                            ),
                        },
                        ul: {
                            props: {
                                className: "list-disc pl-4 my-2 space-y-1",
                            },
                        },
                        ol: {
                            props: {
                                className: "list-decimal pl-4 my-2 space-y-1",
                            },
                        },
                        li: {
                            props: {
                                className: "my-0.5",
                            },
                        },
                        p: {
                            props: {
                                className: "mb-2 last:mb-0 leading-relaxed",
                            },
                        },
                        h1: {
                            props: {
                                className: "text-lg font-bold mt-4 mb-2",
                            },
                        },
                        h2: {
                            props: {
                                className: "text-base font-bold mt-3 mb-2",
                            },
                        },
                        h3: {
                            props: {
                                className: "text-sm font-bold mt-2 mb-1",
                            },
                        },
                        blockquote: {
                            props: {
                                className: "border-l-2 border-border pl-4 italic text-muted-foreground my-2",
                            },
                        },
                        table: {
                            component: ({ children: tableChildren, ...props }) => (
                                <div className="my-4 w-full overflow-x-auto">
                                    <table className="w-full text-sm border-collapse border border-border" {...props}>
                                        {tableChildren}
                                    </table>
                                </div>
                            ),
                        },
                        thead: {
                            component: ({ children: theadChildren, ...props }) => (
                                <thead className="bg-muted" {...props}>
                                    {theadChildren}
                                </thead>
                            ),
                        },
                        tbody: {
                            component: ({ children: tbodyChildren, ...props }) => (
                                <tbody className="divide-y divide-border" {...props}>
                                    {tbodyChildren}
                                </tbody>
                            ),
                        },
                        tr: {
                            component: ({ children: trChildren, ...props }) => (
                                <tr className="hover:bg-muted/50 transition-colors" {...props}>
                                    {trChildren}
                                </tr>
                            ),
                        },
                        th: {
                            component: ({ children: thChildren, ...props }) => (
                                <th className="border border-border bg-muted px-3 py-2 text-left font-semibold text-xs" {...props}>
                                    {thChildren}
                                </th>
                            ),
                        },
                        td: {
                            component: ({ children: tdChildren }) => (
                                <td className="border border-border px-3 py-2 text-left text-xs">
                                    {tdChildren}
                                </td>
                            ),
                        },
                        img: {
                            component: ({ src, alt, width, height }) => (
                                <span className="block max-w-full overflow-hidden">
                                    <img
                                        src={src}
                                        alt={alt || ''}
                                        width={width}
                                        height={height}
                                        loading="lazy"
                                        style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
                                    />
                                </span>
                            ),
                        },
                        div: {
                            props: {
                                className: "max-w-full overflow-hidden",
                            },
                        },
                    },
                    forceBlock: true,
                }}
            >
                {processedContent}
            </MarkdownToJsx>
        </div>
    );
});
