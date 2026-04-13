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
  // Fetch user settings and role (role from User, not UserSettings)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, settings: { select: { apiKeys: true } } },
  });

  // Try user's own key first
  if (user?.settings?.apiKeys) {
    try {
      const decrypted = decrypt(user.settings.apiKeys);
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
  if (user?.role === "ADMIN") {
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
