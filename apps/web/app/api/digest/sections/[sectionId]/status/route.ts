import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sectionId } = await params;
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  // ACL: caller must own the digest that owns this section.
  const section = await prisma.digestSection.findFirst({
    where: {
      id: sectionId,
      digest: { userId: session.user.id },
    },
    select: { id: true },
  });
  if (!section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const workflowsUrl = process.env.WORKFLOWS_API_URL;
  if (!workflowsUrl) {
    return NextResponse.json({ error: "WORKFLOWS_API_URL not configured" }, { status: 500 });
  }

  const STATUS_TIMEOUT_MS = 3_000;
  try {
    const agentResp = await fetch(
      `${workflowsUrl}/v1/workflows/daily_digest/jobs/${encodeURIComponent(jobId)}/status`,
      {
        headers: { "X-Internal-Token": process.env.INTERNAL_CALLBACK_TOKEN ?? "" },
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      },
    );
    if (!agentResp.ok) {
      return NextResponse.json({ error: "Status unavailable" }, { status: 503 });
    }
    const body = await agentResp.json();
    return NextResponse.json(body);
  } catch (err) {
    console.error("[digest status] agent call failed:", err);
    return NextResponse.json({ error: "Status unavailable" }, { status: 503 });
  }
}
