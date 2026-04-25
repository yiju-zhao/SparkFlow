"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Cpu,
  Database,
  KeyRound,
  User as UserIcon,
  Check,
  Loader2,
  Eye,
  EyeOff,
  Search,
  Copy,
  Plus,
  ArrowLeft,
  Info,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SparkflowLockup } from "@/components/ui/sparkflow-lockup";
import { useGuides } from "@/components/guides/guide-provider";
import { v4 as uuidv4 } from "uuid";
import { CUSTOM_PROVIDER_PREFIX } from "@/lib/types/providers";

// ============================================================================
// Types
// ============================================================================

type SectionId = "models" | "data-sources" | "api-keys" | "account";

interface WechatSource {
  id: number;
  slug: string;
  name: string;
  description: string;
}

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
    searchModel: string;
    semopsModel: string;
  };
  recommendations?: {
    chat?: string;
    wiki?: string;
    search?: string;
    matcher?: string;
  };
}

interface InitialSettings {
  // BYOK mandate: fields are null when the user hasn't picked yet.
  // The Settings UI renders empty Select placeholders; consumers
  // (chat, search, wiki ingest, digest, matcher) 400 on null.
  modelProvider: string | null;
  modelName: string | null;
  wikiModelProvider: string | null;
  wikiModelName: string | null;
  searchModelProvider: string | null;
  searchModelName: string | null;
  semopsModelProvider: string | null;
  semopsModelName: string | null;
}

interface ApiKeyStatus {
  hasKey: boolean;
  maskedKey: string;
  label?: string;
  baseUrl?: string;
}

interface SettingsUser {
  username: string;
  email: string;
  role: string;
}

interface SettingsWorkspaceProps {
  initialSettings?: InitialSettings;
  user: SettingsUser;
}

const API_KEY_PROVIDERS: {
  id: string;
  label: string;
  description: string;
  placeholder: string;
}[] = [
  { id: "openai", label: "OpenAI", description: "GPT-4, GPT-3.5-Turbo", placeholder: "sk-..." },
  { id: "gemini", label: "Google Gemini", description: "Gemini 1.5 Pro, Flash", placeholder: "AIza..." },
  { id: "deepseek", label: "DeepSeek", description: "DeepSeek Chat, Coder", placeholder: "sk-..." },
  { id: "glm", label: "GLM (Zhipu)", description: "GLM-4, GLM-4-Air", placeholder: "..." },
  { id: "minimax", label: "Minimax", description: "MiniMax-ABAB, Text", placeholder: "..." },
  { id: "kimi", label: "Kimi (Moonshot)", description: "Moonshot v1", placeholder: "sk-..." },
];

const NAV_ITEMS: { id: SectionId; label: string; icon: typeof Cpu }[] = [
  { id: "models", label: "AI Models", icon: Cpu },
  { id: "data-sources", label: "Data Sources", icon: Database },
  { id: "api-keys", label: "API Keys", icon: KeyRound },
  { id: "account", label: "Account", icon: UserIcon },
];

// ============================================================================
// Root workspace
// ============================================================================

export function SettingsWorkspace({ initialSettings, user }: SettingsWorkspaceProps) {
  const [active, setActive] = useState<SectionId>("models");
  const [config, setConfig] = useState<ModelsConfig | null>(null);
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, ApiKeyStatus>>({});
  const [wechatSources, setWechatSources] = useState<WechatSource[]>([]);
  const [wechatExcluded, setWechatExcluded] = useState<Set<number>>(new Set());
  const [wechatLoading, setWechatLoading] = useState(true);
  const mainScrollRef = useRef<HTMLElement>(null);

  // Read active section from URL hash on mount
  useEffect(() => {
    const hash = window.location.hash.replace("#", "") as SectionId;
    if (NAV_ITEMS.some((n) => n.id === hash)) setActive(hash);
  }, []);

  // Reset the content pane to the top whenever the section changes. Without
  // this, opening e.g. /settings#api-keys would leave scroll wherever the
  // browser's scroll restoration landed it — which on a refresh is often
  // the bottom of the previously-rendered section.
  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [active]);

  const handleSelect = useCallback((id: SectionId) => {
    setActive(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
  }, []);

  // Expose section navigation to the guide player so settings guides (byok)
  // can open the right section programmatically.
  const { registerGuideAction } = useGuides();
  useEffect(() => {
    const unregisters = NAV_ITEMS.map(({ id }) =>
      registerGuideAction(`settings:open-${id}`, () => handleSelect(id)),
    );
    return () => {
      for (const u of unregisters) u();
    };
  }, [registerGuideAction, handleSelect]);

  // Bootstrap: fetch model config + settings + wechat sources
  useEffect(() => {
    (async () => {
      try {
        const [modelsRes, settingsRes] = await Promise.all([
          fetch("/api/models"),
          fetch("/api/settings"),
        ]);
        if (modelsRes.ok) setConfig(await modelsRes.json());
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setApiKeyStatus(data.apiKeyStatus || {});
          if (data.wechatExcludedSourceIds?.length) {
            setWechatExcluded(new Set(data.wechatExcludedSourceIds));
          }
        }
        try {
          const wechatRes = await fetch("/api/wechat/sources");
          if (wechatRes.ok) {
            const sources: WechatSource[] = await wechatRes.json();
            setWechatSources(sources);
          }
        } catch {
          // WeChat DB may not be configured
        } finally {
          setWechatLoading(false);
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error);
        setWechatLoading(false);
      }
    })();
  }, []);

  return (
    <div className="flex h-screen flex-col bg-sf-bg">
      {/* Slim top bar */}
      <header className="border-b border-sf-line bg-sf-surface shrink-0">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center justify-between px-6">
          <Link href="/" className="flex items-center">
            <SparkflowLockup tag={null} size="sm" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] text-[11px] font-bold tracking-[0.14em] uppercase text-sf-ink-2 hover:text-sf-accent hover:bg-sf-bg-alt transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Back
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <SettingsSidebar active={active} onSelect={handleSelect} user={user} />
        <main ref={mainScrollRef} className="flex-1 overflow-y-auto bg-sf-bg">
          <div className="mx-auto max-w-[1040px] px-10 py-10">
            {active === "models" && (
              <AiModelsSection initialSettings={initialSettings} config={config} />
            )}
            {active === "data-sources" && (
              <DataSourcesSection
                sources={wechatSources}
                excluded={wechatExcluded}
                setExcluded={setWechatExcluded}
                loading={wechatLoading}
              />
            )}
            {active === "api-keys" && (
              <ApiKeysSection
                apiKeyStatus={apiKeyStatus}
                setApiKeyStatus={setApiKeyStatus}
              />
            )}
            {active === "account" && <AccountSection user={user} />}
          </div>
        </main>
      </div>
    </div>
  );
}

