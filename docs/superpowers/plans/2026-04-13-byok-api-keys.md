# BYOK (Bring Your Own API Key) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to store encrypted LLM API keys and use them for wiki generation and agent chat, with admin-only fallback to system env keys.

**Architecture:** Encrypted JSON blob in UserSettings (Prisma), AES-256-GCM encryption via `API_KEY_ENCRYPTION_SECRET` env var, key resolution helper used by graph-service and chat. Frontend fetches resolved key for the active provider and passes it to the LangGraph agent via the existing `context` object.

**Tech Stack:** Next.js 16, Prisma, Node.js `crypto` module, React, shadcn/ui

---

## File Structure

| File | Responsibility |
|------|---------------|
| `lib/crypto.ts` | **New** — AES-256-GCM encrypt/decrypt utilities |
| `lib/services/api-key-resolver.ts` | **New** — resolve user's API key for a provider (DB lookup + decrypt + admin fallback) |
| `lib/types/providers.ts` | **New** — provider definitions with preset base URLs |
| `prisma/schema.prisma` | **Modify** — add `apiKeys` field to UserSettings |
| `app/api/settings/route.ts` | **Modify** — extend GET (key status) and POST (key storage) |
| `app/api/settings/resolve-key/route.ts` | **New** — GET endpoint that returns decrypted key for the user's active provider |
| `components/settings/settings-form.tsx` | **Modify** — add API key management section |
| `lib/services/graph-service.ts` | **Modify** — accept userId, use resolved key for OpenAI client |
| `lib/services/wiki-ingest.ts` | **Modify** — pass userId through to graph-service |
| `lib/actions/sources.ts` | **Modify** — pass userId to wiki ingest |
| `components/deepdive/chat/chat-panel.tsx` | **Modify** — fetch resolved key and pass to agent context |

---

### Task 1: Provider Definitions and Crypto Utilities

**Files:**
- Create: `lib/types/providers.ts`
- Create: `lib/crypto.ts`

- [ ] **Step 1: Create provider definitions**

```ts
// lib/types/providers.ts

export interface ProviderConfig {
  id: string;
  label: string;
  baseUrl?: string;     // undefined for Gemini (uses Google SDK)
  sdkType: "openai-compatible" | "google";
}

export const PROVIDERS: ProviderConfig[] = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", sdkType: "openai-compatible" },
  { id: "gemini", label: "Gemini", sdkType: "google" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", sdkType: "openai-compatible" },
  { id: "glm", label: "GLM (Zhipu)", baseUrl: "https://open.bigmodel.cn/api/paas/v4", sdkType: "openai-compatible" },
  { id: "minimax", label: "Minimax", baseUrl: "https://api.minimax.chat/v1", sdkType: "openai-compatible" },
  { id: "kimi", label: "Kimi (Moonshot)", baseUrl: "https://api.moonshot.cn/v1", sdkType: "openai-compatible" },
  { id: "custom", label: "Custom", sdkType: "openai-compatible" },
];

export const PROVIDER_MAP = new Map(PROVIDERS.map((p) => [p.id, p]));

export interface StoredApiKeys {
  [providerId: string]: {
    apiKey: string;
    baseUrl?: string; // only for "custom"
  };
}

export interface ApiKeyStatus {
  [providerId: string]: {
    hasKey: boolean;
    maskedKey: string; // e.g. "sk-...abc1"
  };
}
```

- [ ] **Step 2: Create crypto utilities**

```ts
// lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("API_KEY_ENCRYPTION_SECRET is not configured");
  }
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivB64, authTagB64, encryptedB64] = ciphertext.split(":");
  if (!ivB64 || !authTagB64 || !encryptedB64) {
    throw new Error("Invalid encrypted format");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/types/providers.ts lib/crypto.ts
git commit -m "feat: add provider definitions and crypto utilities for BYOK"
```

---

