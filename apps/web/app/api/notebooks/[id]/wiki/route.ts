import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET is unauthenticated — allows the LangGraph agent to list pages without session cookies.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: notebookId } = await params;

  // ?withContent=true returns full page content (for agent context injection)
  const withContent = request.nextUrl.searchParams.get("withContent") === "true";

  const pages = await prisma.wikiPage.findMany({
    where: { notebookId },
    select: {
      id: true,
      slug: true,
      title: true,
      content: withContent,
      pageType: true,
      sourceRefs: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ pages });
}