// ============================================================================
// Sidebar
// ============================================================================

function SettingsSidebar({
  active,
  onSelect,
  user,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
  user: SettingsUser;
}) {
  const initials = user.username
    ? user.username.slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase();
  return (
    <aside className="w-[260px] shrink-0 flex flex-col border-r border-sf-line bg-sf-bg-alt">
      <div className="px-5 pt-6 pb-5">
        <h1 className="text-[17px] font-bold text-sf-ink tracking-tight">Settings</h1>
        <p className="mt-1 text-[12px] text-sf-ink-4">Manage your research preferences</p>
      </div>
      <nav className="flex-1 px-3 flex flex-col gap-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              data-guide={`settings-nav-${id}`}
              onClick={() => onSelect(id)}
              className={`flex items-center gap-3 h-10 px-3 rounded-[8px] text-[13.5px] font-medium transition-colors ${
                isActive
                  ? "bg-sf-black text-white"
                  : "text-sf-ink-2 hover:bg-sf-surface"
              }`}
            >
              <Icon
                className={`h-4 w-4 ${isActive ? "text-white" : "text-sf-ink-3"}`}
                strokeWidth={1.75}
              />
              {label}
            </button>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-sf-line flex items-center gap-3">
        <span className="h-9 w-9 rounded-full bg-sf-accent-soft text-sf-accent-ink flex items-center justify-center text-[11px] font-bold tracking-[0.05em]">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-sf-ink truncate">{user.username || "User"}</p>
          <p className="text-[11px] text-sf-ink-4 truncate font-mono">{user.email}</p>
        </div>
      </div>
    </aside>
  );
}

