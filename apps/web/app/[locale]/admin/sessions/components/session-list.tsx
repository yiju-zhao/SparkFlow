"use client";

import { useState, useTransition, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchSessions } from "@/lib/actions/admin";
import { SessionForm } from "./session-form";
import { Search } from "lucide-react";

interface Instance {
  id: string;
  name: string;
  year: number;
  venue: { name: string };
}

type SessionRow = Awaited<ReturnType<typeof searchSessions>>[number];

export function SessionList({ instances }: { instances: Instance[] }) {
  const [query, setQuery] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isPending, startTransition] = useTransition();

  const doSearch = useCallback(() => {
    startTransition(async () => {
      const results = await searchSessions(query, instanceId || undefined);
      setSessions(results);
      setHasSearched(true);
    });
  }, [query, instanceId]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") doSearch();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <SessionForm instances={instances} trigger={<Button>New Session</Button>} />
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
          placeholder="Search sessions by title..."
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
          Use the search bar and filters above to find sessions.
        </p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sessions found. Try a different search term.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            Showing top {sessions.length} result{sessions.length !== 1 ? "s" : ""}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">Title</th>
                <th className="pb-2 font-medium">Instance</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Speakers</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((sess) => (
                <tr key={sess.id} className="border-b">
                  <td className="py-3 max-w-xs truncate">{sess.title}</td>
                  <td className="py-3 text-muted-foreground whitespace-nowrap">
                    {sess.instance.venue.name} {sess.instance.year}
                  </td>
                  <td className="py-3 text-muted-foreground">{sess.type ?? "—"}</td>
                  <td className="py-3 text-muted-foreground whitespace-nowrap">
                    {sess.date ? new Date(sess.date).toISOString().split("T")[0] : "—"}
                  </td>
                  <td className="py-3 text-muted-foreground max-w-xs truncate">
                    {sess.speaker.length > 0 ? sess.speaker.join(", ") : "—"}
                  </td>
                  <td className="py-3">
                    <SessionForm
                      session={sess}
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
