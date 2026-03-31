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
import { createSession, updateSession } from "@/lib/actions/admin";

interface Instance {
  id: string;
  name: string;
  year: number;
  venue: { name: string };
}

interface SessionFormProps {
  session?: {
    id: string;
    instanceId: string;
    title: string;
    type: string | null;
    date: Date | null;
    startTime: string | null;
    endTime: string | null;
    location: string | null;
    speaker: string[];
    abstract: string | null;
    overview: string | null;
    transcript: string | null;
    sessionUrl: string | null;
    topic: string[];
    affiliation: string[];
    technology: string[];
  };
  instances: Instance[];
  trigger: React.ReactNode;
}

function toDateInput(date: Date | null | undefined): string {
  if (!date) return "";
  return date instanceof Date
    ? date.toISOString().split("T")[0]
    : new Date(date).toISOString().split("T")[0];
}

function arrToStr(arr: string[]): string {
  return arr.join(", ");
}

function strToArr(str: string): string[] {
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function SessionForm({ session, instances, trigger }: SessionFormProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [instanceId, setInstanceId] = useState(session?.instanceId ?? "");
  const [title, setTitle] = useState(session?.title ?? "");
  const [type, setType] = useState(session?.type ?? "");
  const [date, setDate] = useState(toDateInput(session?.date));
  const [startTime, setStartTime] = useState(session?.startTime ?? "");
  const [endTime, setEndTime] = useState(session?.endTime ?? "");
  const [location, setLocation] = useState(session?.location ?? "");
  const [speakers, setSpeakers] = useState(arrToStr(session?.speaker ?? []));
  const [abstract, setAbstract] = useState(session?.abstract ?? "");
  const [overview, setOverview] = useState(session?.overview ?? "");
  const [transcript, setTranscript] = useState(session?.transcript ?? "");
  const [sessionUrl, setSessionUrl] = useState(session?.sessionUrl ?? "");
  const [topics, setTopics] = useState(arrToStr(session?.topic ?? []));
  const [affiliations, setAffiliations] = useState(
    arrToStr(session?.affiliation ?? []),
  );
  const [technologies, setTechnologies] = useState(
    arrToStr(session?.technology ?? []),
  );

  function reset() {
    setInstanceId(session?.instanceId ?? "");
    setTitle(session?.title ?? "");
    setType(session?.type ?? "");
    setDate(toDateInput(session?.date));
    setStartTime(session?.startTime ?? "");
    setEndTime(session?.endTime ?? "");
    setLocation(session?.location ?? "");
    setSpeakers(arrToStr(session?.speaker ?? []));
    setAbstract(session?.abstract ?? "");
    setOverview(session?.overview ?? "");
    setTranscript(session?.transcript ?? "");
    setSessionUrl(session?.sessionUrl ?? "");
    setTopics(arrToStr(session?.topic ?? []));
    setAffiliations(arrToStr(session?.affiliation ?? []));
    setTechnologies(arrToStr(session?.technology ?? []));
  }

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!instanceId || !title.trim()) return;

    startTransition(async () => {
      const data = {
        instanceId,
        title: title.trim(),
        type: type.trim() || undefined,
        date: date ? new Date(date) : undefined,
        startTime: startTime.trim() || undefined,
        endTime: endTime.trim() || undefined,
        location: location.trim() || undefined,
        speaker: strToArr(speakers),
        abstract: abstract.trim() || undefined,
        overview: overview.trim() || undefined,
        transcript: transcript.trim() || undefined,
        sessionUrl: sessionUrl.trim() || undefined,
        topic: strToArr(topics),
        affiliation: strToArr(affiliations),
        technology: strToArr(technologies),
      };

      if (session) {
        await updateSession(session.id, data);
      } else {
        await createSession(data);
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {session ? "Edit Session" : "New Session"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="instanceId">Instance *</Label>
            <select
              id="instanceId"
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              required
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select instance...</option>
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.venue.name} {inst.year} — {inst.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Session title"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="type">Type</Label>
              <Input
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="e.g. Talk, Workshop, Panel"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="startTime">Start Time</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endTime">End Time</Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Room / Hall"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="speakers">Speakers (comma-separated)</Label>
            <Input
              id="speakers"
              value={speakers}
              onChange={(e) => setSpeakers(e.target.value)}
              placeholder="John Doe, Jane Smith"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="sessionUrl">Session URL</Label>
            <Input
              id="sessionUrl"
              type="url"
              value={sessionUrl}
              onChange={(e) => setSessionUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="topics">Topics (comma-separated)</Label>
            <Input
              id="topics"
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              placeholder="Machine Learning, NLP"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="affiliations">Affiliations (comma-separated)</Label>
              <Input
                id="affiliations"
                value={affiliations}
                onChange={(e) => setAffiliations(e.target.value)}
                placeholder="MIT, Google"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="technologies">Technologies (comma-separated)</Label>
              <Input
                id="technologies"
                value={technologies}
                onChange={(e) => setTechnologies(e.target.value)}
                placeholder="PyTorch, JAX"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="abstract">Abstract</Label>
            <Textarea
              id="abstract"
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              placeholder="Session abstract"
              rows={3}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="overview">Overview</Label>
            <Textarea
              id="overview"
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              placeholder="Session overview"
              rows={3}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="transcript">Transcript</Label>
            <Textarea
              id="transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Session transcript"
              rows={5}
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
              disabled={isPending || !instanceId || !title.trim()}
            >
              {isPending ? "Saving..." : session ? "Save Changes" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
