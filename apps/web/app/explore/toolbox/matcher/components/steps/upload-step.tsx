"use client";

import { useState } from "react";
import { read, utils } from "xlsx";
import { v4 as uuidv4 } from "uuid";
import { FileDropzone } from "../file-dropzone";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ParsedQuery } from "@/lib/matcher/types";

interface UploadStepProps {
  onNext: (fileKey: string, queries: ParsedQuery[]) => void;
  onCancel: () => void;
}

function parseExcelFile(file: File): Promise<ParsedQuery[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: string[][] = utils.sheet_to_json(sheet, { header: 1, defval: "" });

        const queries: ParsedQuery[] = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const key = String(row[0] ?? "").trim();
          const area = String(row[1] ?? "").trim();
          const query = String(row[2] ?? "").trim();
          // Skip header row if first cell looks like a header, and skip empty queries
          if (!query || query.toLowerCase() === "query") continue;
          if (!key) continue;
          queries.push({ id: uuidv4(), key, area, query, rowIndex: i });
        }
        resolve(queries);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
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
      <div>
        <h3 className="text-lg font-medium">Upload Query File</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Upload an Excel file containing your queries. The file should have
          three columns: Key (who wants the matching), Area (optional
          domain/area), and Query (the search query). Area and Query will be
          automatically translated to English.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Required Format</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 text-xs">Col</TableHead>
              <TableHead className="text-xs">Column Name</TableHead>
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
          Columns are read by position — header names do not need to match exactly. Area and Query will be automatically translated to English before matching.
        </p>
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
