"use client";

import Link from "next/link";
import { Book, MoreVertical, Trash2 } from "lucide-react";
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
      <div className="rounded-lg border border-dashed border-border bg-background p-12 text-center">
        <Book className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-medium">No notebooks yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first notebook to get started
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {notebooks.map((notebook) => (
        <NotebookCard key={notebook.id} notebook={notebook} />
      ))}
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
      className={`group relative flex flex-col rounded-lg border border-border bg-card p-5 transition-all hover:bg-muted/30 ${
        isDeleting ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Link href={`/deepdive/${notebook.id}`} className="flex flex-col h-full">
        <div className="mb-4">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary">
            <Book className="h-4 w-4" />
          </div>
        </div>

        <h3 className="font-semibold text-base mb-1 group-hover:text-primary transition-colors">
          {notebook.name}
        </h3>

        {notebook.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{notebook.description}</p>
        )}

        <div className="mt-auto flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
            {notebook._count.sources} sources
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
            {notebook._count.notes} notes
          </span>
        </div>

        <div className="mt-4 pt-4 border-t border-border/50 text-[10px] font-mono text-muted-foreground">
          <RelativeTime date={new Date(notebook.updatedAt)} />
        </div>
      </Link>
    </div>
  );
}
