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

interface AvailableModels {
  openai: string[];
  google: string[];
  defaults: {
    provider: string;
    model: string;
  };
}

interface SettingsFormProps {
  initialSettings?: UserSettings;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [provider, setProvider] = useState(initialSettings?.modelProvider || "google");
  const [model, setModel] = useState(initialSettings?.modelName || "gemini-2.5-flash");
  const [availableModels, setAvailableModels] = useState<AvailableModels | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Fetch available models from environment configuration
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch("/api/models");
        if (res.ok) {
          const data = await res.json();
          setAvailableModels(data);

          // If no initial settings, use defaults from env
          if (!initialSettings) {
            setProvider(data.defaults.provider);
            setModel(data.defaults.model);
          }
        }
      } catch (error) {
        console.error("Failed to fetch available models:", error);
      }
    };
    fetchModels();
  }, [initialSettings]);

  // Reset model when provider changes (if current model not in new provider's list)
  useEffect(() => {
    if (!availableModels) return;

    const currentModels = provider === "google" ? availableModels.google : availableModels.openai;
    if (!currentModels.includes(model)) {
      setModel(currentModels[0]);
    }
  }, [provider, model, availableModels]);

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

  const currentModels = availableModels
    ? (provider === "google" ? availableModels.google : availableModels.openai)
    : [];

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
              <SelectItem value="google">Google (Gemini)</SelectItem>
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
          <Select value={model} onValueChange={setModel} disabled={!availableModels}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={availableModels ? "Select model" : "Loading models..."} />
            </SelectTrigger>
            <SelectContent>
              {currentModels.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
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
        <Button onClick={handleSave} disabled={isLoading || !availableModels}>
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
