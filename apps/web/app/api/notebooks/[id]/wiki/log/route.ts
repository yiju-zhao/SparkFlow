import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;

  const notebook = await prisma.notebook.findUnique({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const { entry } = await request.json();
  if (!entry) {
    return NextResponse.json({ error: "entry is required" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];
  const logEntry = `\n## [${today}] ${entry}`;

  const existing = await prisma.wikiPage.findUnique({
    where: { notebookId_slug: { notebookId, slug: "log" } },
  });

  if (existing) {
    await prisma.wikiPage.update({
      where: { id: existing.id },
      data: { content: existing.content + logEntry },
    });
  } else {
    await prisma.wikiPage.create({
      data: {
        notebookId,
        slug: "log",
        title: "Activity Log",
        content: `# Activity Log\n${logEntry}`,
        pageType: "LOG",
        sourceRefs: [],
      },
    });
  }

  return NextResponse.json({ success: true });
}
