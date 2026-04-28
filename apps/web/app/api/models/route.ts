import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import {
  PROVIDER_MAP,
  DEFAULTS,
  CUSTOM_PROVIDER_PREFIX,
  type StoredApiKeys,
} from "@/lib/types/providers";
import {
  fetchProviderModels,
  isCustomProviderId,
  FetchModelsError,
} from "@/lib/providers/list-models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ModelEntry {
  id: string;
  label: string;
}
interface ProviderEntry {
  label: string;
  models: ModelEntry[];
  /** "manual" when the provider is a custom endpoint with typed-in names. */
  source: "remote" | "manual";
  /** Set when the live /v1/models call failed for this provider. */
  error?: string;
}
interface ModelsPayload {
  providers: Record<string, ProviderEntry>;
  defaults: typeof DEFAULTS;
}

interface CacheEntry {
  data: ModelsPayload;
  expires: number;
}
const CACHE_TTL_MS = 30_000;
const cache: Map<string, CacheEntry> = new Map();

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expires > now) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  // Pull the user's keys.
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { apiKeys: true },
  });

  let storedKeys: StoredApiKeys = {};
  if (settings?.apiKeys) {
    try {
      storedKeys = JSON.parse(decrypt(settings.apiKeys));
    } catch {
      // corrupted blob → no keys
    }
  }

  const providers: Record<string, ProviderEntry> = {};

  // Fetch every provider in parallel; allSettled so one timeout doesn't
  // sink the whole response.
  const entries = Object.entries(storedKeys);
  const results = await Promise.allSettled(
    entries.map(async ([providerId, entry]) => {
      const isCustom = isCustomProviderId(providerId);
      if (isCustom) {
        // Custom endpoints: typed-in model names only, no upstream probe.
        return {
          providerId,
          label: entry.label || providerId,
          source: "manual" as const,
          modelIds: entry.modelNames ?? [],
        };
      }
      const provider = PROVIDER_MAP.get(providerId);
      if (!provider) {
        throw new FetchModelsError(
          "PROVIDER_UNKNOWN",
          providerId,
          `Unknown provider "${providerId}"`,
        );
      }
      const modelIds = await fetchProviderModels(providerId, entry.apiKey, entry.baseUrl);
      return {
        providerId,
        label: provider.label,
        source: "remote" as const,
        modelIds,
      };
    }),
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const [providerId, entry] = entries[i];
    if (r.status === "fulfilled") {
      providers[providerId] = {
        label: r.value.label,
        source: r.value.source,
        models: r.value.modelIds.map((id) => ({ id, label: id })),
      };
    } else {
      const err = r.reason;
      const provider = PROVIDER_MAP.get(providerId);
      providers[providerId] = {
        label: provider?.label ?? entry.label ?? providerId,
        source: "remote",
        models: [],
        error: err instanceof FetchModelsError ? err.message : "Failed to load models",
      };
    }
  }

  const payload: ModelsPayload = { providers, defaults: DEFAULTS };
  cache.set(userId, { data: payload, expires: now + CACHE_TTL_MS });

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Internal helper for POST /api/settings to invalidate this user's
 * cache after a key change. Not exported as a route — this module is
 * imported directly.
 */
export function invalidateModelsCache(userId: string): void {
  cache.delete(userId);
}

/** Internal helper used by POST /api/settings to seed the cache after
 * a successful key validation, avoiding a duplicate /v1/models call
 * the next time the user opens settings. */
export function primeModelsCache(
  userId: string,
  providerId: string,
  modelIds: string[],
  source: "remote" | "manual",
): void {
  const existing = cache.get(userId);
  const provider = PROVIDER_MAP.get(providerId);
  const label = provider?.label ?? providerId;
  const now = Date.now();
  if (!existing || existing.expires <= now) {
    cache.set(userId, {
      data: {
        providers: {
          [providerId]: {
            label,
            source,
            models: modelIds.map((id) => ({ id, label: id })),
          },
        },
        defaults: DEFAULTS,
      },
      expires: now + CACHE_TTL_MS,
    });
    return;
  }
  existing.data.providers[providerId] = {
    label,
    source,
    models: modelIds.map((id) => ({ id, label: id })),
  };
  // refresh expiry on update
  existing.expires = now + CACHE_TTL_MS;
}

// Suppress eslint "unused providerId" — re-export keeps internal
// helpers reachable to other routes via direct import.
void CUSTOM_PROVIDER_PREFIX;
