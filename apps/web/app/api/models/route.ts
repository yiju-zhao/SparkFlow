import { NextResponse } from "next/server";

// GET /api/models - Fetch available models from environment configuration
export async function GET() {
  const openaiModels = (process.env.OPENAI_MODELS || "gpt-4o-mini,gpt-4.1,gpt-5.2")
    .split(",")
    .map((m) => m.trim());

  const googleModels = (process.env.GOOGLE_MODELS || "gemini-2.5-flash,gemini-2.5-pro,gemini-1.5-flash")
    .split(",")
    .map((m) => m.trim());

  const defaultProvider = process.env.DEFAULT_MODEL_PROVIDER || "openai";
  const defaultModel = process.env.DEFAULT_MODEL_NAME || "gpt-4o-mini";

  return NextResponse.json({
    openai: openaiModels,
    google: googleModels,
    defaults: {
      provider: defaultProvider,
      model: defaultModel,
    },
  });
}
