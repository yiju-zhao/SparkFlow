"use client";

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

interface FormatGuideDialogProps {
  publicationSample: unknown;
  sessionSample: unknown;
}

const publicationFields = [
  "venue",
  "year",
  "instanceMetadata",
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

export function FormatGuideDialog({
  publicationSample,
  sessionSample,
}: FormatGuideDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Format Guide</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Instance Import Format Guide</DialogTitle>
          <DialogDescription>
            Use the same JSON contract for both the admin panel uploader and the
            CLI import scripts. The top-level <code>venue</code> and{" "}
            <code>year</code> must match the instance you are targeting.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="publications" className="space-y-4">
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
                  <div>`instanceMetadata` is optional.</div>
                  <div>
                    `publications[].summary` is now supported and maps to the
                    Publication model.
                  </div>
                  <div>
                    Blank optional URLs are allowed, but valid URLs are
                    preferred.
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="overflow-hidden rounded-lg border">
              <div className="border-b bg-muted/30 px-4 py-2 text-sm font-medium">
                Example JSON
              </div>
              <pre className="max-h-105 overflow-auto bg-slate-950 p-4 text-xs text-slate-50">
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
                    `sessionFormat` accepts `IN_PERSON`, `VIRTUAL`, or `BOTH`.
                  </div>
                  <div>
                    `hasRecording` is boolean and defaults to `false` when
                    omitted.
                  </div>
                  <div>
                    `publicationTitles` should match imported publication titles
                    exactly.
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="overflow-hidden rounded-lg border">
              <div className="border-b bg-muted/30 px-4 py-2 text-sm font-medium">
                Example JSON
              </div>
              <pre className="max-h-105 overflow-auto bg-slate-950 p-4 text-xs text-slate-50">
                {JSON.stringify(sessionSample, null, 2)}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
