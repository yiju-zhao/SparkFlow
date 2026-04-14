import { NextResponse } from "next/server";
import modelsConfig from "@/config/models.json";

// GET /api/models - Fetch available models from config file
export async function GET() {
  return NextResponse.json(modelsConfig);
}
