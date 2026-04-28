"use client";

import Link from "next/link";
import { FileText, BookmarkPlus, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PublicationRowItem {
  id: string;
  title: string;
  authors: string[];
  rating: number | null;
  status: string | null;
  researchTopic: string | null;
  pdfUrl: string | null;
  instance: {
    name: string;
    year: number;
    venue: { name: string };
  };
  publishedAt?: string | null;
}

function statusTone(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  if (s.includes("oral")) return "bg-sf-success-soft text-sf-success";
  if (s.includes("spot")) return "bg-sf-accent-soft text-sf-accent-ink";
  if (s.includes("poster")) return "bg-[#EDEEF2] text-sf-ink-3";
  if (s.includes("workshop")) return "bg-sf-warn-soft text-sf-warn";
  if (s.includes("reject") || s.includes("withdraw")) return "bg-sf-danger-soft text-sf-danger";
  return "bg-[#EDEEF2] text-sf-ink-3";
}

export function PublicationRow({ locale, pub }: { locale: string; pub: PublicationRowItem }) {
  const venueTag = `${pub.instance.venue.name} ${pub.instance.year}`;
  const authorsPreview = pub.authors.slice(0, 3);
  const extraAuthors = pub.authors.length - authorsPreview.length;

  return (
    <article className="bg-sf-surface border border-sf-line p-6 rounded-[10px] flex flex-col md:flex-row gap-6 transition-all hover:border-sf-line-strong hover:shadow-[0_12px_32px_-16px_rgba(16,24,40,0.14)]">
      {/* Left — main content */}
      <div className="flex-grow space-y-3 min-w-0">
        {/* Meta row */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold text-sf-accent uppercase tracking-[0.16em]">
            {venueTag}
          </span>
          {pub.status && (
            <span
              className={cn(
                "px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] rounded-[3px]",
                statusTone(pub.status),
              )}
            >
              {pub.status}
            </span>
          )}
          {pub.researchTopic && (
            <span className="px-2 py-0.5 bg-[#EDEEF2] text-sf-ink-3 text-[10px] font-bold uppercase tracking-[0.14em] rounded-[3px]">
              {pub.researchTopic}
            </span>
          )}
          {pub.publishedAt && (
            <span className="text-xs text-sf-ink-4 font-mono tabular-nums">
              Published {pub.publishedAt}
            </span>
          )}
        </div>

        {/* Title */}
        <h2 className="text-[18px] md:text-[19px] font-bold text-sf-ink leading-snug">
          <Link
            href={`/${locale}/explore/conferences/publications/${pub.id}`}
            className="hover:text-sf-accent transition-colors"
          >
            {pub.title}
          </Link>
        </h2>

        {/* Authors */}
        {pub.authors.length > 0 && (
          <p className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-sf-ink-3">
            {authorsPreview.map((a, i) => (
              <span key={a + i}>
                {a}
                {i < authorsPreview.length - 1 || extraAuthors > 0 ? "," : ""}
              </span>
            ))}
            {extraAuthors > 0 && (
              <span className="italic text-sf-ink-4">+{extraAuthors} others</span>
            )}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {pub.pdfUrl && (
            <a
              href={pub.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sf-ink-2 bg-sf-bg-alt px-3 py-1.5 hover:bg-sf-line rounded-[6px] transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              View PDF
            </a>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sf-ink-2 bg-sf-bg-alt px-3 py-1.5 hover:bg-sf-line rounded-[6px] transition-colors"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            Add to Notebook
          </button>
        </div>
      </div>

      {/* Right — impact + tools */}
      <div className="flex flex-row md:flex-col items-end justify-between md:min-w-[120px] shrink-0">
        {pub.rating != null ? (
          <div className="text-right">
            <div className="text-[30px] md:text-[32px] font-black text-sf-accent leading-none tabular-nums">
              {pub.rating.toFixed(1)}
            </div>
            <div className="text-[10px] font-bold text-sf-ink-4 uppercase tracking-[0.14em] mt-1.5">
              Impact Score
            </div>
          </div>
        ) : (
          <div className="text-right">
            <div className="text-[16px] font-mono tabular-nums text-sf-ink-4">
              {pub.instance.year}
            </div>
            <div className="text-[10px] font-bold text-sf-ink-4 uppercase tracking-[0.14em] mt-1.5">
              Year
            </div>
          </div>
        )}
        <div className="flex gap-2 text-sf-ink-4">
          <button
            type="button"
            aria-label="Share"
            className="p-1 hover:text-sf-accent transition-colors"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Bookmark"
            className="p-1 hover:text-sf-danger transition-colors"
          >
            <BookmarkPlus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}