### Task 2: Prisma Schema and API Key Resolver

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/services/api-key-resolver.ts`

- [ ] **Step 1: Add apiKeys field to UserSettings**

In `prisma/schema.prisma`, add to the `UserSettings` model (after `matcherModelName`):

```prisma
  // BYOK — encrypted JSON blob of API keys per provider
  apiKeys             String?  @db.Text
```

- [ ] **Step 2: Run Prisma generate and push**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npx prisma generate && npx prisma db push`

- [ ] **Step 3: Create API key resolver**

```ts
// lib/services/api-key-resolver.ts
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { PROVIDER_MAP } from "@/lib/types/providers";
import type { StoredApiKeys } from "@/lib/types/providers";

export interface ResolvedKey {
  apiKey: string;
  baseUrl?: string;
}

// System-level env key mapping for admin fallback
const SYSTEM_KEY_MAP: Record<string, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GOOGLE_API_KEY,
  deepseek: process.env.DEEPSEEK_API_KEY,
  glm: process.env.GLM_API_KEY,
  minimax: process.env.MINIMAX_API_KEY,
  kimi: process.env.KIMI_API_KEY,
};

export async function resolveApiKey(
  userId: string,
  providerId: string,
): Promise<ResolvedKey> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { apiKeys: true, user: { select: { role: true } } },
  });

  // Try user's own key first
  if (settings?.apiKeys) {
    try {
      const decrypted = decrypt(settings.apiKeys);
      const keys: StoredApiKeys = JSON.parse(decrypted);
      const providerKey = keys[providerId];
      if (providerKey?.apiKey) {
        const provider = PROVIDER_MAP.get(providerId);
        return {
          apiKey: providerKey.apiKey,
          baseUrl: providerKey.baseUrl || provider?.baseUrl,
        };
      }
    } catch (err) {
      console.error("[resolveApiKey] Failed to decrypt:", err);
    }
  }

  // Admin fallback to system env key
  if (settings?.user?.role === "ADMIN") {
    const systemKey = SYSTEM_KEY_MAP[providerId];
    if (systemKey) {
      const provider = PROVIDER_MAP.get(providerId);
      return {
        apiKey: systemKey,
        baseUrl: provider?.baseUrl,
      };
    }
  }

  throw new Error(
    `API key not configured for ${PROVIDER_MAP.get(providerId)?.label || providerId}. Please set your API key in Settings.`
  );
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 3) + "..." + key.slice(-4);
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma lib/services/api-key-resolver.ts
git commit -m "feat: add apiKeys to schema and API key resolver service"
```

---

### Task 3: Extend Settings API

**Files:**
- Modify: `app/api/settings/route.ts`
- Create: `app/api/settings/resolve-key/route.ts`

- [ ] **Step 1: Extend GET to return key status**

