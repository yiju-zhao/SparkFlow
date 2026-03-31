"use client";

import { useState, useTransition } from "react";
import { Markdown } from "@/components/ui/markdown";
import { useRelativeTime } from "@/lib/hooks/use-relative-time";
import {
  Plus,
  StickyNote,
  Pin,
  MoreVertical,
  Trash2,
  Pencil,
  X,
  Save,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Component wrapper for relative time
function RelativeTime({ date }: { date: Date }) {
  const timeString = useRelativeTime(date);
  return (
    <div
      className="mt-2 text-[10px] text-muted-foreground"
      suppressHydrationWarning
    >
      {timeString}
    </div>
  );
}
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createNote,
  updateNote,
  deleteNote,
  togglePinNote,
} from "@/lib/actions/notes";
import type { Note } from "@prisma/client";

export interface StudioPanelProps {
  notebookId: string;
  notes: Note[];
  selectedNote: Note | null;
  onSelectNote: (note: Note | null) => void;
}

export function StudioPanel({
  notebookId,
  notes,
  selectedNote,
  onSelectNote,
}: StudioPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {selectedNote ? (
        <NoteViewer
          note={selectedNote}
          isEditing={isEditing}
          onBack={() => {
            onSelectNote(null);
            setIsEditing(false);
          }}
          onEdit={() => setIsEditing(true)}
          onSaveEdit={() => setIsEditing(false)}
        />
      ) : (
        <>
          {/* Header */}
          <div className="px-6 pt-3 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-0.5 w-6 bg-accent-primary dark:bg-accent-red" />
              <h2 className="text-[11px] font-semibold tracking-[3px] text-foreground uppercase font-mono">
                STUDIO
              </h2>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 rounded-[4px] hover:bg-accent/80 transition-colors"
              onClick={() => setIsCreateDialogOpen(true)}
              title="New Note"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Notes List */}
          <div className="flex-1 overflow-y-auto px-6 pt-2 pb-6">
            {notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <StickyNote className="h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No notes yet
                </p>
                <p className="text-xs text-muted-foreground">
                  Save insights from your research
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {notes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onSelect={() => onSelectNote(note)}
                    selected={false}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Create Note Dialog */}
          <CreateNoteDialog
            notebookId={notebookId}
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
          />
        </>
      )}
    </div>
  );
}

interface NoteCardProps {
  note: Note;
  onSelect: () => void;
  selected: boolean;
}

function NoteCard({ note, onSelect, selected }: NoteCardProps) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      await deleteNote(note.id);
    });
  };

  const handleTogglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      await togglePinNote(note.id);
    });
  };

  return (
    <div
      onClick={onSelect}
      className={`group relative cursor-pointer rounded-[4px] bg-surface-elevated p-3 transition-all duration-200 border-2 border-divider border-l-4 border-l-divider dark:border-0 dark:border-l-4 dark:border-l-divider ${isPending ? "opacity-50" : ""
        } hover:bg-surface-hover`}
    >

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {note.isPinned && (
              <Pin className="h-3 w-3 shrink-0 text-accent-red" />
            )}
            <h3 className="line-clamp-1 text-[13px] font-medium leading-tight">{note.title}</h3>
          </div>
          <div className="mt-1 h-[28px] overflow-hidden text-[12px] text-muted-foreground/70">
            <Markdown className="text-[12px] [&_p]:mb-0 [&_p]:leading-tight">
              {note.content}
            </Markdown>
          </div>
        </div>
        <div className="absolute top-1/2 -translate-y-1/2 right-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild suppressHydrationWarning>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full bg-background/90 border border-border/40 shadow-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={handleTogglePin} className="cursor-pointer">
                <Pin className="mr-2 h-4 w-4" />
                {note.isPinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                onClick={handleDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tags */}
      {note.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {note.tags.slice(0, 3).map((tag, index) => (
            <Badge
              key={index}
              variant="secondary"
              className="h-4 px-1.5 text-[10px]"
            >
              {tag}
            </Badge>
          ))}
          {note.tags.length > 3 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              +{note.tags.length - 3}
            </Badge>
          )}
        </div>
      )}

      <RelativeTime date={new Date(note.updatedAt)} />
    </div>
  );
}

interface NoteViewerProps {
  note: Note;
  isEditing: boolean;
  onBack: () => void;
  onEdit: () => void;
  onSaveEdit: () => void;
}

function NoteViewer({
  note,
  isEditing,
  onBack,
  onEdit,
  onSaveEdit,
}: NoteViewerProps) {
  const [isPending, startTransition] = useTransition();
  const [editTitle, setEditTitle] = useState(note.title);
  const [editContent, setEditContent] = useState(note.content);

  const handleSave = () => {
    startTransition(async () => {
      await updateNote(note.id, {
        title: editTitle,
        content: editContent,
      });
      onSaveEdit();
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-divider px-4 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={onBack}
                disabled={isPending}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 bg-accent-red text-xs hover:bg-accent-red-hover"
                onClick={handleSave}
                disabled={isPending}
              >
                <Save className="mr-1 h-3.5 w-3.5" />
                {isPending ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onEdit}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isEditing ? (
          <div className="space-y-4">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Note title"
              className="text-lg font-medium"
            />
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Write your note in markdown..."
              className="min-h-75 resize-none font-mono text-sm"
            />
          </div>
        ) : (
          <div>
            <div className="mb-4 flex items-center gap-2">
              {note.isPinned && <Pin className="h-4 w-4 text-accent-red" />}
              <h2 className="truncate text-sm font-medium" title={note.title}>
                {note.title}
              </h2>
            </div>
            {note.tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1">
                {note.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex-1">
              <Markdown className="space-y-3 text-[14px] leading-5 text-muted-foreground">
                {note.content}
              </Markdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface CreateNoteDialogProps {
  notebookId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CreateNoteDialog({
  notebookId,
  open,
  onOpenChange,
}: CreateNoteDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    startTransition(async () => {
      await createNote(notebookId, {
        title: title.trim(),
        content: content.trim(),
      });
      setTitle("");
      setContent("");
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Note</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className="mb-2 block text-sm font-medium">
              Title
            </label>
            <Input
              id="title"
              placeholder="Note title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div>
            <label htmlFor="content" className="mb-2 block text-sm font-medium">
              Content
            </label>
            <Textarea
              id="content"
              placeholder="Write your note in markdown..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={isPending}
              rows={8}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-accent-red hover:bg-accent-red-hover"
              disabled={isPending || !title.trim()}
            >
              {isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
