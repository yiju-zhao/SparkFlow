import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Helper to get available models from env
function getAvailableModels() {
  const openaiModels = (process.env.OPENAI_MODELS || "gpt-4o-mini,gpt-4.1,gpt-5.2")
    .split(",")
    .map((m) => m.trim());

  const googleModels = (process.env.GOOGLE_MODELS || "gemini-2.5-flash,gemini-2.5-pro,gemini-1.5-flash")
    .split(",")
    .map((m) => m.trim());

  return { openai: openaiModels, google: googleModels };
}

// Helper to get defaults from env
function getDefaults() {
  return {
    provider: process.env.DEFAULT_MODEL_PROVIDER || "google",
    model: process.env.DEFAULT_MODEL_NAME || "gemini-2.5-flash",
  };
}

// GET /api/settings - Fetch user settings
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
    },
  });

  // Return user settings or environment defaults
  const defaults = getDefaults();
  return NextResponse.json(
    settings || {
      modelProvider: defaults.provider,
      modelName: defaults.model,
      matcherModelProvider: defaults.provider,
      matcherModelName: defaults.model,
    }
  );
}

// POST /api/settings - Upsert user settings
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
  } = body;

  // Validate providers
  const validProviders = ["openai", "google"];
  if (modelProvider && !validProviders.includes(modelProvider)) {
    return NextResponse.json(
      { error: "Invalid model provider" },
      { status: 400 }
    );
  }
  if (matcherModelProvider && !validProviders.includes(matcherModelProvider)) {
    return NextResponse.json(
      { error: "Invalid matcher model provider" },
      { status: 400 }
    );
  }

  // Validate models against available models from env
  const availableModels = getAvailableModels();

  if (modelProvider && modelName) {
    const validModels = availableModels[modelProvider as keyof typeof availableModels];
    if (!validModels?.includes(modelName)) {
      return NextResponse.json(
        { error: `Invalid model name. Available models for ${modelProvider}: ${validModels.join(", ")}` },
        { status: 400 }
      );
    }
  }

  if (matcherModelProvider && matcherModelName) {
    const validModels = availableModels[matcherModelProvider as keyof typeof availableModels];
    if (!validModels?.includes(matcherModelName)) {
      return NextResponse.json(
        { error: `Invalid matcher model name. Available models for ${matcherModelProvider}: ${validModels.join(", ")}` },
        { status: 400 }
      );
    }
  }

  // Build update data with only provided fields
  const updateData: Record<string, string> = {};
  if (modelProvider) updateData.modelProvider = modelProvider;
  if (modelName) updateData.modelName = modelName;
  if (matcherModelProvider) updateData.matcherModelProvider = matcherModelProvider;
  if (matcherModelName) updateData.matcherModelName = matcherModelName;

  const settings = await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    update: updateData,
    create: {
      userId: session.user.id,
      modelProvider: modelProvider || "google",
      modelName: modelName || "gemini-2.5-flash",
      matcherModelProvider: matcherModelProvider || "google",
      matcherModelName: matcherModelName || "gemini-2.5-flash",
    },
  });

  return NextResponse.json({
    modelProvider: settings.modelProvider,
    modelName: settings.modelName,
    matcherModelProvider: settings.matcherModelProvider,
    matcherModelName: settings.matcherModelName,
  });
}
