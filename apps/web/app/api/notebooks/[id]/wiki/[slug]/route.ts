import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET is unauthenticated — wiki pages are read-only accessible by notebook ID.
// This allows the LangGraph agent to read pages without session cookies.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slug: string }> }
) {
  const { id: notebookId, slug } = await params;

  const page = await prisma.wikiPage.findUnique({
    where: { notebookId_slug: { notebookId, slug } },
  });

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: page.id,
    slug: page.slug,
    title: page.title,
    content: page.content,
    pageType: page.pageType,
    sourceRefs: page.sourceRefs,
    updatedAt: page.updatedAt,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId, slug } = await params;

  const notebook = await prisma.notebook.findUnique({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const body = await request.json();
  const { title, content, pageType, sourceRefs } = body;

  if (!title || !content || !pageType) {
    return NextResponse.json(
      { error: "title, content, and pageType are required" },
      { status: 400 }
    );
  }

  const page = await prisma.wikiPage.upsert({
    where: { notebookId_slug: { notebookId, slug } },
    create: {
      notebookId,
      slug,
      title,
      content,
      pageType,
      sourceRefs: sourceRefs || [],
    },
    update: {
      title,
      content,
      pageType,
      sourceRefs: sourceRefs || [],
    },
  });

  return NextResponse.json({ page });
}
