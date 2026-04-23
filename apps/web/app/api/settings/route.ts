import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { maskApiKey } from "@/lib/services/api-key-resolver";
import modelsConfig from "@/config/models.json";
import type { StoredApiKeys, ApiKeyStatus } from "@/lib/types/providers";

const { defaults } = modelsConfig;

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
        };
      }
    } catch {
      // Decryption failed — treat as no keys
    }
  }

  // BYOK-required: GET returns the user's actual choices (null when unset).
  // Consumer routes reject with 400 when any required slot is null; the
  // Settings UI uses the `suggestions` block to render hint placeholders
  // but does NOT silently merge them as saved values.
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
      provider: defaults.provider,
      chatModel: defaults.chatModel,
      wikiModel: defaults.wikiModel,
      searchModel: defaults.searchModel,
      semopsModel: defaults.semopsModel,
    },
    apiKeyStatus,
    wechatExcludedSourceIds: settings?.wechatExcludedSourceIds || [],
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
    wikiModelProvider,
    wikiModelName,
    searchModelProvider,
    searchModelName,
    semopsModelProvider,
    semopsModelName,
    apiKeys: apiKeysUpdate,
    wechatExcludedSourceIds,
  } = body;

  // Build update data — accept any provider/model (validated client-side against config)
  const updateData: Record<string, string | null | unknown> = {};
  if (modelProvider) updateData.modelProvider = modelProvider;
  if (modelName) updateData.modelName = modelName;
  if (wikiModelProvider) updateData.wikiModelProvider = wikiModelProvider;
  if (wikiModelName) updateData.wikiModelName = wikiModelName;
  if (searchModelProvider) updateData.searchModelProvider = searchModelProvider;
  if (searchModelName) updateData.searchModelName = searchModelName;
  if (semopsModelProvider) updateData.semopsModelProvider = semopsModelProvider;
  if (semopsModelName) updateData.semopsModelName = semopsModelName;

  if (wechatExcludedSourceIds !== undefined) {
    updateData.wechatExcludedSourceIds = wechatExcludedSourceIds;
  }

  // Handle API keys update
  if (apiKeysUpdate && typeof apiKeysUpdate === "object") {
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
      modelProvider: modelProvider || defaults.provider,
      modelName: modelName || defaults.chatModel,
      wikiModelProvider: wikiModelProvider || defaults.provider,
      wikiModelName: wikiModelName || defaults.wikiModel,
      searchModelProvider: searchModelProvider || defaults.provider,
      searchModelName: searchModelName || defaults.searchModel,
      semopsModelProvider: semopsModelProvider || defaults.provider,
      semopsModelName: semopsModelName || defaults.semopsModel,
      ...(updateData.apiKeys ? { apiKeys: updateData.apiKeys as string } : {}),
      ...(wechatExcludedSourceIds ? { wechatExcludedSourceIds } : {}),
    },
  });

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