// ============================================================================
// Shared primitives
// ============================================================================

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-[28px] font-extrabold text-sf-ink tracking-[-0.015em] leading-tight">
        {title}
      </h2>
      <p className="mt-1.5 text-[14px] text-sf-ink-3">{description}</p>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-sf-surface border border-sf-line rounded-[10px] ${className}`}
    >
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[13px] font-semibold text-sf-ink-2 block mb-1.5">{children}</label>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "success" | "warn" | "danger" | "muted";
  children: React.ReactNode;
}) {
  const toneMap = {
    success: "bg-sf-success-soft text-sf-success",
    warn: "bg-sf-warn-soft text-sf-warn",
    danger: "bg-sf-danger-soft text-sf-danger",
    muted: "bg-sf-bg-alt text-sf-ink-3",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-bold uppercase tracking-[0.08em] ${toneMap[tone]}`}
    >
      {tone !== "muted" && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

// ============================================================================
// AI Models section
// ============================================================================

function AiModelsSection({
  initialSettings,
  config,
}: {
  initialSettings?: InitialSettings;
  config: ModelsConfig | null;
}) {
  // Empty string = "not picked yet" (renders as a placeholder).
  // BYOK mandate: Save is disabled until all 8 slots are filled.
  const [chatProvider, setChatProvider] = useState(initialSettings?.modelProvider ?? "");
  const [chatModel, setChatModel] = useState(initialSettings?.modelName ?? "");
  const [wikiProvider, setWikiProvider] = useState(initialSettings?.wikiModelProvider ?? "");
  const [wikiModel, setWikiModel] = useState(initialSettings?.wikiModelName ?? "");
  const [searchProvider, setSearchProvider] = useState(
    initialSettings?.searchModelProvider ?? "",
  );
  const [searchModel, setSearchModel] = useState(initialSettings?.searchModelName ?? "");
  const [matcherProvider, setMatcherProvider] = useState(
    initialSettings?.semopsModelProvider ?? "",
  );
  const [matcherModel, setMatcherModel] = useState(initialSettings?.semopsModelName ?? "");

  const baselineRef = useRef(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const providerOptions = useMemo(() => {
    if (!config) return [];
    return Object.entries(config.providers).map(([id, { label }]) => ({ id, label }));
  }, [config]);

  const getModels = useCallback(
    (providerId: string): ModelInfo[] => config?.providers[providerId]?.models || [],
    [config],
  );

  const getModelIds = useCallback(
    (providerId: string): string[] => getModels(providerId).map((m) => m.id),
    [getModels],
  );

  // Reset model when provider changes
  useEffect(() => {
    const ids = getModelIds(chatProvider);
    if (ids.length > 0 && !ids.includes(chatModel)) setChatModel(ids[0]);
  }, [chatProvider, getModelIds, chatModel]);
  useEffect(() => {
    const ids = getModelIds(wikiProvider);
    if (ids.length > 0 && !ids.includes(wikiModel)) setWikiModel(ids[0]);
  }, [wikiProvider, getModelIds, wikiModel]);
  useEffect(() => {
    const ids = getModelIds(searchProvider);
    if (ids.length > 0 && !ids.includes(searchModel)) setSearchModel(ids[0]);
  }, [searchProvider, getModelIds, searchModel]);
  useEffect(() => {
    const ids = getModelIds(matcherProvider);
    if (ids.length > 0 && !ids.includes(matcherModel)) setMatcherModel(ids[0]);
  }, [matcherProvider, getModelIds, matcherModel]);

  // Normalize null → "" so a never-configured user is NOT treated as dirty
  // and Discard doesn't widen the state to nullable.
  const b = baselineRef.current;
  const isDirty =
    (b?.modelProvider ?? "") !== chatProvider ||
    (b?.modelName ?? "") !== chatModel ||
    (b?.wikiModelProvider ?? "") !== wikiProvider ||
    (b?.wikiModelName ?? "") !== wikiModel ||
    (b?.searchModelProvider ?? "") !== searchProvider ||
    (b?.searchModelName ?? "") !== searchModel ||
    (b?.semopsModelProvider ?? "") !== matcherProvider ||
    (b?.semopsModelName ?? "") !== matcherModel;

  // Save is gated: user must pick all 8 slots (4 provider+model pairs).
  const allPicked =
    !!chatProvider &&
    !!chatModel &&
    !!wikiProvider &&
    !!wikiModel &&
    !!searchProvider &&
    !!searchModel &&
    !!matcherProvider &&
    !!matcherModel;

  const handleDiscard = () => {
    if (!b) return;
    setChatProvider(b.modelProvider ?? "");
    setChatModel(b.modelName ?? "");
    setWikiProvider(b.wikiModelProvider ?? "");
    setWikiModel(b.wikiModelName ?? "");
    setSearchProvider(b.searchModelProvider ?? "");
    setSearchModel(b.searchModelName ?? "");
    setMatcherProvider(b.semopsModelProvider ?? "");
    setMatcherModel(b.semopsModelName ?? "");
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        modelProvider: chatProvider,
        modelName: chatModel,
        wikiModelProvider: wikiProvider,
        wikiModelName: wikiModel,
        searchModelProvider: searchProvider,
        searchModelName: searchModel,
        semopsModelProvider: matcherProvider,
        semopsModelName: matcherModel,
      };
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      baselineRef.current = payload;
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 1800);
    } catch (error) {
      console.error("Failed to save AI Models:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <SectionHeader
        title="AI Models"
        description="Configure default models for different workspace capabilities."
      />

      <div className="flex flex-col gap-6 pb-24">
        <ModelsGroup title="Deepdive" description="Configure the models powering the Deepdive research and synthesis capabilities.">
          <ModelRow
            label="Chat Model"
            description="Used for general conversational interactions and reasoning."
            recommendation={config?.recommendations?.chat}
            providerOptions={providerOptions}
            models={getModels(chatProvider)}
            provider={chatProvider}
            model={chatModel}
            onProviderChange={setChatProvider}
            onModelChange={setChatModel}
          />
          <ModelRow
            label="Wiki Model"
            description="Optimized for long-context generation and document summarization."
            recommendation={config?.recommendations?.wiki}
            providerOptions={providerOptions}
            models={getModels(wikiProvider)}
            provider={wikiProvider}
            model={wikiModel}
            onProviderChange={setWikiProvider}
            onModelChange={setWikiModel}
          />
          <ModelRow
            label="Search Model"
            description="Fast model for query expansion and intent classification."
            recommendation={config?.recommendations?.search}
            providerOptions={providerOptions}
            models={getModels(searchProvider)}
            provider={searchProvider}
            model={searchModel}
            onProviderChange={setSearchProvider}
            onModelChange={setSearchModel}
          />
        </ModelsGroup>

        <ModelsGroup title="Research Hub" description="Configure models used in the Research Hub environment.">
          <ModelRow
            label="Matcher Model"
            description="Used for matching entity relationships and classification tasks."
            recommendation={config?.recommendations?.matcher}
            providerOptions={providerOptions}
            models={getModels(matcherProvider)}
            provider={matcherProvider}
            model={matcherModel}
            onProviderChange={setMatcherProvider}
            onModelChange={setMatcherModel}
          />
        </ModelsGroup>
      </div>

      <SaveFooter
        dirty={isDirty}
        saving={isSaving}
        saved={isSaved}
        label="AI Models"
        onDiscard={handleDiscard}
        onSave={handleSave}
        disabled={!config || !allPicked}
        disabledReason={!allPicked ? "Pick a provider + model for every slot" : undefined}
      />
    </>
  );
}

function ModelsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-sf-line">
        <h3 className="text-[17px] font-bold text-sf-ink tracking-tight">{title}</h3>
        <p className="mt-1 text-[13px] text-sf-ink-3">{description}</p>
      </div>
      <div className="divide-y divide-sf-line">{children}</div>
    </Card>
  );
}

