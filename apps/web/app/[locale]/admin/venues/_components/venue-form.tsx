"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createVenue, updateVenue } from "@/lib/actions/admin";

interface VenueFormProps {
  venue?: {
    id: string;
    name: string;
    type: string | null;
    description: string | null;
  };
  trigger: React.ReactNode;
}

export function VenueForm({ venue, trigger }: VenueFormProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(venue?.name ?? "");
  const [type, setType] = useState(venue?.type ?? "");
  const [description, setDescription] = useState(venue?.description ?? "");

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) {
      setName(venue?.name ?? "");
      setType(venue?.type ?? "");
      setDescription(venue?.description ?? "");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    startTransition(async () => {
      const data = {
        name: name.trim(),
        type: type.trim() || undefined,
        description: description.trim() || undefined,
      };

      if (venue) {
        await updateVenue(venue.id, data);
      } else {
        await createVenue(data);
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{venue ? "Edit Venue" : "New Venue"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. NeurIPS"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="type">Type</Label>
            <Input
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="e.g. Conference, Workshop"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the venue"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? "Saving..." : venue ? "Save Changes" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
