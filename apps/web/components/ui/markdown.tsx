import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import { cn } from "@/lib/utils";
import type { Components } from "react-markdown";
// Note: KaTeX CSS is imported via globals.css with layer() for proper scoping

// Static plugin arrays - created once
const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeRaw, rehypeKatex, rehypeSlug];

// Static components - created once
const markdownComponents: Components = {
    a: ({ ...props }) => (
        <a
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-blue hover:underline cursor-pointer"
            {...props}
        />
    ),
    img: ({ src, alt, width, height }) => (
        <img
            src={src}
            alt={alt || ''}
            width={width}
            height={height}
            className="max-w-full h-auto"
            loading="lazy"
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
            <div className="relative my-4 rounded-lg bg-zinc-950 p-4 overflow-x-auto">
                <code className={cn("text-xs font-mono text-zinc-50 block", className)} {...props}>
                    {children}
                </code>
            </div>
        );
    },
    pre: ({ children }) => <>{children}</>,
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