function ModelRow({
  label,
  description,
  recommendation,
  providerOptions,
  models,
  provider,
  model,
  onProviderChange,
  onModelChange,
}: {
  label: string;
  description: string;
  recommendation?: string;
  providerOptions: { id: string; label: string }[];
  models: ModelInfo[];
  provider: string;
  model: string;
  onProviderChange: (v: string) => void;
  onModelChange: (v: string) => void;
}) {
  return (
    <div className="px-6 py-5 grid grid-cols-[1fr_auto] gap-6 items-start">
      <div>
        <p className="text-[14px] font-semibold text-sf-ink">{label}</p>
        <p className="mt-1 text-[12.5px] text-sf-ink-3 max-w-[44ch]">{description}</p>
        {recommendation && (
          <span className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-semibold bg-sf-accent-soft text-sf-accent-ink">
            <Info className="h-3 w-3" strokeWidth={2} />
            Recommended: {recommendation}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 w-[420px]">
        <Select value={provider} onValueChange={onProviderChange}>
          <SelectTrigger className="h-9 rounded-[6px] border-sf-line-strong text-sm bg-sf-surface">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            {providerOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={model}
          onValueChange={onModelChange}
          disabled={!provider || models.length === 0}
        >
          <SelectTrigger className="h-9 rounded-[6px] border-sf-line-strong text-sm bg-sf-surface">
            <SelectValue placeholder={provider ? "Select model" : "Pick provider first"}>
              {model ? models.find((m) => m.id === model)?.label || model : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <div className="flex items-baseline gap-2">
                  <span>{m.label}</span>
                  <span className="text-xs text-sf-ink-4">{m.desc}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function SaveFooter({
  dirty,
  saving,
  saved,
  label,
  onDiscard,
  onSave,
  disabled,
  disabledReason,
}: {
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  label: string;
  onDiscard: () => void;
  onSave: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div
      className={`sticky bottom-0 left-0 right-0 z-10 border-t border-sf-line bg-sf-surface/95 backdrop-blur-md transition-all ${
        dirty ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="mx-auto max-w-[1040px] px-10 py-3 flex items-center justify-between">
        <p className="text-[12px] text-sf-ink-3 font-mono">
          {saved
            ? "Saved"
            : disabled && disabledReason
              ? disabledReason
              : `Unsaved changes in ${label}`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDiscard}
            disabled={saving || !dirty}
            className="h-9 rounded-[8px] border-sf-line-strong text-sf-ink-2 hover:bg-sf-bg-alt"
          >
            Discard
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={disabled || saving || !dirty}
            className="h-9 rounded-[8px] bg-sf-accent hover:bg-sf-accent-ink text-white"
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…
              </>
            ) : saved ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5" /> Saved
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// API Keys section
// ============================================================================

function ApiKeysSection({
  apiKeyStatus,
  setApiKeyStatus,
}: {
  apiKeyStatus: Record<string, ApiKeyStatus>;
  setApiKeyStatus: React.Dispatch<React.SetStateAction<Record<string, ApiKeyStatus>>>;
}) {
  return (
    <>
      <SectionHeader
        title="Bring Your Own Key"
        description="Connect your preferred AI model providers by securely adding your API keys below. SparkFlow never stores your keys in plain text."
      />

      <div data-guide="api-keys-section" className="mb-6">
        <div className="rounded-[10px] bg-sf-accent-soft border-l-4 border-sf-accent px-4 py-2 flex items-center gap-3">
          <Info className="h-4 w-4 text-sf-accent-ink shrink-0" strokeWidth={2} />
          <p className="text-[12.5px] text-sf-accent-ink">
            <span className="font-bold">Security Notice</span>
            <span className="mx-2 text-sf-accent-ink/50">·</span>
            <span className="text-sf-accent-ink/80">Keys are encrypted at rest using AES-256.</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-4">
        {API_KEY_PROVIDERS.map((provider) => (
          <div key={provider.id} data-guide={provider.id === "openai" ? "provider-card-openai" : undefined}>
          <ProviderKeyCard
            provider={provider}
            status={apiKeyStatus[provider.id]}
            onSaved={async () => {
              const res = await fetch("/api/settings");
              if (res.ok) {
                const data = await res.json();
                setApiKeyStatus(data.apiKeyStatus || {});
              }
            }}
            onRemoved={() => {
              setApiKeyStatus((prev) => {
                const next = { ...prev };
                delete next[provider.id];
                return next;
              });
            }}
          />
          </div>
        ))}
      </div>

      <CustomEndpointsSection
        apiKeyStatus={apiKeyStatus}
        setApiKeyStatus={setApiKeyStatus}
      />
    </>
  );
}

// ============================================================================
// Custom endpoints — any OpenAI-compatible provider (vLLM, Ollama, self-host)
// ============================================================================

interface CustomEndpointDraft {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
}

function CustomEndpointsSection({
  apiKeyStatus,
  setApiKeyStatus,
}: {
  apiKeyStatus: Record<string, ApiKeyStatus>;
  setApiKeyStatus: React.Dispatch<React.SetStateAction<Record<string, ApiKeyStatus>>>;
}) {
  // Existing endpoints come from the server — filter apiKeyStatus by id prefix.
  const saved = useMemo(() => {
    return Object.entries(apiKeyStatus)
      .filter(([id]) => id.startsWith(CUSTOM_PROVIDER_PREFIX))
      .map(([id, status]) => ({ id, ...status }));
  }, [apiKeyStatus]);

  // Drafts = not-yet-saved entries the user added via "+ Add".
  const [drafts, setDrafts] = useState<CustomEndpointDraft[]>([]);

  async function refreshStatus() {
    const res = await fetch("/api/settings");
    if (res.ok) {
      const data = await res.json();
      setApiKeyStatus(data.apiKeyStatus || {});
    }
  }

  return (
    <div className="mt-10">
      <div className="mb-4">
        <h3 className="text-[17px] font-bold text-sf-ink tracking-tight">Custom Endpoints</h3>
        <p className="mt-1 text-[13px] text-sf-ink-3">
          Connect any OpenAI-compatible provider — vLLM, Ollama, or self-hosted. Add as many as you need.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-4">
        {saved.map((entry) => (
          <CustomEndpointCard
            key={entry.id}
            initialId={entry.id}
            initialLabel={entry.label ?? ""}
            initialBaseUrl={entry.baseUrl ?? ""}
            maskedKey={entry.maskedKey}
            onSaved={refreshStatus}
            onRemoved={() => {
              setApiKeyStatus((prev) => {
                const next = { ...prev };
                delete next[entry.id];
                return next;
              });
            }}
          />
        ))}
        {drafts.map((draft) => (
          <CustomEndpointCard
            key={draft.id}
            initialId={draft.id}
            initialLabel={draft.label}
            initialBaseUrl={draft.baseUrl}
            maskedKey={null}
            startInEditing
            onSaved={async () => {
              setDrafts((d) => d.filter((x) => x.id !== draft.id));
              await refreshStatus();
            }}
            onRemoved={() => {
              setDrafts((d) => d.filter((x) => x.id !== draft.id));
            }}
          />
        ))}
      </div>

      <Button
        variant="outline"
        className="h-9 rounded-[6px] border-sf-line-strong text-sf-ink-2 hover:bg-sf-bg-alt gap-2"
        onClick={() => {
          setDrafts((d) => [
            ...d,
            { id: `${CUSTOM_PROVIDER_PREFIX}${uuidv4()}`, label: "", baseUrl: "", apiKey: "" },
          ]);
        }}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
        Add custom endpoint
      </Button>
    </div>
  );
}

function CustomEndpointCard({
  initialId,
  initialLabel,
  initialBaseUrl,
  maskedKey,
  startInEditing = false,
  onSaved,
  onRemoved,
}: {
  initialId: string;
  initialLabel: string;
  initialBaseUrl: string;
  maskedKey: string | null;
  startInEditing?: boolean;
  onSaved: () => void | Promise<void>;
  onRemoved: () => void;
}) {
  const [editing, setEditing] = useState(startInEditing);
  const [label, setLabel] = useState(initialLabel);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasKey = maskedKey !== null;

  async function handleSave() {
    if (!label.trim() || !baseUrl.trim() || !apiKey.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKeys: {
            [initialId]: {
              apiKey: apiKey.trim(),
              baseUrl: baseUrl.trim(),
              label: label.trim(),
            },
          },
        }),
      });
      if (res.ok) {
        setApiKey("");
        setEditing(false);
        await onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKeys: { [initialId]: null } }),
      });
      if (res.ok) onRemoved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5 gap-3">
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Endpoint name (e.g. Local Ollama)"
            className="h-8 rounded-[6px] border-sf-line-strong text-sm font-semibold"
          />
        ) : (
          <h4 className="text-[15px] font-bold text-sf-ink truncate">{label || "Custom endpoint"}</h4>
        )}
        {hasKey ? <StatusBadge tone="success">Configured</StatusBadge> : null}
      </div>

      <FieldLabel>Base URL</FieldLabel>
      {editing ? (
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://localhost:11434/v1"
          className="h-9 rounded-[6px] border-sf-line-strong text-[12px] font-mono"
        />
      ) : (
        <div className="h-9 rounded-[6px] border border-sf-line-strong bg-sf-surface-muted px-3 flex items-center font-mono text-[12px] text-sf-ink-3 truncate">
          {baseUrl || "—"}
        </div>
      )}

      <FieldLabel>API Key</FieldLabel>
      {editing || !hasKey ? (
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="h-9 rounded-[6px] border-sf-line-strong pr-9 font-mono text-[12px]"
          />
          <button
            type="button"
            aria-label="Toggle key visibility"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-sf-ink-4 hover:text-sf-ink"
            onClick={() => setShowKey((v) => !v)}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      ) : (
        <div className="h-9 rounded-[6px] border border-sf-line-strong bg-sf-surface-muted px-3 flex items-center font-mono text-[12px] text-sf-ink-3 truncate">
          {maskedKey}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        {editing ? (
          <>
            <Button
              variant="outline"
              className="h-8 rounded-[6px] border-sf-line-strong text-sf-ink-2 hover:bg-sf-bg-alt text-xs"
              onClick={() => (hasKey ? setEditing(false) : onRemoved())}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="h-8 rounded-[6px] bg-sf-accent hover:bg-sf-accent-ink text-white text-xs"
              onClick={handleSave}
              disabled={saving || !label.trim() || !baseUrl.trim() || !apiKey.trim()}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              className="h-8 rounded-[6px] border-sf-line-strong text-sf-ink-2 hover:bg-sf-bg-alt text-xs"
              onClick={handleRemove}
              disabled={saving}
            >
              Remove
            </Button>
            <Button
              variant="outline"
              className="h-8 rounded-[6px] border-sf-line-strong text-sf-ink-2 hover:bg-sf-bg-alt text-xs"
              onClick={() => setEditing(true)}
              disabled={saving}
            >
              Edit
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function ProviderKeyCard({
  provider,
  status,
  onSaved,
  onRemoved,
}: {
  provider: (typeof API_KEY_PROVIDERS)[number];
  status: ApiKeyStatus | undefined;
  onSaved: () => Promise<void>;
  onRemoved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasKey = status?.hasKey;

  const handleSave = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKeys: {
            [provider.id]: {
              apiKey: keyInput.trim(),
              ...(provider.id === "custom" && baseUrlInput.trim()
                ? { baseUrl: baseUrlInput.trim() }
                : {}),
            },
          },
        }),
      });
      if (!res.ok) throw new Error("save failed");
      await onSaved();
      setEditing(false);
      setKeyInput("");
      setBaseUrlInput("");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKeys: { [provider.id]: null } }),
      });
      onRemoved();
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    if (!status?.maskedKey) return;
    void navigator.clipboard.writeText(status.maskedKey);
  };

  const providerMark = provider.label.charAt(0).toUpperCase();

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-9 h-9 rounded-[8px] bg-sf-bg-alt border border-sf-line flex items-center justify-center text-sf-ink text-sm font-extrabold">
            {providerMark}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-sf-ink truncate">{provider.label}</p>
            <p className="mt-0.5 text-[12px] text-sf-ink-4 truncate">{provider.description}</p>
          </div>
        </div>
        {hasKey ? (
          <StatusBadge tone="success">Active</StatusBadge>
        ) : (
          <StatusBadge tone="warn">Missing</StatusBadge>
        )}
      </div>

      <FieldLabel>API Key</FieldLabel>
      {editing || !hasKey ? (
        <div className="flex items-stretch gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? "text" : "password"}
              placeholder={provider.placeholder}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="h-9 rounded-[6px] border-sf-line-strong pr-9 font-mono text-[12px]"
              autoFocus
            />
            <button
              type="button"
              aria-label="Toggle key visibility"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-sf-ink-4 hover:text-sf-ink"
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-stretch gap-2">
          <div className="flex-1 h-9 rounded-[6px] border border-sf-line-strong bg-sf-surface-muted px-3 flex items-center font-mono text-[12px] text-sf-ink-3 truncate">
            {status?.maskedKey || "••••••••••••••••"}
          </div>
          <button
            type="button"
            className="h-9 w-9 rounded-[6px] border border-sf-line-strong hover:bg-sf-bg-alt text-sf-ink-3 flex items-center justify-center"
            onClick={handleCopy}
            title="Copy"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {provider.id === "custom" && (editing || !hasKey) && (
        <div className="mt-3">
          <FieldLabel>Base URL</FieldLabel>
          <Input
            type="url"
            placeholder="https://api.example.com/v1"
            value={baseUrlInput}
            onChange={(e) => setBaseUrlInput(e.target.value)}
            className="h-9 rounded-[6px] border-sf-line-strong text-[12px]"
          />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-[11px] text-sf-ink-4 font-mono">
          {hasKey && !editing ? "Last used: recently" : "Not configured"}
        </p>
        <div className="flex items-center gap-2">
          {editing || !hasKey ? (
            <>
              {editing && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setKeyInput("");
                    setShowKey(false);
                  }}
                  className="h-8 rounded-[6px]"
                >
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !keyInput.trim()}
                className="h-8 rounded-[6px] bg-sf-accent hover:bg-sf-accent-ink text-white"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Key"}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(true);
                  setKeyInput("");
                  setShowKey(false);
                }}
                className="h-8 rounded-[6px] border-sf-line-strong text-sf-ink-2 hover:bg-sf-bg-alt"
              >
                Update Key
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRemove}
                disabled={saving}
                className="h-8 rounded-[6px] text-sf-danger hover:text-sf-danger hover:bg-sf-danger-soft"
              >
                Remove
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// Data Sources section
// ============================================================================

function DataSourcesSection({
  sources,
  excluded,
  setExcluded,
  loading,
}: {
  sources: WechatSource[];
  excluded: Set<number>;
  setExcluded: React.Dispatch<React.SetStateAction<Set<number>>>;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return sources;
    const q = query.toLowerCase();
    return sources.filter(
      (s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q),
    );
  }, [sources, query]);

  const selectedCount = sources.length - excluded.size;
  const allSelected = excluded.size === 0;

  const toggle = (id: number) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setExcluded(new Set(sources.map((s) => s.id)));
    } else {
      setExcluded(new Set());
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wechatExcludedSourceIds: Array.from(excluded) }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SectionHeader
        title="Data Sources"
        description="Configure external platforms and accounts to index for search."
      />

      <Card className="overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-sf-line flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-[8px] bg-sf-accent text-white flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M14 8a6 6 0 1 0 4.5 9.9l2.3 1.3-1.3-2.3A6 6 0 0 0 14 8Zm-4 5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2ZM9 4a8 8 0 0 0-5 14.3l-.8 2.7 3-1a8 8 0 0 0 2.7.8 7 7 0 0 1 .7-2.3A6 6 0 1 1 14.3 6.2 7 7 0 0 1 16.5 6 8 8 0 0 0 9 4Z" />
              </svg>
            </span>
            <div>
              <h3 className="text-[16px] font-bold text-sf-ink tracking-tight">WeChat Sources</h3>
              <p className="mt-0.5 text-[13px] text-sf-ink-3">
                Select official WeChat accounts to include in your data index.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-[6px] border-sf-line-strong text-sf-ink-2 hover:bg-sf-bg-alt"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
            Sync Accounts
          </Button>
        </div>

        <div className="px-6 py-4 flex items-center justify-between gap-4 border-b border-sf-line">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sf-ink-4" />
            <Input
              placeholder="Search accounts..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-9 rounded-[6px] border-sf-line-strong text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-sf-ink-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded-[3px] border-sf-line-strong accent-sf-accent"
            />
            <span>
              Select All <span className="font-mono tabular-nums text-sf-ink-3">({sources.length})</span>
            </span>
          </label>
        </div>

        {loading ? (
          <div className="px-6 py-10 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-sf-ink-4" />
            <span className="text-sm text-sf-ink-4">Loading sources…</span>
          </div>
        ) : sources.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-sf-ink-3">No WeChat sources available.</p>
            <p className="mt-1 text-xs text-sf-ink-4">
              Configure a WeChat database in your environment to see entries here.
            </p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-[auto_2fr_1.2fr_auto_auto] gap-4 px-6 py-3 border-b border-sf-line text-[11px] font-bold uppercase tracking-[0.12em] text-sf-ink-4">
              <span className="w-5" aria-hidden />
              <span>Account Name</span>
              <span>WeChat ID</span>
              <span>Status</span>
              <span className="text-right">Last Synced</span>
            </div>
            <div className="divide-y divide-sf-line">
              {filtered.map((source) => {
                const isIncluded = !excluded.has(source.id);
                const initials = source.name.slice(0, 2).toUpperCase();
                return (
                  <label
                    key={source.id}
                    className="grid grid-cols-[auto_2fr_1.2fr_auto_auto] gap-4 px-6 py-3 items-center cursor-pointer hover:bg-sf-bg-alt transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isIncluded}
                      onChange={() => toggle(source.id)}
                      className="h-4 w-4 rounded-[3px] border-sf-line-strong accent-sf-accent"
                    />
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-7 h-7 rounded-full bg-sf-accent-soft text-sf-accent-ink flex items-center justify-center text-[10px] font-bold shrink-0">
                        {initials}
                      </span>
                      <span className="text-sm font-semibold text-sf-ink truncate">
                        {source.name}
                      </span>
                    </div>
                    <span className="text-[12.5px] font-mono text-sf-ink-3 truncate">
                      {source.slug}
                    </span>
                    {isIncluded ? (
                      <StatusBadge tone="success">Active</StatusBadge>
                    ) : (
                      <StatusBadge tone="muted">Inactive</StatusBadge>
                    )}
                    <span className="text-[11px] font-mono text-sf-ink-4 text-right">—</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-t border-sf-line flex items-center justify-between">
          <p className="text-[12px] text-sf-ink-3 font-mono tabular-nums">
            {selectedCount} accounts selected for indexing
          </p>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="h-9 rounded-[6px] bg-sf-accent hover:bg-sf-accent-ink text-white"
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…
              </>
            ) : saved ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5" /> Saved
              </>
            ) : (
              "Save Configuration"
            )}
          </Button>
        </div>
      </Card>
    </>
  );
}

// ============================================================================
// Account section
// ============================================================================

function AccountSection({ user }: { user: SettingsUser }) {
  const [firstName, setFirstName] = useState(user.username || "");
  const [lastName, setLastName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [updatingPw, setUpdatingPw] = useState(false);

  const initials = user.username
    ? user.username.slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    // Backend endpoint not wired yet; UI-only for now.
    await new Promise((r) => setTimeout(r, 400));
    setSavingProfile(false);
  };

  const handleUpdatePw = async () => {
    if (!newPw || newPw !== confirmPw) return;
    setUpdatingPw(true);
    await new Promise((r) => setTimeout(r, 400));
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setUpdatingPw(false);
  };

  return (
    <>
      <SectionHeader
        title="Account"
        description="Manage your profile and security settings."
      />

      <Card className="overflow-hidden mb-6">
        <div className="px-6 pt-5 pb-4 border-b border-sf-line">
          <h3 className="text-[16px] font-bold text-sf-ink">Profile Information</h3>
          <p className="mt-0.5 text-[13px] text-sf-ink-3">
            Update your personal details and public profile.
          </p>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="flex items-center gap-4">
            <span className="h-14 w-14 rounded-full bg-sf-accent-soft text-sf-accent-ink flex items-center justify-center text-lg font-bold">
              {initials}
            </span>
            <div className="flex items-center gap-2">
              <Button className="h-9 rounded-[6px] bg-sf-black text-white hover:opacity-90">
                Change Avatar
              </Button>
              <Button
                variant="outline"
                className="h-9 rounded-[6px] border-sf-line-strong text-sf-ink-2 hover:bg-sf-bg-alt"
              >
                Remove
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel>First Name</FieldLabel>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="h-9 rounded-[6px] border-sf-line-strong"
              />
            </div>
            <div>
              <FieldLabel>Last Name</FieldLabel>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="h-9 rounded-[6px] border-sf-line-strong"
              />
            </div>
          </div>

          <div>
            <FieldLabel>Email Address</FieldLabel>
            <Input
              value={user.email}
              disabled
              className="h-9 rounded-[6px] border-sf-line-strong bg-sf-surface-muted text-sf-ink-3"
            />
            <p className="mt-1.5 text-[12px] text-sf-ink-4">
              To change your email, please contact support.
            </p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-sf-line flex justify-end">
          <Button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="h-9 rounded-[6px] bg-sf-accent hover:bg-sf-accent-ink text-white"
          >
            {savingProfile ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-sf-line">
          <h3 className="text-[16px] font-bold text-sf-ink">Security</h3>
          <p className="mt-0.5 text-[13px] text-sf-ink-3">
            Update your password and secure your account.
          </p>
        </div>
        <div className="px-6 py-5 space-y-5 max-w-lg">
          <div>
            <FieldLabel>Current Password</FieldLabel>
            <Input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="h-9 rounded-[6px] border-sf-line-strong"
            />
          </div>
          <div>
            <FieldLabel>New Password</FieldLabel>
            <Input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="h-9 rounded-[6px] border-sf-line-strong"
            />
            <p className="mt-1.5 text-[12px] text-sf-ink-4">
              Must be at least 8 characters long and contain a number or symbol.
            </p>
          </div>
          <div>
            <FieldLabel>Confirm New Password</FieldLabel>
            <Input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="h-9 rounded-[6px] border-sf-line-strong"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-sf-line flex justify-end">
          <Button
            onClick={handleUpdatePw}
            disabled={updatingPw || !newPw || newPw !== confirmPw || !currentPw}
            className="h-9 rounded-[6px] bg-sf-black text-white hover:opacity-90"
          >
            {updatingPw ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Updating…
              </>
            ) : (
              "Update Password"
            )}
          </Button>
        </div>
      </Card>
    </>
  );
}
