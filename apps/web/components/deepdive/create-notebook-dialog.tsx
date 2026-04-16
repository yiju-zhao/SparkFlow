"use client";

import { useState, useTransition, useEffect } from "react";
import { Plus, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createNotebook } from "@/lib/actions/notebooks";
import Link from "next/link";

export function CreateNotebookDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null); // null = loading

  // Check if user has an API key for their active provider
  useEffect(() => {
    if (!open) return;
    const checkKey = async () => {
      try {
        const settingsRes = await fetch("/api/settings");
        if (!settingsRes.ok) return;
        const settings = await settingsRes.json();
        const provider = settings.modelProvider || "openai";
        const keyRes = await fetch(`/api/settings/resolve-key?provider=${provider}`);
        setHasApiKey(keyRes.ok);
      } catch {
        setHasApiKey(false);
      }
    };
    queueMicrotask(() => setHasApiKey(null));
    checkKey();
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    startTransition(async () => {
      await createNotebook(name.trim(), description.trim() || undefined);
      setName("");
      setDescription("");
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-accent-red hover:bg-accent-red-hover">
          <Plus className="h-4 w-4" />
          New Notebook
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Notebook</DialogTitle>
        </DialogHeader>

        {hasApiKey === false ? (
          /* No API key — prompt to configure */
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 p-6 text-center">
              <Key className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-medium">API Key Required</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Notebooks need an LLM API key for wiki generation and chat. Set your API key
                  first.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Link href="/settings">
                <Button className="bg-accent-red hover:bg-accent-red-hover">Go to Settings</Button>
              </Link>
            </div>
          </div>
        ) : (
          /* Has key or still loading — show form */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="mb-2 block text-sm font-medium">
                Name
              </label>
              <Input
                id="name"
                placeholder="My Research Notebook"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div>
              <label htmlFor="description" className="mb-2 block text-sm font-medium">
                Description (optional)
              </label>
              <Textarea
                id="description"
                placeholder="A brief description of this notebook..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isPending}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-accent-red hover:bg-accent-red-hover"
                disabled={isPending || !name.trim() || hasApiKey === null}
              >
                {hasApiKey === null ? "Checking..." : isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
