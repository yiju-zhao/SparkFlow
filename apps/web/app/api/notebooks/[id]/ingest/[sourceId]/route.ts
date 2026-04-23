import { auth } from "@/lib/auth";
import { ingestSourceToWiki } from "@/lib/services/wiki-ingest";
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

  try {
    const result = await ingestSourceToWiki(notebookId, sourceId, session.user.id);
    return NextResponse.json({
      success: true,
      pagesWritten: result.pagesWritten,
      pages: result.pages,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Ingest failed";
    console.error("Wiki ingest failed:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