Replace the full `app/api/settings/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { maskApiKey } from "@/lib/services/api-key-resolver";
import type { StoredApiKeys, ApiKeyStatus } from "@/lib/types/providers";

// Helper to get available models from env
function getAvailableModels() {
  const openaiModels = (process.env.OPENAI_MODELS || "gpt-4o-mini,gpt-4.1,gpt-5.2")
    .split(",")
    .map((m) => m.trim());

  const googleModels = (process.env.GOOGLE_MODELS || "gemini-2.5-flash,gemini-2.5-pro,gemini-1.5-flash")
    .split(",")
    .map((m) => m.trim());

  return { openai: openaiModels, google: googleModels };
}

// Helper to get defaults from env
function getDefaults() {
  return {
    provider: process.env.DEFAULT_MODEL_PROVIDER || "google",
    model: process.env.DEFAULT_MODEL_NAME || "gemini-2.5-flash",
  };
}

// GET /api/settings
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: {
      modelProvider: true,
      modelName: true,
      matcherModelProvider: true,
      matcherModelName: true,
      apiKeys: true,
    },
  });

  // Build API key status (never return actual keys)
  let apiKeyStatus: ApiKeyStatus = {};
  if (settings?.apiKeys) {
    try {
      const decrypted = decrypt(settings.apiKeys);
      const keys: StoredApiKeys = JSON.parse(decrypted);
      for (const [providerId, entry] of Object.entries(keys)) {
        apiKeyStatus[providerId] = {
          hasKey: true,
          maskedKey: maskApiKey(entry.apiKey),
        };
      }
    } catch {
      // Decryption failed — treat as no keys
    }
  }

  const defaults = getDefaults();
  return NextResponse.json({
    modelProvider: settings?.modelProvider || defaults.provider,
    modelName: settings?.modelName || defaults.model,
    matcherModelProvider: settings?.matcherModelProvider || defaults.provider,
    matcherModelName: settings?.matcherModelName || defaults.model,
    apiKeyStatus,
  });
}

// POST /api/settings
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    modelProvider,
    modelName,
    matcherModelProvider,
    matcherModelName,
    apiKeys: apiKeysUpdate,
  } = body;

  // Validate providers (relaxed — allow any provider ID now for BYOK)
  const availableModels = getAvailableModels();

  if (modelProvider && modelName) {
    const validModels = availableModels[modelProvider as keyof typeof availableModels];
    if (validModels && !validModels.includes(modelName)) {
      return NextResponse.json(
        { error: `Invalid model name. Available: ${validModels.join(", ")}` },
        { status: 400 }
      );
    }
  }

  if (matcherModelProvider && matcherModelName) {
    const validModels = availableModels[matcherModelProvider as keyof typeof availableModels];
    if (validModels && !validModels.includes(matcherModelName)) {
      return NextResponse.json(
        { error: `Invalid matcher model name. Available: ${validModels.join(", ")}` },
        { status: 400 }
      );
    }
  }

  // Build update data
  const updateData: Record<string, string | null> = {};
  if (modelProvider) updateData.modelProvider = modelProvider;
  if (modelName) updateData.modelName = modelName;
  if (matcherModelProvider) updateData.matcherModelProvider = matcherModelProvider;
  if (matcherModelName) updateData.matcherModelName = matcherModelName;

  // Handle API keys update
  if (apiKeysUpdate && typeof apiKeysUpdate === "object") {
    // Read existing keys
    const existing = await prisma.userSettings.findUnique({
      where: { userId: session.user.id },
      select: { apiKeys: true },
    });

    let currentKeys: StoredApiKeys = {};
    if (existing?.apiKeys) {
      try {
        currentKeys = JSON.parse(decrypt(existing.apiKeys));
      } catch {
        // Corrupted — start fresh
      }
    }

    // Merge updates
    for (const [providerId, value] of Object.entries(apiKeysUpdate)) {
      if (value === null) {
        delete currentKeys[providerId];
      } else if (typeof value === "object" && value !== null) {
        const entry = value as { apiKey?: string; baseUrl?: string };
        if (entry.apiKey) {
          currentKeys[providerId] = {
            apiKey: entry.apiKey,
            ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : {}),
          };
        }
      }
    }

    // Re-encrypt and store
    if (Object.keys(currentKeys).length > 0) {
      updateData.apiKeys = encrypt(JSON.stringify(currentKeys));
    } else {
      updateData.apiKeys = null;
    }
  }

  const settings = await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    update: updateData,
    create: {
      userId: session.user.id,
      modelProvider: modelProvider || "google",
      modelName: modelName || "gemini-2.5-flash",
      matcherModelProvider: matcherModelProvider || "google",
      matcherModelName: matcherModelName || "gemini-2.5-flash",
      ...(updateData.apiKeys ? { apiKeys: updateData.apiKeys as string } : {}),
    },
  });

  return NextResponse.json({
    modelProvider: settings.modelProvider,
    modelName: settings.modelName,
    matcherModelProvider: settings.matcherModelProvider,
    matcherModelName: settings.matcherModelName,
  });
}
```

