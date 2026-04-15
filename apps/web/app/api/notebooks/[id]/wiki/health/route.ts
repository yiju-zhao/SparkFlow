import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runHealthCheck } from "@/lib/services/wiki-health";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;

  try {
    const report = await runHealthCheck(notebookId);
    return NextResponse.json(report);
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}
