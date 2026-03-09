"use client";

import { useState } from "react";
import { Workbook } from "exceljs";
import { v4 as uuidv4 } from "uuid";
import { FileDropzone } from "../file-dropzone";
import { Button } from "@/components/ui/button";
import { Loader2, HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QueryPreviewTable } from "../query-preview-table";
import type { ParsedQuery } from "@/lib/matcher/types";

interface UploadStepProps {
  onNext: (queries: ParsedQuery[]) => void;
  onCancel: () => void;
  initialQueries?: ParsedQuery[];
}

async function parseExcelFile(file: File): Promise<ParsedQuery[]> {
  const buffer = await file.arrayBuffer();
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];

  const queries: ParsedQuery[] = [];
  worksheet.eachRow((row, rowNumber) => {
    const bu = String(row.getCell(1).value ?? "").trim();
    const query = String(row.getCell(2).value ?? "").trim();
    if (!query || query.toLowerCase() === "query") return;
    if (!bu) return;
    queries.push({ id: uuidv4(), bu, query, rowIndex: rowNumber });
  });

  return queries;
}

export function UploadStep({ onNext, onCancel, initialQueries }: UploadStepProps) {
  const [queries, setQueries] = useState<ParsedQuery[]>(initialQueries ?? []);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Upload Query File</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Upload an Excel file with BU and Query columns. Queries will be
            automatically translated to English.
          </p>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-muted/50 border border-border hover:bg-muted transition-colors shrink-0"
            >
              <span className="font-mono">Format Guide</span>
              <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[400px] p-4">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide font-mono">
                Required Format
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 text-xs">Col</TableHead>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs">Required</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground">A</TableCell>
                    <TableCell className="text-xs font-mono font-medium">bu</TableCell>
                    <TableCell className="text-xs text-muted-foreground">Business unit requesting the match</TableCell>
                    <TableCell className="text-xs">Yes</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground">B</TableCell>
                    <TableCell className="text-xs font-mono font-medium">query</TableCell>
                    <TableCell className="text-xs text-muted-foreground">The search query to match against sessions or publications</TableCell>
                    <TableCell className="text-xs">Yes</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                Columns are read by position — header names do not need to match exactly.
                Queries will be automatically translated to English before matching.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {showPreview ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{queries.length}</span>{" "}
              {queries.length === 1 ? "query" : "queries"} loaded
            </span>
            <Button variant="outline" size="sm" onClick={handleReplaceFile}>
              Upload new file
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
            <QueryPreviewTable queries={queries} onQueriesChange={setQueries} />
          </div>
        </div>
      ) : (
        <>
          <FileDropzone
            onFileSelect={handleFileSelect}
            disabled={isParsing}
          />
          {isParsing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Parsing file…
            </div>
          )}
        </>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => onNext(queries)}
          disabled={!showPreview || isParsing}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
