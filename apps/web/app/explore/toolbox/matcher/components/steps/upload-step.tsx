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
import type { ParsedQuery } from "@/lib/matcher/types";

interface UploadStepProps {
  onNext: (fileKey: string, queries: ParsedQuery[]) => void;
  onCancel: () => void;
}

async function parseExcelFile(file: File): Promise<ParsedQuery[]> {
  const buffer = await file.arrayBuffer();
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];

  const queries: ParsedQuery[] = [];
  worksheet.eachRow((row, rowNumber) => {
    const key = String(row.getCell(1).value ?? "").trim();
    const area = String(row.getCell(2).value ?? "").trim();
    const query = String(row.getCell(3).value ?? "").trim();
    if (!query || query.toLowerCase() === "query") return;
    if (!key) return;
    queries.push({ id: uuidv4(), key, area, query, rowIndex: rowNumber });
  });

  return queries;
}

export function UploadStep({ onNext, onCancel }: UploadStepProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);

    try {
      // Parse Excel client-side first
      const queries = await parseExcelFile(selectedFile);
      if (queries.length === 0) {
        throw new Error("No valid rows found. Make sure columns A (key) and C (query) are filled.");
      }

      // Upload file to S3 for the matching job
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/matcher/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to upload file");
      }

      const { fileKey } = await response.json();
      onNext(fileKey, queries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Upload Query File</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Upload an Excel file containing your queries. Area and Query will be
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
          <PopoverContent align="end" className="w-[420px] p-4">
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
                    <TableCell className="text-xs font-mono font-medium">key</TableCell>
                    <TableCell className="text-xs text-muted-foreground">Who wants the matching (person or entity name)</TableCell>
                    <TableCell className="text-xs">Yes</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground">B</TableCell>
                    <TableCell className="text-xs font-mono font-medium">area</TableCell>
                    <TableCell className="text-xs text-muted-foreground">Domain or topic area to narrow the search</TableCell>
                    <TableCell className="text-xs text-muted-foreground">Optional</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground">C</TableCell>
                    <TableCell className="text-xs font-mono font-medium">query</TableCell>
                    <TableCell className="text-xs text-muted-foreground">The search query to match against sessions or publications</TableCell>
                    <TableCell className="text-xs">Yes</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                Columns are read by position — header names do not need to match exactly.
                Area and Query will be automatically translated to English before matching.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <FileDropzone
        onFileSelect={handleFileSelect}
        disabled={isUploading}
      />

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleUpload}
          disabled={!selectedFile || isUploading}
        >
          {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Continue
        </Button>
      </div>
    </div>
  );
}
