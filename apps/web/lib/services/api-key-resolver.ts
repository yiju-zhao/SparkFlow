import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { PROVIDER_MAP } from "@/lib/types/providers";
import type { StoredApiKeys } from "@/lib/types/providers";

export interface ResolvedKey {
  apiKey: string;
  baseUrl?: string;
}

export async function resolveApiKey(
  userId: string,
  providerId: string,
): Promise<ResolvedKey> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { apiKeys: true },
  });

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

  throw new Error(
    `API key not configured for ${PROVIDER_MAP.get(providerId)?.label || providerId}. Please set your API key in Settings.`
  );
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 3) + "..." + key.slice(-4);
}
