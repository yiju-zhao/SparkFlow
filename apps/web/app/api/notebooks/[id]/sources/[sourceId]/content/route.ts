import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// Unauthenticated — allows agent to read source content.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const { id: notebookId, sourceId } = await params;

  const source = await prisma.source.findUnique({
    where: { id: sourceId, notebookId },
  });

  if (!source) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    content: source.markdownContent || source.content || "",
    title: source.title,
  });
}
