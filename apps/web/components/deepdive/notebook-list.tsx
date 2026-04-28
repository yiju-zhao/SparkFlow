"use client";

import Link from "next/link";
import {
  Book,
  BookMarked,
  Brain,
  FileText,
  Leaf,
  MoreVertical,
  Plus,
  StickyNote,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteNotebook } from "@/lib/actions/notebooks";
import { useState, useTransition } from "react";
import { CreateNotebookDialog } from "@/components/deepdive/create-notebook-dialog";
import { useRelativeTime } from "@/lib/hooks/use-relative-time";

function RelativeTime({ date }: { date: Date }) {
  const timeString = useRelativeTime(date);
  return <span suppressHydrationWarning>{timeString}</span>;
}

type Notebook = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: Date;
  _count: {
    sources: number;
    notes: number;
  };
};

// Deterministic icon tile palette — each notebook gets a stable tint
// based on its id so the library reads with rhythm.
const TILE_PALETTE = [
  { icon: FileText, bg: "bg-sf-accent-soft", fg: "text-sf-accent" },
  { icon: Brain, bg: "bg-[#F1ECFF]", fg: "text-[#6D4AFF]" },
  { icon: Leaf, bg: "bg-sf-success-soft", fg: "text-sf-success" },
  { icon: BookMarked, bg: "bg-sf-warn-soft", fg: "text-sf-warn" },
] as const;

function tileFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return TILE_PALETTE[Math.abs(h) % TILE_PALETTE.length];
}

export function NotebookList({ notebooks }: { notebooks: Notebook[] }) {
  if (notebooks.length === 0) {
    return (
      <div className="sf-card border-dashed flex flex-col items-center gap-4 py-16 text-center">
        <span className="sf-icon-tile h-12 w-12">
          <Book className="h-5 w-5" strokeWidth={1.5} />
        </span>
        <div>
          <h3 className="sf-h3">No notebooks yet</h3>
          <p className="sf-meta mt-1.5">Create your first notebook to get started.</p>
        </div>
        <CreateNotebookDialog />
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {notebooks.map((notebook) => (
        <NotebookCard key={notebook.id} notebook={notebook} />
      ))}
      <CreateNotebookTile />
    </div>
  );
}

function CreateNotebookTile() {
  return (
    <div className="border-2 border-dashed border-sf-line p-5 flex flex-col items-center justify-center text-center transition-all cursor-pointer min-h-[200px] rounded-[10px] hover:border-sf-accent hover:bg-sf-accent-soft/30">
      <CreateNotebookDialog
        trigger={
          <button
            type="button"
            className="flex flex-col items-center gap-3 text-sf-ink-3 hover:text-sf-accent transition-colors w-full"
          >
            <span className="h-12 w-12 rounded-full bg-sf-bg-alt flex items-center justify-center">
              <Plus className="h-5 w-5 text-sf-ink-4" strokeWidth={1.75} />
            </span>
            <span className="text-sm font-semibold text-sf-ink">Create New Project</span>
            <span className="text-xs text-sf-ink-4">Starting a new research path?</span>
          </button>
        }
      />
    </div>
  );
}

function NotebookCard({ notebook }: { notebook: Notebook }) {
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  const tile = tileFor(notebook.id);
  const TileIcon = tile.icon;

  const handleDelete = () => {
    setIsDeleting(true);
    startTransition(async () => {
      await deleteNotebook(notebook.id);
    });
  };

  return (
    <div
      className={`group relative bg-sf-surface border border-sf-line p-5 flex flex-col cursor-pointer min-h-[200px] rounded-[10px] transition-all hover:border-sf-accent/40 hover:shadow-[0_20px_40px_-20px_rgba(15,95,254,0.18)] ${
        isDeleting ? "pointer-events-none opacity-50" : ""
      }`}
    >
      {/* Hover action menu */}
      <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-sf-ink-4 hover:text-sf-ink-2"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-sf-danger focus:text-sf-danger"
              onClick={handleDelete}
              disabled={isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Link href={`/deepdive/${notebook.id}`} className="flex h-full flex-col">
        {/* Icon tile */}
        <span className={`p-2 ${tile.bg} ${tile.fg} rounded-[4px] mb-4 w-fit`}>
          <TileIcon className="h-5 w-5" strokeWidth={1.75} />
        </span>

        {/* Title */}
        <h3 className="text-lg font-bold text-sf-ink mb-2 group-hover:text-sf-accent transition-colors">
          {notebook.name}
        </h3>

        {/* Description */}
        {notebook.description && (
          <p className="text-sm text-sf-ink-3 line-clamp-2 mb-5">{notebook.description}</p>
        )}

        {/* Stats row + updated time */}
        <div className="mt-auto flex flex-col gap-2.5">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-sf-ink-2 tabular-nums">
              <Book className="h-4 w-4 text-sf-ink-3 shrink-0" strokeWidth={1.75} aria-hidden />
              {notebook._count.sources}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-sf-ink-2 tabular-nums">
              <StickyNote
                className="h-4 w-4 text-sf-ink-3 shrink-0"
                strokeWidth={1.75}
                aria-hidden
              />
              {notebook._count.notes}
            </span>
          </div>
          <p className="text-[11px] font-medium text-sf-ink-4">
            Updated <RelativeTime date={new Date(notebook.updatedAt)} />
          </p>
        </div>
      </Link>
    </div>
  );
}
