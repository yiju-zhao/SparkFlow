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
    },
  });

  // Return user settings or environment defaults
  const defaults = getDefaults();
  return NextResponse.json(
    settings || {
      modelProvider: defaults.provider,
      modelName: defaults.model,
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
  const { modelProvider, modelName } = body;

  // Validate provider
  const validProviders = ["openai", "google"];
  if (!validProviders.includes(modelProvider)) {
    return NextResponse.json(
      { error: "Invalid model provider" },
      { status: 400 }
    );
  }

  // Validate model against available models from env
  const availableModels = getAvailableModels();
  const validModels = availableModels[modelProvider as keyof typeof availableModels];

  if (!validModels?.includes(modelName)) {
    return NextResponse.json(
      { error: `Invalid model name. Available models for ${modelProvider}: ${validModels.join(", ")}` },
      { status: 400 }
    );
  }

  const settings = await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    update: {
      modelProvider,
      modelName,
    },
    create: {
      userId: session.user.id,
      modelProvider,
      modelName,
    },
  });

  return NextResponse.json({
    modelProvider: settings.modelProvider,
    modelName: settings.modelName,
  });
}
