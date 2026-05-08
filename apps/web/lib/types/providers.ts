export interface ProviderConfig {
  id: string;
  label: string;
  baseUrl?: string;
  /**
   * Path appended to baseUrl for the OpenAI-compatible model list call.
   * Defaults to "/models" when omitted.
   */
  modelsPath?: string;
  sdkType: "openai-compatible" | "google";
  /**
   * Set when the provider does not expose a `/v1/models` endpoint
   * (e.g. Minimax). When true, fetchProviderModels skips the network
   * call entirely and returns `fallbackModels` instead.
   */
  noModelsEndpoint?: boolean;
  /**
   * Hardcoded model id list, used when `noModelsEndpoint` is true.
   * Should be kept in sync with the provider's published model
   * lineup.
   */
  fallbackModels?: string[];
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    sdkType: "openai-compatible",
  },
  {
    id: "gemini",
    label: "Gemini",
    // OpenAI-compatible endpoint at the Gemini API; same /models shape.
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    sdkType: "google",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    sdkType: "openai-compatible",
  },
  {
    id: "glm",
    label: "GLM (Zhipu)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    sdkType: "openai-compatible",
  },
  {
    id: "minimax",
    label: "Minimax",
    baseUrl: "https://api.minimax.chat/v1",
    sdkType: "openai-compatible",
    // Minimax doesn't expose a /v1/models endpoint, so we fall back to
    // a hand-curated list. Keep in sync with platform.minimaxi.com.
    noModelsEndpoint: true,
    fallbackModels: [
      "MiniMax-M2.7",
      "MiniMax-M2.7-highspeed",
      "MiniMax-M2.5",
      "MiniMax-M2.5-highspeed",
      "MiniMax-M2.1",
    ],
  },
  {
    id: "kimi",
    label: "Kimi (Moonshot)",
    baseUrl: "https://api.moonshot.cn/v1",
    sdkType: "openai-compatible",
  },
  {
    id: "cari-ai4news",
    label: "CARI AI4News",
    baseUrl: "https://ai4news.rnd.huawei.com/model/v1",
    sdkType: "openai-compatible",
    // The AI4News gateway does not expose /v1/models — the only way
    // to discover available models is the wiki page. Keep this list
    // in sync with https://ai4news.rnd.huawei.com.
    noModelsEndpoint: true,
    fallbackModels: [
      "MiniMaxAI/MiniMax-M2.5",
      "zai-org/GLM-5.1-FP8",
      "zai-org/GLM-4.6V",
    ],
  },
  { id: "custom", label: "Custom", sdkType: "openai-compatible" },
];

export const PROVIDER_MAP = new Map(PROVIDERS.map((p) => [p.id, p]));

/**
 * Substrings that mark non-chat model IDs across every provider we
 * support. A single deny-list is preferred over per-provider regex
 * registries — most providers' embedding/audio/image SKUs share the
 * same telltale words.
 */
export const NON_CHAT_MODEL_SUBSTRINGS = [
  "embedding",
  "tts",
  "whisper",
  "dall-e",
  "audio",
  "image",
  "realtime",
  "imagen",
  "veo",
  "cogview",
  "cogvideo",
  "moderation",
  "rerank",
];

/**
 * Initial values for a fresh UserSettings row. Used both at row
 * creation in POST /api/settings and as the suggestion block returned
 * to the client. Kept in code, not JSON, because they're tiny and
 * coupled to TS types elsewhere.
 */
export const DEFAULTS = {
  provider: "gemini",
  chatModel: "gemini-2.5-flash",
  wikiModel: "gemini-2.5-flash",
  searchModel: "gemini-2.5-flash",
  semopsModel: "gemini-2.5-flash",
} as const;

export interface StoredApiKeys {
  [providerId: string]: {
    apiKey: string;
    baseUrl?: string;
    /** Display name for user-added custom endpoints. */
    label?: string;
    /**
     * Manually-typed model IDs for custom endpoints whose `/v1/models`
     * we don't auto-probe (Ollama, vLLM variants, etc.). Ignored for
     * built-in providers — those come from a live `/v1/models` fetch.
     */
    modelNames?: string[];
  };
}

export interface ApiKeyStatus {
  [providerId: string]: {
    hasKey: boolean;
    maskedKey: string;
    /** Display name for user-added custom endpoints. */
    label?: string;
    /** Saved base URL — only meaningful for custom endpoints. */
    baseUrl?: string;
    /** Manually-typed model IDs for custom endpoints. */
    modelNames?: string[];
  };
}

export const CUSTOM_PROVIDER_PREFIX = "custom-";
