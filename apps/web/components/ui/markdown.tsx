import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { Components } from "react-markdown";

interface MarkdownProps {
    children: string;
    className?: string;
}

export function Markdown({ children, className }: MarkdownProps) {
    const components: Components = {
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
            <div className="my-4 w-full overflow-y-auto">
                <table className="w-full text-sm">
                    {children}
                </table>
            </div>
        ),
        th: ({ children }) => (
            <th className="border border-border bg-muted px-4 py-2 text-left font-bold">
                {children}
            </th>
        ),
        td: ({ children }) => (
            <td className="border border-border px-4 py-2 text-left">
                {children}
            </td>
        ),
    };

    return (
        <div className={cn("max-w-none break-words", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={components}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}
