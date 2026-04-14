"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Check, Eye, EyeOff, Trash2, Key } from "lucide-react";

interface ModelInfo {
  id: string;
  label: string;
  desc: string;
}

interface ModelsConfig {
  providers: Record<string, { label: string; models: ModelInfo[] }>;
  defaults: {
    provider: string;
    chatModel: string;
    wikiModel: string;
    matcherModel: string;
  };
  recommendations?: {
    chat?: string;
    wiki?: string;
    matcher?: string;
  };
}

interface UserSettings {
  modelProvider: string;
  modelName: string;
  wikiModelProvider: string;
  wikiModelName: string;
  matcherModelProvider: string;
  matcherModelName: string;
  apiKeyStatus?: Record<string, { hasKey: boolean; maskedKey: string }>;
}

const API_KEY_PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Gemini" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "glm", label: "GLM (Zhipu)" },
  { id: "minimax", label: "Minimax" },
  { id: "kimi", label: "Kimi (Moonshot)" },
  { id: "custom", label: "Custom" },
];

interface SettingsFormProps {
  initialSettings?: UserSettings;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [config, setConfig] = useState<ModelsConfig | null>(null);

  // Deepdive settings
  const [chatProvider, setChatProvider] = useState(initialSettings?.modelProvider || "openai");
  const [chatModel, setChatModel] = useState(initialSettings?.modelName || "gpt-4o-mini");
  const [wikiProvider, setWikiProvider] = useState(initialSettings?.wikiModelProvider || "openai");
  const [wikiModel, setWikiModel] = useState(initialSettings?.wikiModelName || "gpt-4o-mini");

  // Research Hub settings
  const [matcherProvider, setMatcherProvider] = useState(initialSettings?.matcherModelProvider || "openai");
  const [matcherModel, setMatcherModel] = useState(initialSettings?.matcherModelName || "gpt-4o-mini");

  // API Keys
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, { hasKey: boolean; maskedKey: string }>>({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keySaving, setKeySaving] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Fetch config + key status
  useEffect(() => {
    const init = async () => {
      try {
        const [modelsRes, settingsRes] = await Promise.all([
          fetch("/api/models"),
          fetch("/api/settings"),
        ]);
        if (modelsRes.ok) {
          const data: ModelsConfig = await modelsRes.json();
          setConfig(data);
          if (!initialSettings) {
            setChatProvider(data.defaults.provider);
            setChatModel(data.defaults.chatModel);
            setWikiProvider(data.defaults.provider);
            setWikiModel(data.defaults.wikiModel);
            setMatcherProvider(data.defaults.provider);
            setMatcherModel(data.defaults.matcherModel);
          }
        }
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setApiKeyStatus(data.apiKeyStatus || {});
          if (data.wikiModelProvider) {
            setWikiProvider(data.wikiModelProvider);
            setWikiModel(data.wikiModelName);
          }
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      }
    };
    init();
  }, [initialSettings]);

  // Provider options from config
  const providerOptions = useMemo(() => {
    if (!config) return [];
    return Object.entries(config.providers).map(([id, { label }]) => ({ id, label }));
  }, [config]);

  const getModels = (providerId: string): ModelInfo[] => {
    return config?.providers[providerId]?.models || [];
  };

  const getModelIds = (providerId: string): string[] => {
    return getModels(providerId).map((m) => m.id);
  };

  // Reset model when provider changes
  useEffect(() => {
    const ids = getModelIds(chatProvider);
    if (ids.length > 0 && !ids.includes(chatModel)) setChatModel(ids[0]);
  }, [chatProvider, config]);

  useEffect(() => {
    const ids = getModelIds(wikiProvider);
    if (ids.length > 0 && !ids.includes(wikiModel)) setWikiModel(ids[0]);
  }, [wikiProvider, config]);

  useEffect(() => {
    const ids = getModelIds(matcherProvider);
    if (ids.length > 0 && !ids.includes(matcherModel)) setMatcherModel(ids[0]);
  }, [matcherProvider, config]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelProvider: chatProvider,
          modelName: chatModel,
          wikiModelProvider: wikiProvider,
          wikiModelName: wikiModel,
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
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKeys: {
            [providerId]: {
              apiKey: keyInput.trim(),
              ...(providerId === "custom" && baseUrlInput.trim() ? { baseUrl: baseUrlInput.trim() } : {}),
            },
          },
        }),
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

  // Reusable model selector
  const ModelSelector = ({
    label,
    description,
    recommendation,
    provider,
    model,
    onProviderChange,
    onModelChange,
  }: {
    label: string;
    description: string;
    recommendation?: string;
    provider: string;
    model: string;
    onProviderChange: (v: string) => void;
    onModelChange: (v: string) => void;
  }) => (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-medium">{label}</h4>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select value={provider} onValueChange={onProviderChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            {providerOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={model} onValueChange={onModelChange} disabled={!config}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={config ? "Model" : "Loading..."} />
          </SelectTrigger>
          <SelectContent>
            {getModels(provider).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <div className="flex flex-col">
                  <span>{m.label}</span>
                  <span className="text-xs text-muted-foreground">{m.desc}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {recommendation && (
        <p className="text-xs text-muted-foreground/70 italic">{recommendation}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* ─── Deepdive Section ─── */}
      <div className="space-y-5">
        <div className="border-b pb-2">
          <h3 className="text-base font-semibold">Deepdive</h3>
          <p className="text-xs text-muted-foreground">Models for notebook chat and wiki generation</p>
        </div>

        <ModelSelector
          label="Chat Model"
          description="Used for conversations and RAG queries"
          recommendation={config?.recommendations?.chat}
          provider={chatProvider}
          model={chatModel}
          onProviderChange={setChatProvider}
          onModelChange={setChatModel}
        />

        <ModelSelector
          label="Wiki Model"
          description="Used for knowledge graph extraction and wiki page generation"
          recommendation={config?.recommendations?.wiki}
          provider={wikiProvider}
          model={wikiModel}
          onProviderChange={setWikiProvider}
          onModelChange={setWikiModel}
        />
      </div>

      {/* ─── Research Hub Section ─── */}
      <div className="space-y-5">
        <div className="border-b pb-2">
          <h3 className="text-base font-semibold">Research Hub</h3>
          <p className="text-xs text-muted-foreground">Models for conference/publication matching</p>
        </div>

        <ModelSelector
          label="Matcher Model"
          description="Used for matching queries to sessions and publications"
          recommendation={config?.recommendations?.matcher}
          provider={matcherProvider}
          model={matcherModel}
          onProviderChange={setMatcherProvider}
          onModelChange={setMatcherModel}
        />
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={isLoading || !config}>
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

      {/* ─── API Keys Section ─── */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h3 className="text-base font-semibold">API Keys</h3>
          <p className="text-xs text-muted-foreground">
            Set your own API keys to use LLM features. Keys are encrypted at rest.
          </p>
        </div>

        <div className="space-y-2">
          {API_KEY_PROVIDERS.map((provider) => {
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
                      <Button size="sm" onClick={() => handleSaveKey(provider.id)} disabled={keySaving || !keyInput.trim()}>
                        {keySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingProvider(null); setKeyInput(""); setBaseUrlInput(""); setShowKey(false); }}>
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
                    <Button size="sm" variant="outline" onClick={() => { setEditingProvider(provider.id); setKeyInput(""); setShowKey(false); }}>
                      Update
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleRemoveKey(provider.id)} disabled={keySaving}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => { setEditingProvider(provider.id); setKeyInput(""); setShowKey(false); }}>
                    <Key className="mr-1.5 h-3.5 w-3.5" />
                    Set Key
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
