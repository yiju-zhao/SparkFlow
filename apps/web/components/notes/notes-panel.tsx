"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

interface NotesPanelProps {
  notebookId: string;
  notes: Note[];
}

export function NotesPanel({ notebookId, notes }: NotesPanelProps) {
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      {selectedNote ? (
        <NoteViewer
          note={selectedNote}
          isEditing={isEditing}
          onBack={() => {
            setSelectedNote(null);
            setIsEditing(false);
          }}
          onEdit={() => setIsEditing(true)}
          onSaveEdit={() => setIsEditing(false)}
        />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <h2 className="text-sm font-medium">Notes</h2>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          </div>

          {/* Notes List */}
          <div className="flex-1 overflow-y-auto p-2">
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
                    onSelect={() => setSelectedNote(note)}
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
}

function NoteCard({ note, onSelect }: NoteCardProps) {
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
      className={`group cursor-pointer rounded-lg border p-3 transition-all ${isPending ? "opacity-50" : ""
        } border-border hover:border-accent-red/50 hover:bg-accent`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {note.isPinned && (
              <Pin className="h-3 w-3 shrink-0 text-accent-red" />
            )}
            <h3 className="truncate text-sm font-medium">{note.title}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {note.content}
          </p>
        </div>
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleTogglePin}>
                <Pin className="mr-2 h-3.5 w-3.5" />
                {note.isPinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleDelete}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
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

      <div className="mt-2 text-[10px] text-muted-foreground">
        {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
      </div>
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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
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
              className="min-h-[300px] resize-none font-mono text-sm"
            />
          </div>
        ) : (
          <div>
            <div className="mb-4 flex items-center gap-2">
              {note.isPinned && <Pin className="h-4 w-4 text-accent-red" />}
              <h2 className="text-lg font-medium">{note.title}</h2>
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
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {note.content}
              </ReactMarkdown>
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
            <label
              htmlFor="title"
              className="mb-2 block text-sm font-medium"
            >
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
            <label
              htmlFor="content"
              className="mb-2 block text-sm font-medium"
            >
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
