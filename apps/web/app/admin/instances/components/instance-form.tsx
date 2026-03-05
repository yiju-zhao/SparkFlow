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
import { createInstance, updateInstance } from "@/lib/actions/admin";

interface Venue {
  id: string;
  name: string;
}

interface InstanceFormProps {
  instance?: {
    id: string;
    venueId: string;
    year: number;
    name: string;
    startDate: Date | null;
    endDate: Date | null;
    location: string | null;
    website: string | null;
    summary: string | null;
  };
  venues: Venue[];
  trigger: React.ReactNode;
}

function toDateInput(date: Date | null | undefined): string {
  if (!date) return "";
  return date instanceof Date
    ? date.toISOString().split("T")[0]
    : new Date(date).toISOString().split("T")[0];
}

export function InstanceForm({ instance, venues, trigger }: InstanceFormProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [venueId, setVenueId] = useState(instance?.venueId ?? "");
  const [year, setYear] = useState(
    instance?.year ? String(instance.year) : String(new Date().getFullYear()),
  );
  const [name, setName] = useState(instance?.name ?? "");
  const [startDate, setStartDate] = useState(toDateInput(instance?.startDate));
  const [endDate, setEndDate] = useState(toDateInput(instance?.endDate));
  const [location, setLocation] = useState(instance?.location ?? "");
  const [website, setWebsite] = useState(instance?.website ?? "");
  const [summary, setSummary] = useState(instance?.summary ?? "");

  function reset() {
    setVenueId(instance?.venueId ?? "");
    setYear(
      instance?.year ? String(instance.year) : String(new Date().getFullYear()),
    );
    setName(instance?.name ?? "");
    setStartDate(toDateInput(instance?.startDate));
    setEndDate(toDateInput(instance?.endDate));
    setLocation(instance?.location ?? "");
    setWebsite(instance?.website ?? "");
    setSummary(instance?.summary ?? "");
  }

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!venueId || !name.trim() || !year) return;

    startTransition(async () => {
      const data = {
        venueId,
        year: Number(year),
        name: name.trim(),
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        location: location.trim() || undefined,
        website: website.trim() || undefined,
        summary: summary.trim() || undefined,
      };

      if (instance) {
        await updateInstance(instance.id, data);
      } else {
        await createInstance(data);
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {instance ? "Edit Instance" : "New Instance"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="venueId">Venue *</Label>
            <select
              id="venueId"
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              required
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select venue...</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="year">Year *</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                required
                min={1990}
                max={2100}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. NeurIPS 2024"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Vancouver, Canada"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="summary">Summary</Label>
            <Textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief summary of the conference instance"
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
            <Button
              type="submit"
              disabled={isPending || !venueId || !name.trim() || !year}
            >
              {isPending
                ? "Saving..."
                : instance
                  ? "Save Changes"
                  : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
