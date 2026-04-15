import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/notebooks/[id]/sources - List sources in a notebook
export async function GET(req: NextRequest, context: RouteContext) {
  const { id: notebookId } = await context.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const sources = await prisma.source.findMany({
    where: { notebookId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(sources);
}

// POST /api/notebooks/[id]/sources - Add a source to a notebook
export async function POST(req: NextRequest, context: RouteContext) {
  const { id: notebookId } = await context.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const { title, sourceType, url, content, contentHtml, wechatImages } = await req.json();

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  // Build metadata for WeChat HTML sources
  let metadata: Prisma.InputJsonValue | undefined;
  if (contentHtml || wechatImages) {
    const meta: Record<string, Prisma.InputJsonValue> = {};
    if (contentHtml) {
      meta.contentHtml = contentHtml;
      meta.renderMode = "html";
    }
    if (wechatImages) {
      meta.wechatImages = wechatImages;
    }
    metadata = meta;
  }

  const source = await prisma.source.create({
    data: {
      notebookId,
      title: title.trim(),
      sourceType: sourceType || "WEBPAGE",
      url: url || null,
      content: content || null,
      markdownContent: content || null,
      status: content ? "READY" : "PROCESSING",
      ...(metadata && { metadata }),
    },
  });

  // Trigger wiki ingest in background if content is already available
  if (content) {
    import("@/lib/services/wiki-ingest")
      .then(({ ingestSourceToWiki }) =>
        ingestSourceToWiki(notebookId, source.id, session.user!.id!)
      )
      .catch((err) =>
        console.error("[POST sources] Wiki ingest failed:", err)
      );
  }

  return NextResponse.json(source, { status: 201 });
}
