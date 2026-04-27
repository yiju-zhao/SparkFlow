import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * POST /api/notebooks/:id/wiki/integrate
 *
 * Lightweight knowledge-graph update for a single wiki article. Previously
 * called `integrateWikiPage` from `lib/services/graph-service.ts` (deleted
 * during the wiki-ingest port to Python).
 *
 * The Python `extract_wiki` workflow always regenerates community pages —
 * doing that for a single chat-saved article would be a regression. This
 * route is therefore a NO-OP placeholder. The chat panel calls it as
 * fire-and-forget (`.catch(() => {})`) so the user-visible save flow is
 * unaffected; only the graph update is skipped.
 *
 * Follow-up to wire this up properly: add an "extract-only" mode to the
 * Python workflow that returns the merged graph + extractionReport
 * without LLM-generated community pages.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;
  const { slug } = await request.json();

  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  const page = await prisma.wikiPage.findUnique({
    where: { notebookId_slug: { notebookId, slug } },
    select: { id: true },
  });

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  return NextResponse.json({
    nodesAdded: 0,
    edgesAdded: 0,
    note: "integrate route is a no-op pending Python extract-only mode",
  });
}
