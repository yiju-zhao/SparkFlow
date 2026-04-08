"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Copy } from "lucide-react";

interface FormatGuideDialogProps {
  publicationSample: unknown;
  sessionSample: unknown;
}

const publicationFields = [
  "venue",
  "year",
  "publications[].title",
  "publications[].authors",
  "publications[].summary",
  "publications[].researchTopic",
  "publications[].status",
  "publications[].pdfUrl",
];

const sessionFields = [
  "venue",
  "year",
  "sessions[].title",
  "sessions[].date",
  "sessions[].speaker",
  "sessions[].sessionFormat",
  "sessions[].hasRecording",
  "sessions[].intendedAudience",
  "sessions[].publicationTitles",
];

function CopyMarkdownButton({
  json,
  label,
  fields,
  notes,
}: {
  json: unknown;
  label: string;
  fields: string[];
  notes: string[];
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const fieldList = fields.map((f) => `\`${f}\``).join(", ");
    const notesList = notes.map((n) => `- ${n}`).join("\n");
    const md = [
      `# ${label} Import Format`,
      "",
      "## Schema Notes",
      "",
      `**Fields:** ${fieldList}`,
      "",
      notesList,
      "",
      "## Example JSON",
      "",
      "```json",
      JSON.stringify(json, null, 2),
      "```",
    ].join("\n");
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      {copied ? (
        <Check className="mr-2 h-3.5 w-3.5" />
      ) : (
        <Copy className="mr-2 h-3.5 w-3.5" />
      )}
      {copied ? "Copied!" : "Copy as Markdown"}
    </Button>
  );
}

export function FormatGuideDialog({
  publicationSample,
  sessionSample,
}: FormatGuideDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Format Guide</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-[calc(100%-2rem)] sm:max-w-[90vw] lg:max-w-[70vw] overflow-auto">
        <DialogHeader>
          <DialogTitle>Instance Import Format Guide</DialogTitle>
          <DialogDescription>
            Use the same JSON contract for both the admin panel uploader and the
            CLI import scripts. The top-level <code>venue</code> and{" "}
            <code>year</code> must match the instance you are targeting.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="publications" className="min-w-0 space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="publications">Publications</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
          </TabsList>

          <TabsContent value="publications" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Schema Notes</CardTitle>
                <CardDescription>
                  Publication import can create or enrich an instance and then
                  load its publication records.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {publicationFields.map((field) => (
                    <Badge key={field} variant="outline">
                      {field}
                    </Badge>
                  ))}
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                  <div>
                    Minimal format is{" "}
                    <code>{`{ venue, year, publications }`}</code>.
                  </div>
                  <div>
                    `publications[].summary` maps to the Publication model.
                  </div>
                  <div>
                    Blank optional URLs are allowed, but valid URLs are preferred.
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="overflow-hidden rounded-lg border">
              <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
                <span className="text-sm font-medium">Example JSON</span>
                <CopyMarkdownButton
                  json={publicationSample}
                  label="Publications"
                  fields={publicationFields}
                  notes={[
                    "Minimal format is `{ venue, year, publications }`.",
                    "`publications[].summary` maps to the Publication model.",
                    "Blank optional URLs are allowed, but valid URLs are preferred.",
                  ]}
                />
              </div>
              <pre className="overflow-auto bg-slate-950 p-5 text-xs leading-6 text-slate-50">
                {JSON.stringify(publicationSample, null, 2)}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="sessions" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Schema Notes</CardTitle>
                <CardDescription>
                  Session import attaches sessions to an existing instance and
                  optionally links them to publications by exact title match.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {sessionFields.map((field) => (
                    <Badge key={field} variant="outline">
                      {field}
                    </Badge>
                  ))}
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                  <div>
                    Minimal format is{" "}
                    <code>{`{ venue, year, sessions }`}</code>.
                  </div>
                  <div>
                    `sessionFormat` accepts `IN_PERSON`, `VIRTUAL`, or `BOTH`.
                  </div>
                  <div>
                    `hasRecording` defaults to `false` when omitted, and
                    `publicationTitles` should match publication titles exactly.
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="overflow-hidden rounded-lg border">
              <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
                <span className="text-sm font-medium">Example JSON</span>
                <CopyMarkdownButton
                  json={sessionSample}
                  label="Sessions"
                  fields={sessionFields}
                  notes={[
                    "Minimal format is `{ venue, year, sessions }`.",
                    "`sessionFormat` accepts `IN_PERSON`, `VIRTUAL`, or `BOTH`.",
                    "`hasRecording` defaults to `false` when omitted, and `publicationTitles` should match publication titles exactly.",
                  ]}
                />
              </div>
              <pre className="overflow-auto bg-slate-950 p-5 text-xs leading-6 text-slate-50">
                {JSON.stringify(sessionSample, null, 2)}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
