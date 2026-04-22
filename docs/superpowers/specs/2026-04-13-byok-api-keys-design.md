# Bring Your Own API Key (BYOK) Design

## Overview

Allow users to provide their own LLM API keys for wiki generation and agent chat in notebooks. Keys are encrypted at rest in the database. Non-admin users must provide their own key to use LLM features — no system-level fallback. Admin users can fall back to system env keys for testing.

## Goals

1. Users can store encrypted API keys for multiple LLM providers
2. Support preset providers (OpenAI, Gemini, DeepSeek, GLM, Minimax, Kimi) with hardcoded base URLs
3. Support custom OpenAI-compatible endpoints with user-provided base URL
4. Keys never returned to the client — only "has key" status
5. Non-admin users gated: must have a key for the selected provider to use LLM features
6. Admin users fall back to system env keys when no personal key is set

## Non-Goals

- Key validation/testing on save (v2)
- Per-notebook key overrides
- Key rotation or expiration policies
- Rate limiting per user key

## Providers

| Provider | ID | Base URL | SDK |
|----------|------|----------|-----|
| OpenAI | `openai` | `https://api.openai.com/v1` | OpenAI-compatible |
| Gemini | `gemini` | Google SDK (no base URL) | Google AI SDK |
| DeepSeek | `deepseek` | `https://api.deepseek.com/v1` | OpenAI-compatible |
| GLM (Zhipu) | `glm` | `https://open.bigmodel.cn/api/paas/v4` | OpenAI-compatible |
| Minimax | `minimax` | `https://api.minimax.chat/v1` | OpenAI-compatible |
| Kimi (Moonshot) | `kimi` | `https://api.moonshot.cn/v1` | OpenAI-compatible |
| Custom | `custom` | User-provided | OpenAI-compatible |

All providers except Gemini use the OpenAI-compatible SDK pattern (`new OpenAI({ apiKey, baseURL })`). Gemini uses the Google AI SDK.

## Data Model

### Prisma Schema Change

Add to `UserSettings`:

```prisma
model UserSettings {
  // ... existing fields (modelProvider, modelName, matcherModelProvider, matcherModelName) ...

  apiKeys    String?    @db.Text  // Encrypted JSON blob
}
```

### Encrypted Blob Structure

The `apiKeys` field stores an AES-256-GCM encrypted JSON blob. When decrypted:

```ts
type StoredApiKeys = {
  [providerId: string]: {
    apiKey: string;
    baseUrl?: string;  // only for "custom" provider
  };
};

// Example decrypted:
{
  "openai": { "apiKey": "sk-proj-abc123..." },
  "deepseek": { "apiKey": "sk-def456..." },
  "custom": { "apiKey": "sk-xyz...", "baseUrl": "https://my-llm.example.com/v1" }
}
```

Single encrypted blob avoids per-provider schema migrations.

## Encryption

### Implementation (`lib/crypto.ts`)

- Algorithm: AES-256-GCM
- Key: derived from `API_KEY_ENCRYPTION_SECRET` env var using SHA-256 hash
- Format: `iv:authTag:ciphertext` (all base64 encoded)
- Two exported functions:
  - `encrypt(plaintext: string): string`
  - `decrypt(encrypted: string): string`

### Env Var

```
API_KEY_ENCRYPTION_SECRET=<random-32-char-string>
```

Must be set in `.env.local`. If missing, API key storage operations fail with a clear error.

## API Contract

### GET /api/settings

Returns existing settings plus key status (never the actual keys):

```ts
interface SettingsResponse {
  modelProvider: string;
  modelName: string;
  matcherModelProvider: string;
  matcherModelName: string;
  // BYOK additions:
  apiKeyStatus: {
    [providerId: string]: {
      hasKey: boolean;
      maskedKey: string;  // e.g. "sk-...abc1" (first 3 + last 4 chars)
    };
  };
}
```

### POST /api/settings

Extended request body:

```ts
interface SettingsUpdateRequest {
  modelProvider?: string;
  modelName?: string;
  matcherModelProvider?: string;
  matcherModelName?: string;
  // BYOK additions:
  apiKeys?: {
    [providerId: string]: {
      apiKey: string;       // plaintext, encrypted server-side
      baseUrl?: string;     // only for "custom"
    } | null;               // null = remove key for this provider
  };
}
```

Server-side:
1. Read existing encrypted blob from DB
2. Decrypt
3. Merge updates (add/update/remove per provider)
4. Re-encrypt
5. Store

## Settings UI

Extend `components/settings/settings-form.tsx`:

### Layout

Below the existing model selection section, add an "API Keys" section:

```
API Keys
─────────────────────────────────────────
Each provider needs an API key to use its models.

OpenAI          [sk-...abc1]  [Update] [Remove]
Gemini          Not set       [Set Key]
DeepSeek        Not set       [Set Key]
GLM (Zhipu)     Not set       [Set Key]
Minimax         Not set       [Set Key]
Kimi (Moonshot) Not set       [Set Key]
Custom          Not set       [Set Key]
```

