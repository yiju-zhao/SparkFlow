import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
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
