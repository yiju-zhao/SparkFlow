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
  matcherModelProvider: string;
  matcherModelName: string;
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
  const [chatProvider, setChatProvider] = useState(initialSettings?.modelProvider || "google");
  const [chatModel, setChatModel] = useState(initialSettings?.modelName || "gemini-2.5-flash");
  const [matcherProvider, setMatcherProvider] = useState(initialSettings?.matcherModelProvider || "google");
  const [matcherModel, setMatcherModel] = useState(initialSettings?.matcherModelName || "gemini-2.5-flash");
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
            setChatProvider(data.defaults.provider);
            setChatModel(data.defaults.model);
            setMatcherProvider(data.defaults.provider);
            setMatcherModel(data.defaults.model);
          }
        }
      } catch (error) {
        console.error("Failed to fetch available models:", error);
      }
    };
    fetchModels();
  }, [initialSettings]);

  // Reset model when provider changes
  useEffect(() => {
    if (!availableModels) return;
    const currentModels = chatProvider === "google" ? availableModels.google : availableModels.openai;
    if (!currentModels.includes(chatModel)) {
      setChatModel(currentModels[0]);
    }
  }, [chatProvider, chatModel, availableModels]);

  useEffect(() => {
    if (!availableModels) return;
    const currentModels = matcherProvider === "google" ? availableModels.google : availableModels.openai;
    if (!currentModels.includes(matcherModel)) {
      setMatcherModel(currentModels[0]);
    }
  }, [matcherProvider, matcherModel, availableModels]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelProvider: chatProvider,
          modelName: chatModel,
          matcherModelProvider: matcherProvider,
          matcherModelName: matcherModel,
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

  const getModelOptions = (provider: string) => {
    if (!availableModels) return [];
    return provider === "google" ? availableModels.google : availableModels.openai;
  };

  return (
    <div className="space-y-8">
      {/* Chat/RAG Agent Model */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-medium">Chat Model</h3>
          <p className="text-sm text-muted-foreground">
            Model used for conversations in notebooks (Deepdive)
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Provider
            </label>
            <Select value={chatProvider} onValueChange={setChatProvider}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="google">Google (Gemini)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Model
            </label>
            <Select value={chatModel} onValueChange={setChatModel} disabled={!availableModels}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={availableModels ? "Select model" : "Loading..."} />
              </SelectTrigger>
              <SelectContent>
                {getModelOptions(chatProvider).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Matcher Agent Model */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-medium">Matcher Model</h3>
          <p className="text-sm text-muted-foreground">
            Model used for matching queries to conference sessions/publications (Explore)
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Provider
            </label>
            <Select value={matcherProvider} onValueChange={setMatcherProvider}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="google">Google (Gemini)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Model
            </label>
            <Select value={matcherModel} onValueChange={setMatcherModel} disabled={!availableModels}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={availableModels ? "Select model" : "Loading..."} />
              </SelectTrigger>
              <SelectContent>
                {getModelOptions(matcherProvider).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3 pt-4 border-t">
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

      {/* Note for Google models */}
      {(chatProvider === "google" || matcherProvider === "google") && (
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