### Key Input Flow

1. User clicks "Set Key" → input field appears inline with Save/Cancel
2. Input type is `password` — key is masked
3. On save → POST to `/api/settings` with the key
4. On success → shows masked key indicator
5. "Remove" clears the key for that provider
6. For "Custom" provider → additional URL input field appears

### Model Selection Gating

When user selects a model provider in the model dropdown:
- If they have a key for that provider → normal behavior
- If they don't (and not admin) → show inline warning: "Set your API key for [provider] in the section below"

## Integration Points

### 1. Key Resolution Helper

New utility `lib/services/api-key-resolver.ts`:

```ts
interface ResolvedKey {
  apiKey: string;
  baseUrl?: string;
}

async function resolveApiKey(
  userId: string,
  providerId: string,
): Promise<ResolvedKey>
```

Logic:
1. Fetch `UserSettings` for user
2. If `apiKeys` blob exists → decrypt → look up provider
3. If found → return key (and baseUrl for custom)
4. If not found → check if user is admin
5. If admin → return system env key (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, etc.)
6. If not admin → throw error: "API key not configured for [provider]"

### 2. Wiki Ingest (`lib/services/graph-service.ts`)

Currently:
```ts
const openai = new OpenAI(); // env key
```

Change to:
```ts
// Accept userId parameter, resolve key per-request
export async function extractGraph(markdown: string, userId: string) {
  const { apiKey, baseUrl } = await resolveApiKey(userId, "openai");
  const client = new OpenAI({ apiKey, baseURL: baseUrl });
  // ... rest of function uses `client`
}
```

Same pattern for `generateWikiPages` and `integrateWikiPage`.

The `userId` propagates from:
- `ingestSourceToWiki` → gets `notebookId` → looks up notebook owner
- Or passed explicitly from the server action that triggers ingest

### 3. Agent Chat (LangGraph, port 2024)

**Frontend → Next.js → Agent flow:**

The frontend calls the LangGraph agent via `useStream`. We need to intercept and inject the user's API key.

**Option: Pass via `configurable` in the stream config**

The `useStream` hook already sends a `config` object. Extend it:

```ts
// In chat-panel.tsx or the API proxy
config: {
  configurable: {
    model_provider: settings.modelProvider,
    model_name: settings.modelName,
    api_key: decryptedKey,      // NEW
    base_url: resolvedBaseUrl,  // NEW (for OpenAI-compatible)
  }
}
```

**Agent-side changes** (`apps/agent/config/rag_agent.py`):

Update `AgentContext`:
```python
@dataclass
class AgentContext:
    notebook_id: str
    model_provider: str
    model_name: str
    api_key: str = ""        # NEW
    base_url: str = ""       # NEW
    wiki_content: str = ""
    wiki_schema: str = ""
```

Update model initialization to use `api_key` and `base_url` from context.

**Security note:** The API key travels from Next.js server → agent server over the internal network (localhost:2024). It never touches the browser. The `configurable` object is part of the POST body, not headers.

### 4. Access Gate

Before any LLM operation, check if the user has a key:

```ts
// lib/services/api-key-resolver.ts
export async function requireApiKey(
  userId: string,
  providerId: string,
): Promise<ResolvedKey> {
  // Same as resolveApiKey but throws user-friendly error
  // Used at the start of server actions / API routes
}
```

Call sites:
- `lib/services/graph-service.ts` — before wiki extraction/generation
- `app/api/chat/` — before proxying to agent
- Any future LLM-dependent feature

Error response: `{ error: "API key required", message: "Please set your API key for [provider] in Settings" }`

## Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `apiKeys` field to `UserSettings` |
| `lib/crypto.ts` | **New** — AES-256-GCM encrypt/decrypt |
| `lib/services/api-key-resolver.ts` | **New** — resolve user's API key for a provider |
| `app/api/settings/route.ts` | Extend GET (key status) and POST (key storage) |
| `components/settings/settings-form.tsx` | Add API key management UI |
| `lib/services/graph-service.ts` | Accept userId, use resolved key |
| `lib/services/wiki-ingest.ts` | Pass userId through to graph-service |
| `components/deepdive/chat/chat-panel.tsx` | Pass API key in agent config |
| `apps/agent/config/rag_agent.py` | Add api_key/base_url to AgentContext |
| `apps/agent/graphs/rag_agent.py` | Use api_key from context for model init |
| `.env.local` | Add `API_KEY_ENCRYPTION_SECRET` |

## Security

- Keys encrypted at rest with AES-256-GCM
- Keys never returned to client (only masked preview + hasKey boolean)
- Keys decrypted only server-side, only when needed for LLM calls
- Keys travel to agent only over internal network (localhost), in request body (not headers)
- `API_KEY_ENCRYPTION_SECRET` must be kept secret — if compromised, all stored keys are exposed
- No key logging — all LLM client libraries should have logging disabled for auth params
