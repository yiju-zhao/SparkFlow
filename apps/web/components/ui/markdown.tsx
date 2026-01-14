import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
// import remarkMath from "remark-math"; // Disabled for testing
// import rehypeKatex from "rehype-katex"; // Disabled for testing
// import rehypeRaw from "rehype-raw"; // Disabled for testing
import rehypeSlug from "rehype-slug";
import { cn } from "@/lib/utils";
import type { Components } from "react-markdown";
// import "katex/dist/katex.min.css"; // Disabled for testing

// Static plugin arrays - created once
const remarkPlugins = [remarkGfm]; // remarkMath disabled for testing
const rehypePlugins = [rehypeSlug]; // Testing: only rehype-slug enabled

// Static components - created once
// Handles both markdown elements and raw HTML from rehype-raw
const markdownComponents: Components = {
    // Raw HTML element handlers (for rehype-raw)
    div: ({ children, style, ...props }) => (
        <div className="max-w-full overflow-hidden" style={{ ...style, maxWidth: '100%' }} {...props}>
            {children}
        </div>
    ),
    img: ({ src, alt, width, height }) => (
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
    iframe: ({ ...props }) => (
        <div className="max-w-full overflow-hidden">
            <iframe className="max-w-full" {...props} />
        </div>
    ),
    video: ({ ...props }) => (
        <video className="max-w-full h-auto" {...props} />
    ),
    // Standard markdown elements
    a: ({ ...props }) => (
        <a
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-blue hover:underline cursor-pointer"
            {...props}
        />
    ),
    code: ({ className, children, ...props }) => {
        const match = /language-(\w+)/.exec(className || "");
        const isInline = !match;
        return isInline ? (
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                {children}
            </code>
        ) : (
            <div className="relative my-4 rounded-lg bg-zinc-950 p-4 overflow-x-auto max-w-full">
                <code className={cn("text-xs font-mono text-zinc-50 block whitespace-pre-wrap break-all", className)} {...props}>
                    {children}
                </code>
            </div>
        );
    },
    pre: ({ children }) => <div className="max-w-full overflow-x-auto">{children}</div>,
    ul: ({ children }) => <ul className="list-disc pl-4 my-2 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-4 my-2 space-y-1">{children}</ol>,
    li: ({ children }) => <li className="my-0.5">{children}</li>,
    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
    h1: ({ children }) => <h1 className="text-lg font-bold mt-4 mb-2">{children}</h1>,
    h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
    blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-border pl-4 italic text-muted-foreground my-2">
            {children}
        </blockquote>
    ),
    table: ({ children }) => (
        <div className="my-4 w-full overflow-x-auto">
            <table className="w-full text-sm border-collapse">
                {children}
            </table>
        </div>
    ),
    thead: ({ children }) => (
        <thead className="bg-muted">
            {children}
        </thead>
    ),
    tbody: ({ children }) => (
        <tbody className="divide-y divide-border">
            {children}
        </tbody>
    ),
    tr: ({ children }) => (
        <tr className="hover:bg-muted/50 transition-colors">
            {children}
        </tr>
    ),
    th: ({ children }) => (
        <th className="border border-border bg-muted px-3 py-2 text-left font-semibold text-xs">
            {children}
        </th>
    ),
    td: ({ children }) => (
        <td className="border border-border px-3 py-2 text-left text-xs font-mono tabular-nums">
            {children}
        </td>
    ),
};

interface MarkdownProps {
    children: string;
    className?: string;
}

export const Markdown = memo(function Markdown({ children, className }: MarkdownProps) {
    const content = useMemo(
        () => (
            <ReactMarkdown
                remarkPlugins={remarkPlugins}
                rehypePlugins={rehypePlugins}
                components={markdownComponents}
            >
                {children}
            </ReactMarkdown>
        ),
        [children]
    );

    return (
        <div className={cn("break-words", className)}>
            {content}
        </div>
    );
});
