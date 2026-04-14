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

  return NextResponse.json({
    modelProvider: settings?.modelProvider || defaults.provider,
    modelName: settings?.modelName || defaults.chatModel,
    wikiModelProvider: settings?.wikiModelProvider || defaults.provider,
    wikiModelName: settings?.wikiModelName || defaults.wikiModel,
    matcherModelProvider: settings?.matcherModelProvider || defaults.provider,
    matcherModelName: settings?.matcherModelName || defaults.matcherModel,
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
    wikiModelProvider,
    wikiModelName,
    matcherModelProvider,
    matcherModelName,
    apiKeys: apiKeysUpdate,
  } = body;

  // Build update data — accept any provider/model (validated client-side against config)
  const updateData: Record<string, string | null> = {};
  if (modelProvider) updateData.modelProvider = modelProvider;
  if (modelName) updateData.modelName = modelName;
  if (wikiModelProvider) updateData.wikiModelProvider = wikiModelProvider;
  if (wikiModelName) updateData.wikiModelName = wikiModelName;
  if (matcherModelProvider) updateData.matcherModelProvider = matcherModelProvider;
  if (matcherModelName) updateData.matcherModelName = matcherModelName;

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
      matcherModelProvider: matcherModelProvider || defaults.provider,
      matcherModelName: matcherModelName || defaults.matcherModel,
      ...(updateData.apiKeys ? { apiKeys: updateData.apiKeys as string } : {}),
    },
  });

  return NextResponse.json({
    modelProvider: settings.modelProvider,
    modelName: settings.modelName,
    wikiModelProvider: settings.wikiModelProvider,
    wikiModelName: settings.wikiModelName,
    matcherModelProvider: settings.matcherModelProvider,
    matcherModelName: settings.matcherModelName,
  });
}
