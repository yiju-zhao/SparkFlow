"use client";

import { useState } from "react";
import { FileDropzone } from "../file-dropzone";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface UploadStepProps {
  onNext: (fileKey: string) => void;
  onCancel: () => void;
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
      onNext(fileKey);
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
          Upload an Excel file containing your queries. Each row should have a
          name and content column.
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