- [ ] **Step 2: Create resolve-key endpoint**

This endpoint returns the decrypted API key for the user's active provider. Used by the chat panel to pass to the agent.

```ts
// app/api/settings/resolve-key/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveApiKey } from "@/lib/services/api-key-resolver";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providerId = req.nextUrl.searchParams.get("provider");
  if (!providerId) {
    return NextResponse.json({ error: "Provider is required" }, { status: 400 });
  }

  try {
    const resolved = await resolveApiKey(session.user.id, providerId);
    return NextResponse.json(resolved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Key not found" },
      { status: 404 }
    );
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add app/api/settings/route.ts app/api/settings/resolve-key/route.ts
git commit -m "feat: extend settings API with BYOK key storage and resolve endpoint"
```

---

### Task 4: Settings Form UI — API Key Section

**Files:**
- Modify: `components/settings/settings-form.tsx`

- [ ] **Step 1: Extend the settings form with API key management**

Add imports and state, then add a new section after the Matcher Model section. The key changes:

1. Add `apiKeyStatus` to the fetched settings state
2. Add per-provider key input with set/update/remove flow
3. For "custom" provider, add base URL input

In `components/settings/settings-form.tsx`, add after the existing imports:

```ts
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Trash2, Key } from "lucide-react";
```

Add to the `UserSettings` interface:

```ts
interface UserSettings {
  modelProvider: string;
  modelName: string;
  matcherModelProvider: string;
  matcherModelName: string;
  apiKeyStatus?: Record<string, { hasKey: boolean; maskedKey: string }>;
}
```

Add state variables inside `SettingsForm`:

```ts
const [editingProvider, setEditingProvider] = useState<string | null>(null);
const [keyInput, setKeyInput] = useState("");
const [baseUrlInput, setBaseUrlInput] = useState("");
const [showKey, setShowKey] = useState(false);
const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, { hasKey: boolean; maskedKey: string }>>({});
const [keySaving, setKeySaving] = useState(false);
```

Update the `fetchModels` effect to also load `apiKeyStatus` from the settings response:

```ts
// In the existing useEffect that fetches settings, after setModelSettings:
// Add to the fetch callback in the settings page or pass through props
```

Actually, add a new useEffect to fetch settings with key status:

```ts
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
```

Add handler functions:

```ts
const PROVIDERS_LIST = [
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Gemini" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "glm", label: "GLM (Zhipu)" },
  { id: "minimax", label: "Minimax" },
  { id: "kimi", label: "Kimi (Moonshot)" },
  { id: "custom", label: "Custom" },
];

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

    // Refresh key status
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
```

Add JSX after the Matcher Model section and before the Save button:

