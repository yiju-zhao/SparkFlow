import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const MATCHER_API_URL = process.env.MATCHER_API_URL || "http://localhost:2025";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileKey } = await request.json();
    if (!fileKey) {
      return NextResponse.json({ error: "fileKey is required" }, { status: 400 });
    }

    const response = await fetch(`${MATCHER_API_URL}/api/jobs/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_key: fileKey }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Failed to parse file" }));
      return NextResponse.json({ error: error.detail }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Parse error:", error);
    return NextResponse.json({ error: "Failed to parse file" }, { status: 500 });
  }
}
