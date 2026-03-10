import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

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

  return NextResponse.json(settings || { modelProvider: "openai", modelName: "gpt-4o-mini" });
}

// POST /api/settings - Upsert user settings
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { modelProvider, modelName } = body;

  // Validate inputs
  const validProviders = ["openai", "google"];
  const validModels: Record<string, string[]> = {
    openai: ["gpt-4o-mini", "gpt-4.1", "gpt-5.2"],
    google: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  };

  if (!validProviders.includes(modelProvider)) {
    return NextResponse.json(
      { error: "Invalid model provider" },
      { status: 400 }
    );
  }

  if (!validModels[modelProvider]?.includes(modelName)) {
    return NextResponse.json({ error: "Invalid model name" }, { status: 400 });
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