```tsx
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Visual test**

Run: `npm run dev`
Navigate to Settings page. Verify:
- API Keys section renders below model selection
- "Set Key" button shows for providers without keys
- Entering and saving a key shows masked key
- Update and Remove work
- Custom provider shows base URL input

- [ ] **Step 4: Commit**

```bash
git add components/settings/settings-form.tsx
git commit -m "feat: add API key management UI to settings form"
```

---

### Task 5: Integrate BYOK into Wiki Generation

**Files:**
- Modify: `lib/services/graph-service.ts`
- Modify: `lib/services/wiki-ingest.ts`
- Modify: `lib/actions/sources.ts`

- [ ] **Step 1: Update graph-service to accept userId and resolve key**

In `lib/services/graph-service.ts`, update `extractGraph` (line 49):

Change:
```ts
export async function extractGraph(
  sourceContent: string,
  sourceTitle: string,
  sourceId: string,
  existingNodeLabels: string[]
): Promise<ExtractionResult> {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI();
```

To:
```ts
export async function extractGraph(
  sourceContent: string,
  sourceTitle: string,
  sourceId: string,
  existingNodeLabels: string[],
  userId?: string
): Promise<ExtractionResult> {
  const { default: OpenAI } = await import("openai");
  let openaiConfig: { apiKey?: string; baseURL?: string } = {};
  if (userId) {
    try {
      const { resolveApiKey } = await import("@/lib/services/api-key-resolver");
      const resolved = await resolveApiKey(userId, "openai");
      openaiConfig = { apiKey: resolved.apiKey, baseURL: resolved.baseUrl };
    } catch {
      // Fall through to default (will fail for non-admin)
    }
  }
  const openai = new OpenAI(openaiConfig);
```

Apply the same pattern to `generateWikiPages` (line 240):

Change:
```ts
export async function generateWikiPages(
  notebookId: string,
  graphData: GraphData,
  communities: CommunityMap
): Promise<string[]> {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI();
```

To:
```ts
export async function generateWikiPages(
  notebookId: string,
  graphData: GraphData,
  communities: CommunityMap,
  userId?: string
): Promise<string[]> {
  const { default: OpenAI } = await import("openai");
  let openaiConfig: { apiKey?: string; baseURL?: string } = {};
  if (userId) {
    try {
      const { resolveApiKey } = await import("@/lib/services/api-key-resolver");
      const resolved = await resolveApiKey(userId, "openai");
      openaiConfig = { apiKey: resolved.apiKey, baseURL: resolved.baseUrl };
    } catch {
      // Fall through to default
    }
  }
  const openai = new OpenAI(openaiConfig);
```

And `integrateWikiPage` (line 355) — same pattern, add `userId?: string` parameter and resolve key.

Also update `runGraphPipeline` to accept and pass through `userId`:

Find `runGraphPipeline` and add `userId?: string` to its signature. Pass it to `extractGraph`, `generateWikiPages`, and `integrateWikiPage` calls within.

- [ ] **Step 2: Update wiki-ingest.ts to pass userId**

In `lib/services/wiki-ingest.ts`, update `ingestSourceToWiki`:

Change:
```ts
export async function ingestSourceToWiki(
  notebookId: string,
  sourceId: string
): Promise<{ pagesWritten: number; pages: string[] }> {
```

To:
```ts
export async function ingestSourceToWiki(
  notebookId: string,
  sourceId: string,
  userId?: string
): Promise<{ pagesWritten: number; pages: string[] }> {
```

And pass `userId` to `runGraphPipeline`:

Change:
```ts
const result = await runGraphPipeline(notebookId, sourceId, content, source.title);
```

To:
```ts
const result = await runGraphPipeline(notebookId, sourceId, content, source.title, userId);
```

- [ ] **Step 3: Update sources.ts to pass userId to wiki ingest**

In `lib/actions/sources.ts`, the `addWebpageSource`, `addPublicationSource`, and `addWechatSource` functions trigger wiki ingest in the background. Update the wiki ingest calls to pass the user ID.

In `addWebpageSource` (and similar functions), after `const session = await auth()`:

The `session.user.id` is already available. Find the wiki ingest call (in `processWebpage` or in `addWechatSource`'s background IIFE) and pass `session.user.id`.

For `addWechatSource`, the wiki ingest call is:
```ts
await ingestSourceToWiki(notebookId, source.id);
```

Change to:
```ts
await ingestSourceToWiki(notebookId, source.id, session.user.id);
```

For `addWebpageSource` and `uploadDocumentSource`, the wiki ingest is triggered inside the processor functions. The userId needs to be passed through `ProcessingContext`:

Update `lib/services/source-processors/types.ts`:
```ts
export interface ProcessingContext {
  sourceId: string;
  notebookId: string;
  userId?: string;  // NEW — for BYOK key resolution
}
```

Then pass `userId: session.user.id` when creating the context in `addWebpageSource` and `uploadDocumentSource`.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add lib/services/graph-service.ts lib/services/wiki-ingest.ts lib/actions/sources.ts lib/services/source-processors/types.ts
git commit -m "feat: integrate BYOK into wiki generation pipeline"
```

---

### Task 6: Integrate BYOK into Agent Chat

**Files:**
- Modify: `components/deepdive/chat/chat-panel.tsx`

- [ ] **Step 1: Fetch resolved key and pass to agent context**

In `components/deepdive/chat/chat-panel.tsx`, update the `fetchSettings` effect to also fetch the resolved key:

Add state:
```ts
const [resolvedKey, setResolvedKey] = useState<{ apiKey: string; baseUrl?: string } | null>(null);
```

After `setModelSettings`, add key resolution:
```ts
// Fetch resolved API key for the active provider
try {
  const keyRes = await fetch(`/api/settings/resolve-key?provider=${data.modelProvider}`);
  if (keyRes.ok) {
    const keyData = await keyRes.json();
    setResolvedKey(keyData);
  } else {
    setResolvedKey(null);
  }
} catch {
  setResolvedKey(null);
}
```

Update the `stream.submit` call (line 488) to include the key:

Change:
```ts
stream.submit(
  { messages: [{ type: "human", content: message }] },
  {
    context: {
      notebook_id: notebookId,
      wiki_content: wikiContent,
      wiki_schema: {},
      model_provider: modelSettings.modelProvider,
      model_name: modelSettings.modelName,
    },
  },
);
```

To:
```ts
stream.submit(
  { messages: [{ type: "human", content: message }] },
  {
    context: {
      notebook_id: notebookId,
      wiki_content: wikiContent,
      wiki_schema: {},
      model_provider: modelSettings.modelProvider,
      model_name: modelSettings.modelName,
      api_key: resolvedKey?.apiKey || "",
      base_url: resolvedKey?.baseUrl || "",
    },
  },
);
```

- [ ] **Step 2: Add missing key warning**

If `resolvedKey` is null and user tries to send a message, show a warning. Add before the form:

```tsx
{!resolvedKey && !stream.isLoading && (
  <div className="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-3 py-2">
    <p className="text-xs text-amber-800 dark:text-amber-200">
      Set your API key in <a href="/settings" className="underline">Settings</a> to use the chat.
    </p>
  </div>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add components/deepdive/chat/chat-panel.tsx
git commit -m "feat: pass BYOK API key to LangGraph agent via context"
```

---

### Task 7: Add env var and test

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Add encryption secret to .env.local**

Add:
```
API_KEY_ENCRYPTION_SECRET=<generate-a-random-32-char-string>
```

Generate with: `openssl rand -hex 16`

- [ ] **Step 2: Full integration test**

1. `npm run dev`
2. Navigate to Settings
3. Set an OpenAI API key
4. Verify masked key shows
5. Open a notebook → add a source → verify wiki generation works with your key
6. Open chat → send a message → verify agent responds (requires agent-side changes in a separate spec)
7. Remove the key → verify wiki generation fails with "API key not configured" error

- [ ] **Step 3: Build check**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "feat: BYOK integration test and polish"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Provider definitions + crypto | `lib/types/providers.ts`, `lib/crypto.ts` |
| 2 | Schema + key resolver | `prisma/schema.prisma`, `lib/services/api-key-resolver.ts` |
| 3 | Settings API extension | `app/api/settings/route.ts`, `app/api/settings/resolve-key/route.ts` |
| 4 | Settings form UI | `components/settings/settings-form.tsx` |
| 5 | Wiki generation integration | `graph-service.ts`, `wiki-ingest.ts`, `sources.ts` |
| 6 | Agent chat integration | `chat-panel.tsx` |
| 7 | Env var + integration test | `.env.local` |

Tasks 1-2 are foundational. Task 3 depends on 1-2. Task 4 depends on 3. Tasks 5-6 depend on 2. Task 7 depends on all.

**Note:** Agent-side changes (Python `AgentContext` + model initialization) are in a separate spec and not included in this plan. The frontend will pass `api_key` and `base_url` in the context — the agent needs to read and use them.
