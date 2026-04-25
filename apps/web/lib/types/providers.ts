export interface ProviderConfig {
  id: string;
  label: string;
  baseUrl?: string;
  sdkType: "openai-compatible" | "google";
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    sdkType: "openai-compatible",
  },
  { id: "gemini", label: "Gemini", sdkType: "google" },
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
  },
  {
    id: "kimi",
    label: "Kimi (Moonshot)",
    baseUrl: "https://api.moonshot.cn/v1",
    sdkType: "openai-compatible",
  },
  { id: "custom", label: "Custom", sdkType: "openai-compatible" },
];

export const PROVIDER_MAP = new Map(PROVIDERS.map((p) => [p.id, p]));

export interface StoredApiKeys {
  [providerId: string]: {
    apiKey: string;
    baseUrl?: string;
    /** Display name for user-added custom endpoints. */
    label?: string;
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
  };
}

export const CUSTOM_PROVIDER_PREFIX = "custom-";
