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
import { Loader2, Check, Eye, EyeOff, Trash2, Key } from "lucide-react";
import { Input } from "@/components/ui/input";

const PROVIDERS_LIST = [
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Gemini" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "glm", label: "GLM (Zhipu)" },
  { id: "minimax", label: "Minimax" },
  { id: "kimi", label: "Kimi (Moonshot)" },
  { id: "custom", label: "Custom" },
];

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
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, { hasKey: boolean; maskedKey: string }>>({});
  const [keySaving, setKeySaving] = useState(false);

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

  useEffect(() => {
    const fetchKeyStatus = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setApiKeyStatus(data.apiKeyStatus || {});
        }
      } catch (error) {
        console.error("Failed to fetch key status:", error);
      }
    };
    fetchKeyStatus();
  }, []);

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

  const handleSaveKey = async (providerId: string) => {
    if (!keyInput.trim()) return;
    setKeySaving(true);
    try {
      const payload: Record<string, any> = {
        apiKeys: {
          [providerId]: {
            apiKey: keyInput.trim(),
            ...(providerId === "custom" && baseUrlInput.trim()
              ? { baseUrl: baseUrlInput.trim() }
              : {}),
          },
        },
      };
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save key");

      const settingsRes = await fetch("/api/settings");
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setApiKeyStatus(data.apiKeyStatus || {});
      }
      setEditingProvider(null);
      setKeyInput("");
      setBaseUrlInput("");
    } catch (error) {
      console.error("Failed to save API key:", error);
    } finally {
      setKeySaving(false);
    }
  };

  const handleRemoveKey = async (providerId: string) => {
    setKeySaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKeys: { [providerId]: null } }),
      });
      if (!res.ok) throw new Error("Failed to remove key");

      setApiKeyStatus((prev) => {
        const next = { ...prev };
        delete next[providerId];
        return next;
      });
    } catch (error) {
      console.error("Failed to remove API key:", error);
    } finally {
      setKeySaving(false);
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

      {/* API Keys Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-medium">API Keys</h3>
          <p className="text-sm text-muted-foreground">
            Set your own API keys to use LLM features. Keys are encrypted at rest.
          </p>
        </div>

        <div className="space-y-3">
          {PROVIDERS_LIST.map((provider) => {
            const status = apiKeyStatus[provider.id];
            const isEditing = editingProvider === provider.id;

            return (
              <div key={provider.id} className="flex items-center gap-3 py-2">
                <div className="w-32 shrink-0">
                  <span className="text-sm font-medium">{provider.label}</span>
                </div>

                {isEditing ? (
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showKey ? "text" : "password"}
                          placeholder="Enter API key"
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowKey(!showKey)}
                        >
                          {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleSaveKey(provider.id)}
                        disabled={keySaving || !keyInput.trim()}
                      >
                        {keySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingProvider(null);
                          setKeyInput("");
                          setBaseUrlInput("");
                          setShowKey(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    {provider.id === "custom" && (
                      <Input
                        type="url"
                        placeholder="Base URL (e.g. https://api.example.com/v1)"
                        value={baseUrlInput}
                        onChange={(e) => setBaseUrlInput(e.target.value)}
                      />
                    )}
                  </div>
                ) : status?.hasKey ? (
                  <div className="flex items-center gap-2 flex-1">
                    <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      {status.maskedKey}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingProvider(provider.id);
                        setKeyInput("");
                        setShowKey(false);
                      }}
                    >
                      Update
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRemoveKey(provider.id)}
                      disabled={keySaving}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingProvider(provider.id);
                      setKeyInput("");
                      setShowKey(false);
                    }}
                  >
                    <Key className="mr-1.5 h-3.5 w-3.5" />
                    Set Key
                  </Button>
                )}
              </div>
            );
          })}
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

      {/* Note about API keys */}
      <div className="rounded-md border border-border bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Note:</strong> You must set an API key for your selected provider to use chat and wiki features.
          Admin users can fall back to system-configured keys for testing.
        </p>
      </div>
    </div>
  );
}
