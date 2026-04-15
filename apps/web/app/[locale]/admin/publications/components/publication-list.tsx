"use client";

import { useState, useTransition, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchPublications } from "@/lib/actions/admin";
import { PublicationForm } from "./publication-form";
import { Search } from "lucide-react";

interface Instance {
  id: string;
  name: string;
  year: number;
  venue: { name: string };
}

type PublicationRow = Awaited<ReturnType<typeof searchPublications>>[number];

export function PublicationList({ instances }: { instances: Instance[] }) {
  const [query, setQuery] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [publications, setPublications] = useState<PublicationRow[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isPending, startTransition] = useTransition();

  const doSearch = useCallback(() => {
    startTransition(async () => {
      const results = await searchPublications(query, instanceId || undefined);
      setPublications(results);
      setHasSearched(true);
    });
  }, [query, instanceId]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") doSearch();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Publications</h1>
        <PublicationForm instances={instances} trigger={<Button>New Publication</Button>} />
      </div>

      <div className="flex items-center gap-3 mb-6">
        <select
          value={instanceId}
          onChange={(e) => setInstanceId(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All instances</option>
          {instances.map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.venue.name} {inst.year} — {inst.name}
            </option>
          ))}
        </select>
        <Input
          placeholder="Search publications by title..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="max-w-sm"
        />
        <Button onClick={doSearch} disabled={isPending} size="sm">
          <Search className="mr-2 h-4 w-4" />
          {isPending ? "Searching..." : "Search"}
        </Button>
      </div>

      {!hasSearched ? (
        <p className="text-sm text-muted-foreground">
          Use the search bar and filters above to find publications.
        </p>
      ) : publications.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No publications found. Try a different search term.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            Showing top {publications.length} result
            {publications.length !== 1 ? "s" : ""}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">Title</th>
                <th className="pb-2 font-medium">Instance</th>
                <th className="pb-2 font-medium">Authors</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Rating</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {publications.map((pub) => (
                <tr key={pub.id} className="border-b">
                  <td className="py-3 max-w-xs truncate">{pub.title}</td>
                  <td className="py-3 text-muted-foreground whitespace-nowrap">
                    {pub.instance.venue.name} {pub.instance.year}
                  </td>
                  <td className="py-3 text-muted-foreground max-w-xs truncate">
                    {pub.authors.length > 0
                      ? pub.authors.slice(0, 3).join(", ") + (pub.authors.length > 3 ? "..." : "")
                      : "—"}
                  </td>
                  <td className="py-3 text-muted-foreground">{pub.status ?? "—"}</td>
                  <td className="py-3 text-muted-foreground">
                    {pub.rating != null ? pub.rating.toFixed(1) : "—"}
                  </td>
                  <td className="py-3">
                    <PublicationForm
                      publication={pub}
                      instances={instances}
                      trigger={
                        <Button variant="outline" size="sm">
                          Edit
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
