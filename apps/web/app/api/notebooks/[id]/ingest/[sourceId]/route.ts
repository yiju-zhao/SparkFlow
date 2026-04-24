import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { enqueueWikiIngest } from "@/lib/queue/ingest-queue";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId, sourceId } = await params;

  // ACL: caller must own the notebook that owns this source.
  const source = await prisma.source.findFirst({
    where: {
      id: sourceId,
      notebookId,
      notebook: { userId: session.user.id },
    },
    select: { id: true },
  });
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  try {
    const jobId = await enqueueWikiIngest({
      notebookId,
      sourceId,
      userId: session.user.id,
    });
    return NextResponse.json({ accepted: true, jobId }, { status: 202 });
  } catch (error) {
    console.error("[POST ingest] enqueue failed:", error);
    return NextResponse.json(
      { error: "Ingest queue unavailable. Try again shortly." },
      { status: 503 },
    );
  }
}
