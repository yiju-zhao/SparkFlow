"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveInstanceWithImport } from "@/lib/actions/admin";

interface Venue {
  id: string;
  name: string;
}

interface InstanceRecord {
  id: string;
  venueId: string;
  year: number;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  location: string | null;
  website: string | null;
  summary: string | null;
}

interface InstanceFormProps {
  instance?: InstanceRecord;
  venues: Venue[];
  trigger: React.ReactNode;
}

type ImportKind = "PUBLICATIONS" | "SESSIONS";

interface ImportResult {
  kind: ImportKind;
  total: number;
  created: number;
  skipped: number;
  deleted: number;
  errors: { title: string; error: string }[];
  warnings?: { session: string; publication: string }[];
}

function toDateInput(date: Date | null | undefined): string {
  if (!date) return "";
  return date instanceof Date
    ? date.toISOString().split("T")[0]
    : new Date(date).toISOString().split("T")[0];
}

function buildSuccessMessage(result: ImportResult) {
  const noun = result.kind === "PUBLICATIONS" ? "publications" : "sessions";
  return `Imported ${noun}: ${result.created} created, ${result.skipped} skipped, ${result.errors.length} errors.`;
}

export function InstanceForm({ instance, venues, trigger }: InstanceFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [currentInstance, setCurrentInstance] = useState<InstanceRecord | undefined>(
    instance,
  );

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

  const [importKind, setImportKind] = useState<ImportKind>("PUBLICATIONS");
  const [importReset, setImportReset] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRawData, setImportRawData] = useState<unknown>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  function reset(nextInstance = instance) {
    setCurrentInstance(nextInstance);
    setVenueId(nextInstance?.venueId ?? "");
    setYear(
      nextInstance?.year
        ? String(nextInstance.year)
        : String(new Date().getFullYear()),
    );
    setName(nextInstance?.name ?? "");
    setStartDate(toDateInput(nextInstance?.startDate));
    setEndDate(toDateInput(nextInstance?.endDate));
    setLocation(nextInstance?.location ?? "");
    setWebsite(nextInstance?.website ?? "");
    setSummary(nextInstance?.summary ?? "");
    setImportKind("PUBLICATIONS");
    setImportReset(false);
    setImportFileName("");
    setImportRawData(null);
    setFileInputKey((value) => value + 1);
    setSubmitError("");
    setSubmitSuccess("");
    setImportResult(null);
  }

  function handleOpenChange(val: boolean) {
    if (val) {
      reset(instance);
    }
    setOpen(val);
    if (!val) reset(instance);
  }

  async function handleImportFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    setSubmitError("");
    setSubmitSuccess("");
    setImportResult(null);

    if (!file) {
      setImportFileName("");
      setImportRawData(null);
      return;
    }

    try {
      const parsed = JSON.parse(await file.text());
      setImportFileName(file.name);
      setImportRawData(parsed);
    } catch {
      setImportFileName(file.name);
      setImportRawData(null);
      setSubmitError("The selected file is not valid JSON.");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!venueId || !name.trim() || !year) return;

    startTransition(async () => {
      try {
        setSubmitError("");
        setSubmitSuccess("");
        setImportResult(null);

        const result = await saveInstanceWithImport({
          instanceId: currentInstance?.id,
          data: {
            venueId,
            year: Number(year),
            name: name.trim(),
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            location: location.trim() || undefined,
            website: website.trim() || undefined,
            summary: summary.trim() || undefined,
          },
          importPayload: importRawData
            ? {
                kind: importKind,
                fileName: importFileName,
                rawData: importRawData,
                reset: importReset,
              }
            : undefined,
        });

        setCurrentInstance(result.instance);
        router.refresh();

        if (result.importResult) {
          setImportFileName("");
          setImportRawData(null);
          setImportReset(false);
          setFileInputKey((value) => value + 1);
          setImportResult(result.importResult as ImportResult);
          setSubmitSuccess(
            buildSuccessMessage(result.importResult as ImportResult),
          );
          return;
        }

        setOpen(false);
      } catch (error) {
        setSubmitError(
          error instanceof Error ? error.message : "Failed to save instance.",
        );
      }
    });
  }

  const isImportReady = Boolean(importRawData);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {currentInstance ? "Edit Instance" : "New Instance"}
          </DialogTitle>
          <DialogDescription>
            Save the instance metadata and optionally import its publications or
            sessions from a JSON file.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1">
            <Label htmlFor="venueId">Venue *</Label>
            <select
              id="venueId"
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              required
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
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

          <Card className="border-dashed bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Bulk Import</CardTitle>
              <CardDescription>
                Upload a JSON file that matches the selected venue and year. Use
                the page-level Format Guide button for the exact schema.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="space-y-1">
                  <Label htmlFor="importKind">Import Type</Label>
                  <Select
                    value={importKind}
                    onValueChange={(value) => setImportKind(value as ImportKind)}
                  >
                    <SelectTrigger id="importKind">
                      <SelectValue placeholder="Select import type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PUBLICATIONS">Publications</SelectItem>
                      <SelectItem value="SESSIONS">Sessions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox
                    checked={importReset}
                    onCheckedChange={(checked) => setImportReset(checked === true)}
                  />
                  Reset existing {importKind.toLowerCase()}
                </label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="importFile">JSON File</Label>
                <Input
                  key={fileInputKey}
                  id="importFile"
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportFileChange}
                />
                <p className="text-xs text-muted-foreground">
                  The file&apos;s top-level <code>venue</code> and{" "}
                  <code>year</code> must match the instance you are saving.
                </p>
                {importFileName ? (
                  <div className="rounded-md border bg-background px-3 py-2 text-sm">
                    Selected file:{" "}
                    <span className="font-medium">{importFileName}</span>
                  </div>
                ) : null}
              </div>

              {submitSuccess ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <div className="font-medium">{submitSuccess}</div>
                  {importResult ? (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">Total {importResult.total}</Badge>
                        <Badge variant="outline">
                          Created {importResult.created}
                        </Badge>
                        <Badge variant="outline">
                          Skipped {importResult.skipped}
                        </Badge>
                        {importResult.deleted > 0 ? (
                          <Badge variant="outline">
                            Deleted {importResult.deleted}
                          </Badge>
                        ) : null}
                        {importResult.errors.length > 0 ? (
                          <Badge variant="outline">
                            Errors {importResult.errors.length}
                          </Badge>
                        ) : null}
                        {importResult.kind === "SESSIONS" &&
                        importResult.warnings &&
                        importResult.warnings.length > 0 ? (
                          <Badge variant="outline">
                            Warnings {importResult.warnings.length}
                          </Badge>
                        ) : null}
                      </div>
                      {importResult.kind === "SESSIONS" &&
                      importResult.warnings &&
                      importResult.warnings.length > 0 ? (
                        <div className="space-y-1">
                          <div className="font-medium">
                            Missing publication links
                          </div>
                          <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-emerald-200 bg-white/70 p-2 text-xs">
                            {importResult.warnings.map((warning) => (
                              <div
                                key={`${warning.session}-${warning.publication}`}
                              >
                                {warning.session}: {warning.publication}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {importResult.errors.length > 0 ? (
                        <div className="space-y-1">
                          <div className="font-medium">Import errors</div>
                          <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-emerald-200 bg-white/70 p-2 text-xs">
                            {importResult.errors.map((item) => (
                              <div key={`${item.title}-${item.error}`}>
                                {item.title}: {item.error}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {submitError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <div className="whitespace-pre-wrap">{submitError}</div>
                </div>
              ) : null}
            </CardContent>
          </Card>

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
                : isImportReady
                  ? currentInstance
                    ? "Save & Import"
                    : "Create & Import"
                  : currentInstance
                    ? "Save Changes"
                    : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
