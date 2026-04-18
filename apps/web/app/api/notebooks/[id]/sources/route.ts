import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import TurndownService from "turndown";

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

  const { title, sourceType, url, markdown: markdownInput, html: htmlInput } = await req.json();

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  // Rewrite scraper image paths: /api/images/{id} → /api/wechat/images/{id}
  const rewriteImgSrc = (src: string) =>
    src.replace(/^\/api\/images\/(\d+)$/, "/api/wechat/images/$1");

  // Convert WeChat HTML to markdown if provided, rewriting image URLs.
  // Always prefer HTML→markdown conversion over plain text for richer output.
  let finalMarkdown: string | null = null;
  let finalHtml: string | null = null;
  if (htmlInput) {
    const td = new TurndownService({ headingStyle: "atx" });
    td.addRule("wechatImages", {
      filter: "img",
      replacement: (_c, node) => {
        const el = node as HTMLElement;
        const src = el.getAttribute("data-src") || el.getAttribute("src") || "";
        const alt = el.getAttribute("alt") || "";
        const resolvedSrc = rewriteImgSrc(src);
        return resolvedSrc ? `\n\n![${alt}](${resolvedSrc})\n\n` : "";
      },
    });
    finalMarkdown = td.turndown(htmlInput);
    // Preserve HTML for rich rendering; rewrite img src/data-src to the WeChat proxy.
    finalHtml = htmlInput.replace(
      /(<img\b[^>]*?\b(?:data-src|src)=["'])([^"']+)(["'])/gi,
      (_m: string, pre: string, src: string, post: string) => pre + rewriteImgSrc(src) + post,
    );
  } else {
    finalMarkdown = markdownInput || null;
  }

  const source = await prisma.source.create({
    data: {
      notebookId,
      title: title.trim(),
      sourceType: sourceType || "WEBPAGE",
      url: url || null,
      markdown: finalMarkdown,
      html: finalHtml,
      status: finalMarkdown ? "READY" : "PROCESSING",
    },
  });

  // Trigger wiki ingest in background if content is already available
  if (finalMarkdown) {
    import("@/lib/services/wiki-ingest")
      .then(({ ingestSourceToWiki }) =>
        ingestSourceToWiki(notebookId, source.id, session.user!.id!),
      )
      .catch((err) => console.error("[POST sources] Wiki ingest failed:", err));
  }

  return NextResponse.json(source, { status: 201 });
}
