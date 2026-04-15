"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookPlus, Loader2, Plus } from "lucide-react";

interface Notebook {
  id: string;
  name: string;
}

interface AddToNotebookDialogProps {
  article: {
    title: string;
    originalUrl: string;
    contentText: string;
    contentHtml?: string;
  };
}

export function AddToNotebookDialog({ article }: AddToNotebookDialogProps) {
  const [open, setOpen] = useState(false);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("explore.socialMedia.wechat");

  const fetchNotebooks = async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/notebooks");
      if (res.ok) setNotebooks(await res.json());
    } catch (e) {
      console.error("Failed to fetch notebooks:", e);
    } finally {
      setFetching(false);
    }
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setShowCreate(false);
      setNewName("");
      fetchNotebooks();
    }
  };

  const addSource = async (notebookId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: article.title,
          sourceType: "WEBPAGE",
          url: article.originalUrl,
          content: article.contentText,
          contentHtml: article.contentHtml,
        }),
      });
      if (res.ok) {
        setOpen(false);
        router.push(`/${locale}/deepdive/${notebookId}`);
      }
    } catch (e) {
      console.error("Failed to add source:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        const notebook = await res.json();
        await addSource(notebook.id);
      }
    } catch (e) {
      console.error("Failed to create notebook:", e);
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BookPlus className="h-4 w-4 mr-2" />
          {t("addToNotebook")}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addToNotebook")}</DialogTitle>
        </DialogHeader>

        {fetching ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : showCreate ? (
          <div className="space-y-3 mt-2">
            <Input
              placeholder="Notebook name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateAndAdd()}
              disabled={loading}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreate(false)}
                disabled={loading}
              >
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleCreateAndAdd}
                disabled={loading || !newName.trim()}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create & Add
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {notebooks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No notebooks yet.
              </p>
            ) : (
              notebooks.map((nb) => (
                <Button
                  key={nb.id}
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => addSource(nb.id)}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {nb.name}
                </Button>
              ))
            )}
            <Button
              variant="secondary"
              className="w-full mt-2"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Notebook
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
