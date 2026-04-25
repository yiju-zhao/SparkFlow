"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { v4 as uuidv4 } from "uuid";
import { FileDropzone } from "../file-dropzone";
import { Button } from "@/components/ui/button";
import { Loader2, HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QueryPreviewTable, type QueryPreviewTableHandle } from "../query-preview-table";
import type { ParsedQuery } from "@/lib/matcher/types";

interface UploadStepProps {
  onNext: (queries: ParsedQuery[]) => void;
  onCancel: () => void;
  initialQueries?: ParsedQuery[];
}

async function parseExcelFile(file: File): Promise<ParsedQuery[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  const queries: ParsedQuery[] = [];
  rows.forEach((row, idx) => {
    const bu = String(row[0] ?? "").trim();
    const query = String(row[1] ?? "").trim();
    if (!query || query.toLowerCase() === "query") return;
    if (!bu) return;
    queries.push({ id: uuidv4(), bu, query, rowIndex: idx + 1 });
  });

  return queries;
}

export function UploadStep({ onNext, onCancel, initialQueries }: UploadStepProps) {
  const t = useTranslations("explore.toolbox.wizard.upload");
  const [queries, setQueries] = useState<ParsedQuery[]>(initialQueries ?? []);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<QueryPreviewTableHandle>(null);

  const showPreview = queries.length > 0;

  // Parse immediately when file is dropped — no S3 upload needed
  const handleFileSelect = async (file: File) => {
    setError(null);
    setIsParsing(true);
    try {
      const parsed = await parseExcelFile(file);
      if (parsed.length === 0) {
        throw new Error("No valid rows found. Make sure columns A (BU) and B (Query) are filled.");
      }
      setQueries(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setIsParsing(false);
    }
  };

  const handleReplaceFile = () => {
    setQueries([]);
    setError(null);
  };

  const handleContinue = () => {
    const nextQueries = previewRef.current?.commitPendingEdit() ?? queries;
    onNext(nextQueries);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">{t("title")}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t("description")}</p>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-muted/50 border border-border hover:bg-muted transition-colors shrink-0"
            >
              <span className="font-mono">{t("formatGuide")}</span>
              <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-100 p-4">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide font-mono">
                {t("requiredFormat")}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 text-xs">{t("col")}</TableHead>
                    <TableHead className="text-xs">{t("name")}</TableHead>
                    <TableHead className="text-xs">{t("colDescription")}</TableHead>
                    <TableHead className="text-xs">{t("required")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground">A</TableCell>
                    <TableCell className="text-xs font-mono font-medium">{t("buColumn")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t("buDesc")}</TableCell>
                    <TableCell className="text-xs">{t("yes")}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground">B</TableCell>
                    <TableCell className="text-xs font-mono font-medium">
                      {t("queryColumn")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t("queryDesc")}
                    </TableCell>
                    <TableCell className="text-xs">{t("yes")}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">{t("note")}</p>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {showPreview ? (
        <div data-guide="matcher-query-preview">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              {t("queriesLoaded", { count: queries.length })}
            </span>
            <Button variant="outline" size="sm" onClick={handleReplaceFile}>
              {t("uploadNew")}
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden max-h-125 overflow-y-auto">
            <QueryPreviewTable ref={previewRef} queries={queries} onQueriesChange={setQueries} />
          </div>
        </div>
      ) : (
        <div data-guide="matcher-upload-dropzone">
          <FileDropzone onFileSelect={handleFileSelect} disabled={isParsing} />
          {isParsing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("parsing")}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button onClick={handleContinue} disabled={!showPreview || isParsing}>
          {t("continue")}
        </Button>
      </div>
    </div>
  );
}
