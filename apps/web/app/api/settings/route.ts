import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { maskApiKey } from "@/lib/services/api-key-resolver";
import {
  DEFAULTS,
  PROVIDER_MAP,
  type StoredApiKeys,
  type ApiKeyStatus,
} from "@/lib/types/providers";
import {
  fetchProviderModels,
  isCustomProviderId,
  FetchModelsError,
} from "@/lib/providers/list-models";
import {
  invalidateModelsCache,
  primeModelsCache,
} from "@/app/api/models/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      wikiModelProvider: true,
      wikiModelName: true,
      searchModelProvider: true,
      searchModelName: true,
      semopsModelProvider: true,
      semopsModelName: true,
      apiKeys: true,
      wechatExcludedSourceIds: true,
    },
  });

  // Build API key status (never return actual keys)
  const apiKeyStatus: ApiKeyStatus = {};
  if (settings?.apiKeys) {
    try {
      const decrypted = decrypt(settings.apiKeys);
      const keys: StoredApiKeys = JSON.parse(decrypted);
      for (const [providerId, entry] of Object.entries(keys)) {
        apiKeyStatus[providerId] = {
          hasKey: true,
          maskedKey: maskApiKey(entry.apiKey),
          ...(entry.label ? { label: entry.label } : {}),
          ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : {}),
          ...(entry.modelNames ? { modelNames: entry.modelNames } : {}),
        };
      }
    } catch {
      // Decryption failed — treat as no keys
    }
  }

  return NextResponse.json({
    modelProvider: settings?.modelProvider ?? null,
    modelName: settings?.modelName ?? null,
    wikiModelProvider: settings?.wikiModelProvider ?? null,
    wikiModelName: settings?.wikiModelName ?? null,
    searchModelProvider: settings?.searchModelProvider ?? null,
    searchModelName: settings?.searchModelName ?? null,
    semopsModelProvider: settings?.semopsModelProvider ?? null,
    semopsModelName: settings?.semopsModelName ?? null,
    suggestions: {
      provider: DEFAULTS.provider,
      chatModel: DEFAULTS.chatModel,
      wikiModel: DEFAULTS.wikiModel,
      searchModel: DEFAULTS.searchModel,
      semopsModel: DEFAULTS.semopsModel,
    },
    apiKeyStatus,
    wechatExcludedSourceIds: settings?.wechatExcludedSourceIds || [],
  });
}

// ----- POST body schema --------------------------------------------------

const ApiKeyEntrySchema = z.object({
  apiKey: z.string().min(1).max(500),
  baseUrl: z.string().url().max(500).optional(),
  label: z.string().max(80).optional(),
  /**
   * Free-text model names for custom endpoints whose /v1/models we
   * don't auto-probe. Capped to 50 entries to keep the encrypted
   * apiKeys blob small.
   */
  modelNames: z.array(z.string().min(1).max(120)).max(50).optional(),
});

const PostBodySchema = z.object({
  modelProvider: z.string().nullable().optional(),
  modelName: z.string().nullable().optional(),
  wikiModelProvider: z.string().nullable().optional(),
  wikiModelName: z.string().nullable().optional(),
  searchModelProvider: z.string().nullable().optional(),
  searchModelName: z.string().nullable().optional(),
  semopsModelProvider: z.string().nullable().optional(),
  semopsModelName: z.string().nullable().optional(),
  apiKeys: z
    .record(z.string(), z.union([z.null(), ApiKeyEntrySchema]))
    .optional(),
  wechatExcludedSourceIds: z.array(z.number().int()).optional(),
});

