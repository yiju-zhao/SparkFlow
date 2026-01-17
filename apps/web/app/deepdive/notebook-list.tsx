"use client";

import Link from "next/link";
import { Book, FileText, MoreVertical, Trash2 } from "lucide-react";
import { useRelativeTime } from "@/lib/hooks/use-relative-time";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

  if (!timeString) {
    return <Skeleton className="h-3 w-20" />;
  }

  return <>{timeString}</>;
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
      className={`group relative rounded-lg border border-border bg-background p-5 shadow-huawei-subtle transition-all hover:shadow-huawei-sm ${
        isDeleting ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
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

      <Link href={`/deepdive/${notebook.id}`} className="block">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-red/10">
          <Book className="h-5 w-5 text-accent-red" />
        </div>

        <h3 className="font-medium line-clamp-1">{notebook.name}</h3>

        {notebook.description && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {notebook.description}
          </p>
        )}

        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            {notebook._count.sources} sources
          </span>
          <span className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            {notebook._count.notes} notes
          </span>
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          {/* Hydration-safe relative time */}
          <RelativeTime date={new Date(notebook.updatedAt)} />
        </div>
      </Link>
    </div>
  );
}
