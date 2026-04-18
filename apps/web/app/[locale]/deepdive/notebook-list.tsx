"use client";

import Link from "next/link";
import { Book, MoreVertical, Plus, Trash2 } from "lucide-react";
import { useRelativeTime } from "@/lib/hooks/use-relative-time";
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

function RelativeTime({ date }: { date: Date }) {
  const timeString = useRelativeTime(date);
  return <span suppressHydrationWarning>{timeString}</span>;
}

type Notebook = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    sources: number;
    notes: number;
  };
};

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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {notebooks.map((notebook) => (
        <NotebookCard key={notebook.id} notebook={notebook} />
      ))}
      <CreateNotebookTile />
    </div>
  );
}

function CreateNotebookTile() {
  return (
    <div className="sf-card border-dashed flex items-center justify-center min-h-[200px] text-center transition-colors hover:border-sf-accent hover:bg-sf-accent-soft/30">
      <CreateNotebookDialog
        trigger={
          <button
            type="button"
            className="flex flex-col items-center gap-3 text-sf-ink-3 hover:text-sf-accent transition-colors"
          >
            <span className="sf-icon-tile">
              <Plus className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <span className="text-sm font-semibold">Create new notebook</span>
          </button>
        }
      />
    </div>
  );
}

function NotebookCard({ notebook }: { notebook: Notebook }) {
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = () => {
    setIsDeleting(true);
    startTransition(async () => {
      await deleteNotebook(notebook.id);
    });
  };

  return (
    <div
      className={`group sf-card card-hoverable relative flex flex-col min-h-[200px] p-5 ${
        isDeleting ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
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

      <Link href={`/deepdive/${notebook.id}`} className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between">
          <span className="sf-icon-tile">
            <Book className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="sf-badge sf-badge-soft">RESEARCH</span>
        </div>

        <h3 className="mt-1 font-semibold text-[16px] text-sf-ink group-hover:text-sf-accent transition-colors">
          {notebook.name}
        </h3>

        {notebook.description && (
          <p className="text-sm text-sf-ink-3 line-clamp-2 leading-relaxed">
            {notebook.description}
          </p>
        )}

        <div className="mt-auto flex items-center gap-4 text-xs text-sf-ink-3">
          <span className="flex items-center gap-1.5">
            <span className="font-mono tabular-nums font-semibold text-sf-ink">
              {notebook._count.sources}
            </span>
            sources
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-mono tabular-nums font-semibold text-sf-ink">
              {notebook._count.notes}
            </span>
            notes
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-sf-line pt-3 text-[11px] text-sf-ink-4">
          <span className="font-mono tabular-nums">
            Updated <RelativeTime date={new Date(notebook.updatedAt)} />
          </span>
        </div>
      </Link>
    </div>
  );
}
