import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getWikiIngestJobStatus } from "@/lib/queue/ingest-queue";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
    select: { id: true },
  });
  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const STATUS_TIMEOUT_MS = 2_000;
  let status: Awaited<ReturnType<typeof getWikiIngestJobStatus>>;
  try {
    status = await Promise.race([
      getWikiIngestJobStatus(jobId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("redis status timeout")), STATUS_TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    console.error("[GET ingest status] redis unhealthy:", err);
    return NextResponse.json(
      { error: "Status unavailable, retry shortly." },
      { status: 503 },
    );
  }
  if (!status) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Defense in depth: the jobId scheme embeds notebookId, but re-check the
  // stored userId/notebookId so a crafted jobId can't leak another tenant.
  if (status.userId !== session.user.id || status.notebookId !== notebookId) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    jobId: status.jobId,
    state: status.state,
    progress: status.progress,
    attemptsMade: status.attemptsMade,
    failedReason: status.failedReason,
    result: status.returnvalue,
  });
}
