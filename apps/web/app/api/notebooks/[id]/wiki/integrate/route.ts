import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { integrateWikiPage } from "@/lib/services/graph-service";
import prisma from "@/lib/prisma";

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
  });

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  try {
    const result = await integrateWikiPage(
      notebookId,
      slug,
      page.content,
      page.sourceRefs,
      session.user.id,
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("Wiki integrate failed:", error);
    return NextResponse.json({ error: "Integration failed" }, { status: 500 });
  }
}
