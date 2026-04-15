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
import { createPublication, updatePublication } from "@/lib/actions/admin";

interface Instance {
  id: string;
  name: string;
  year: number;
  venue: { name: string };
}

interface PublicationFormProps {
  publication?: {
    id: string;
    instanceId: string;
    title: string;
    authors: string[];
    abstract: string | null;
    summary: string | null;
    affiliations: string[];
    countries: string[];
    keywords: string[];
    researchTopic: string | null;
    rating: number | null;
    status: string | null;
    doi: string | null;
    pdfUrl: string | null;
    githubUrl: string | null;
    websiteUrl: string | null;
  };
  instances: Instance[];
  trigger: React.ReactNode;
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

export function PublicationForm({ publication, instances, trigger }: PublicationFormProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [instanceId, setInstanceId] = useState(publication?.instanceId ?? "");
  const [title, setTitle] = useState(publication?.title ?? "");
  const [authors, setAuthors] = useState(arrToStr(publication?.authors ?? []));
  const [abstract, setAbstract] = useState(publication?.abstract ?? "");
  const [summary, setSummary] = useState(publication?.summary ?? "");
  const [affiliations, setAffiliations] = useState(arrToStr(publication?.affiliations ?? []));
  const [countries, setCountries] = useState(arrToStr(publication?.countries ?? []));
  const [keywords, setKeywords] = useState(arrToStr(publication?.keywords ?? []));
  const [researchTopic, setResearchTopic] = useState(publication?.researchTopic ?? "");
  const [rating, setRating] = useState(
    publication?.rating != null ? String(publication.rating) : "",
  );
  const [status, setStatus] = useState(publication?.status ?? "");
  const [doi, setDoi] = useState(publication?.doi ?? "");
  const [pdfUrl, setPdfUrl] = useState(publication?.pdfUrl ?? "");
  const [githubUrl, setGithubUrl] = useState(publication?.githubUrl ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(publication?.websiteUrl ?? "");

  function reset() {
    setInstanceId(publication?.instanceId ?? "");
    setTitle(publication?.title ?? "");
    setAuthors(arrToStr(publication?.authors ?? []));
    setAbstract(publication?.abstract ?? "");
    setSummary(publication?.summary ?? "");
    setAffiliations(arrToStr(publication?.affiliations ?? []));
    setCountries(arrToStr(publication?.countries ?? []));
    setKeywords(arrToStr(publication?.keywords ?? []));
    setResearchTopic(publication?.researchTopic ?? "");
    setRating(publication?.rating != null ? String(publication.rating) : "");
    setStatus(publication?.status ?? "");
    setDoi(publication?.doi ?? "");
    setPdfUrl(publication?.pdfUrl ?? "");
    setGithubUrl(publication?.githubUrl ?? "");
    setWebsiteUrl(publication?.websiteUrl ?? "");
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
        authors: strToArr(authors),
        abstract: abstract.trim() || undefined,
        summary: summary.trim() || undefined,
        affiliations: strToArr(affiliations),
        countries: strToArr(countries),
        keywords: strToArr(keywords),
        researchTopic: researchTopic.trim() || undefined,
        rating: rating ? parseFloat(rating) : undefined,
        status: status.trim() || undefined,
        doi: doi.trim() || undefined,
        pdfUrl: pdfUrl.trim() || undefined,
        githubUrl: githubUrl.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
      };

      if (publication) {
        await updatePublication(publication.id, data);
      } else {
        await createPublication(data);
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{publication ? "Edit Publication" : "New Publication"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="pub-instanceId">Instance *</Label>
            <select
              id="pub-instanceId"
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
            <Label htmlFor="pub-title">Title *</Label>
            <Input
              id="pub-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Publication title"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="pub-authors">Authors (comma-separated)</Label>
            <Input
              id="pub-authors"
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
              placeholder="Alice Smith, Bob Jones"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pub-status">Status</Label>
              <Input
                id="pub-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="Accepted, Best Paper, Poster..."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pub-rating">Rating</Label>
              <Input
                id="pub-rating"
                type="number"
                step="0.1"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                placeholder="e.g. 4.5"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="pub-researchTopic">Research Topic</Label>
            <Input
              id="pub-researchTopic"
              value={researchTopic}
              onChange={(e) => setResearchTopic(e.target.value)}
              placeholder="e.g. Virtual Reality"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pub-affiliations">Affiliations (comma-separated)</Label>
              <Input
                id="pub-affiliations"
                value={affiliations}
                onChange={(e) => setAffiliations(e.target.value)}
                placeholder="Stanford, MIT"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pub-countries">Countries (comma-separated)</Label>
              <Input
                id="pub-countries"
                value={countries}
                onChange={(e) => setCountries(e.target.value)}
                placeholder="USA, UK"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="pub-keywords">Keywords (comma-separated)</Label>
            <Input
              id="pub-keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="HCI, VR, user behavior"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="pub-abstract">Abstract</Label>
            <Textarea
              id="pub-abstract"
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              placeholder="Publication abstract"
              rows={3}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="pub-summary">Summary</Label>
            <Textarea
              id="pub-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Publication summary"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pub-doi">DOI</Label>
              <Input
                id="pub-doi"
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                placeholder="10.1145/..."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pub-pdfUrl">PDF URL</Label>
              <Input
                id="pub-pdfUrl"
                type="url"
                value={pdfUrl}
                onChange={(e) => setPdfUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pub-githubUrl">GitHub URL</Label>
              <Input
                id="pub-githubUrl"
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/..."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pub-websiteUrl">Website URL</Label>
              <Input
                id="pub-websiteUrl"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
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
            <Button type="submit" disabled={isPending || !instanceId || !title.trim()}>
              {isPending ? "Saving..." : publication ? "Save Changes" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