// POST /api/settings
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const parsed = PostBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Invalid request shape",
          issues: parsed.error.issues,
        },
      },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const updateData: Record<string, string | null | unknown> = {};
  if (body.modelProvider) updateData.modelProvider = body.modelProvider;
  if (body.modelName) updateData.modelName = body.modelName;
  if (body.wikiModelProvider) updateData.wikiModelProvider = body.wikiModelProvider;
  if (body.wikiModelName) updateData.wikiModelName = body.wikiModelName;
  if (body.searchModelProvider) updateData.searchModelProvider = body.searchModelProvider;
  if (body.searchModelName) updateData.searchModelName = body.searchModelName;
  if (body.semopsModelProvider) updateData.semopsModelProvider = body.semopsModelProvider;
  if (body.semopsModelName) updateData.semopsModelName = body.semopsModelName;

  if (body.wechatExcludedSourceIds !== undefined) {
    updateData.wechatExcludedSourceIds = body.wechatExcludedSourceIds;
  }

  // Track validated model lists so we can prime the /api/models cache.
  const validatedModelLists: Array<{
    providerId: string;
    models: string[];
    source: "remote" | "manual";
  }> = [];

  if (body.apiKeys && Object.keys(body.apiKeys).length > 0) {
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

    for (const [providerId, value] of Object.entries(body.apiKeys)) {
      if (value === null) {
        delete currentKeys[providerId];
        continue;
      }

      // Strict validation: hit the provider's /v1/models with the new
      // key. If it fails, return 400 with structured detail and write
      // nothing. This catches typos / dead keys at save time instead
      // of mid-ingest.
      const isCustom = isCustomProviderId(providerId);
      try {
        if (isCustom) {
          // Custom endpoints: never auto-probe /v1/models. Trust the
          // typed-in modelNames and just sanity-check baseUrl.
          // assertSafeUrl is invoked lazily inside fetchProviderModels
          // for non-custom; for custom we still want the SSRF check now.
          const { assertSafeUrl } = await import("@/lib/providers/list-models");
          if (value.baseUrl) assertSafeUrl(value.baseUrl, providerId);
          validatedModelLists.push({
            providerId,
            models: value.modelNames ?? [],
            source: "manual",
          });
        } else {
          // Built-in providers: real /v1/models call. Minimax short-
          // circuits to its fallback list inside fetchProviderModels.
          const provider = PROVIDER_MAP.get(providerId);
          if (!provider) {
            return NextResponse.json(
              {
                error: {
                  code: "PROVIDER_UNKNOWN",
                  providerId,
                  message: `Unknown provider "${providerId}"`,
                },
              },
              { status: 400 },
            );
          }
          const models = await fetchProviderModels(
            providerId,
            value.apiKey,
            value.baseUrl,
          );
          validatedModelLists.push({
            providerId,
            models,
            source: provider.noModelsEndpoint ? "manual" : "remote",
          });
        }
      } catch (err) {
        if (err instanceof FetchModelsError) {
          return NextResponse.json(
            {
              error: {
                code: err.code,
                providerId: err.providerId,
                upstreamStatus: err.upstreamStatus,
                message: err.message,
              },
            },
            { status: 400 },
          );
        }
        throw err;
      }

      // Persist the key.
      currentKeys[providerId] = {
        apiKey: value.apiKey,
        ...(value.baseUrl ? { baseUrl: value.baseUrl } : {}),
        ...(value.label ? { label: value.label } : {}),
        ...(value.modelNames && value.modelNames.length > 0
          ? { modelNames: value.modelNames }
          : {}),
      };
    }

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
      modelProvider: body.modelProvider || DEFAULTS.provider,
      modelName: body.modelName || DEFAULTS.chatModel,
      wikiModelProvider: body.wikiModelProvider || DEFAULTS.provider,
      wikiModelName: body.wikiModelName || DEFAULTS.wikiModel,
      searchModelProvider: body.searchModelProvider || DEFAULTS.provider,
      searchModelName: body.searchModelName || DEFAULTS.searchModel,
      semopsModelProvider: body.semopsModelProvider || DEFAULTS.provider,
      semopsModelName: body.semopsModelName || DEFAULTS.semopsModel,
      ...(updateData.apiKeys ? { apiKeys: updateData.apiKeys as string } : {}),
      ...(body.wechatExcludedSourceIds
        ? { wechatExcludedSourceIds: body.wechatExcludedSourceIds }
        : {}),
    },
  });

  // Cache: invalidate then prime with whatever we just verified.
  invalidateModelsCache(session.user.id);
  for (const v of validatedModelLists) {
    primeModelsCache(session.user.id, v.providerId, v.models, v.source);
  }

  return NextResponse.json({
    modelProvider: settings.modelProvider,
    modelName: settings.modelName,
    wikiModelProvider: settings.wikiModelProvider,
    wikiModelName: settings.wikiModelName,
    searchModelProvider: settings.searchModelProvider,
    searchModelName: settings.searchModelName,
    semopsModelProvider: settings.semopsModelProvider,
    semopsModelName: settings.semopsModelName,
    wechatExcludedSourceIds: settings.wechatExcludedSourceIds,
  });
}
