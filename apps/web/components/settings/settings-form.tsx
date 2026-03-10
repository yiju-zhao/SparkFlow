"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Check } from "lucide-react";

interface UserSettings {
  modelProvider: string;
  modelName: string;
}

const MODEL_OPTIONS = {
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-5.2", label: "GPT-5.2" },
  ],
  google: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  ],
};

interface SettingsFormProps {
  initialSettings?: UserSettings;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [provider, setProvider] = useState(initialSettings?.modelProvider || "openai");
  const [model, setModel] = useState(initialSettings?.modelName || "gpt-4o-mini");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Reset model when provider changes
  useEffect(() => {
    const defaultModel = MODEL_OPTIONS[provider as keyof typeof MODEL_OPTIONS]?.[0]?.value;
    if (defaultModel && !MODEL_OPTIONS[provider as keyof typeof MODEL_OPTIONS]?.some(m => m.value === model)) {
      setModel(defaultModel);
    }
  }, [provider, model]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelProvider: provider,
          modelName: model,
        }),
      });

      if (!res.ok) throw new Error("Failed to save settings");

      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const currentModels = MODEL_OPTIONS[provider as keyof typeof MODEL_OPTIONS] || [];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Model Provider
          </label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="google">Google</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Choose between OpenAI and Google Gemini models
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Model
          </label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {currentModels.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Select the specific model to use for conversations
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : isSaved ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Saved
            </>
          ) : (
            "Save Settings"
          )}
        </Button>
      </div>

      {provider === "google" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Note:</strong> To use Google Gemini models, the server administrator must configure a{" "}
            <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900 rounded">GOOGLE_API_KEY</code>{" "}
            in the agent backend.
          </p>
        </div>
      )}
    </div>
  );
}
