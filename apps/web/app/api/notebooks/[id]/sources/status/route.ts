import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET is unauthenticated — allows agent to list sources without session cookies.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: notebookId } = await params;

  const notebook = await prisma.notebook.findUnique({
    where: { id: notebookId },
    include: {
      sources: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { images: true } },
        },
      },
    },
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  return NextResponse.json({ sources: notebook.sources });
}
