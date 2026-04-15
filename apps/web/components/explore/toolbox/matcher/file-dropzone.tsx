"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Upload, FileSpreadsheet, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSize?: number; // in bytes
  disabled?: boolean;
  className?: string;
}

export function FileDropzone({
  onFileSelect,
  accept = ".xlsx,.xls",
  maxSize = 10 * 1024 * 1024, // 10MB
  disabled = false,
  className,
}: FileDropzoneProps) {
  const t = useTranslations("explore.toolbox.dropzone");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) {
        setIsDragging(true);
      }
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateFile = useCallback(
    (file: File): string | null => {
      const validTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
      ];

      if (!validTypes.includes(file.type)) {
        return t("invalidFile");
      }

      if (file.size > maxSize) {
        return t("fileTooLarge", { size: Math.round(maxSize / 1024 / 1024) });
      }

      return null;
    },
    [maxSize, t],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (file) {
        const validationError = validateFile(file);
        if (validationError) {
          setError(validationError);
          return;
        }

        setError(null);
        setSelectedFile(file);
        onFileSelect(file);
      }
    },
    [disabled, validateFile, onFileSelect],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const validationError = validateFile(file);
        if (validationError) {
          setError(validationError);
          return;
        }

        setError(null);
        setSelectedFile(file);
        onFileSelect(file);
      }
    },
    [validateFile, onFileSelect],
  );

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setError(null);
  }, []);

  return (
    <div className={cn("w-full", className)}>
      {!selectedFile ? (
        <label
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
            <p className="mb-2 text-sm text-muted-foreground">
              <span className="font-semibold">{t("clickToUpload")}</span> {t("orDragAndDrop")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("supportedFormats", { size: Math.round(maxSize / 1024 / 1024) })}
            </p>
          </div>
          <input
            type="file"
            className="hidden"
            accept={accept}
            onChange={handleFileInput}
            disabled={disabled}
          />
        </label>
      ) : (
        <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/50">
          <FileSpreadsheet className="w-8 h-8 text-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            onClick={handleRemoveFile}
            className="p-1 rounded-full hover:bg-muted"
            type="button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
