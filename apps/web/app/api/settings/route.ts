import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { maskApiKey } from "@/lib/services/api-key-resolver";
import type { StoredApiKeys, ApiKeyStatus } from "@/lib/types/providers";

function getAvailableModels() {
  const openaiModels = (process.env.OPENAI_MODELS || "gpt-4o-mini,gpt-4.1,gpt-5.2")
    .split(",")
    .map((m) => m.trim());

  const googleModels = (process.env.GOOGLE_MODELS || "gemini-2.5-flash,gemini-2.5-pro,gemini-1.5-flash")
    .split(",")
    .map((m) => m.trim());

  return { openai: openaiModels, google: googleModels };
}

function getDefaults() {
  return {
    provider: process.env.DEFAULT_MODEL_PROVIDER || "openai",
    model: process.env.DEFAULT_MODEL_NAME || "gpt-4o-mini",
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
      modelProvider: modelProvider || "openai",
      modelName: modelName || "gpt-4o-mini",
      matcherModelProvider: matcherModelProvider || "openai",
      matcherModelName: matcherModelName || "gpt-4o-mini",
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
