import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

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
