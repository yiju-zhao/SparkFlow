import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: notebookId } = await params;

  const graph = await prisma.notebookGraph.findUnique({
    where: { notebookId },
    select: { graphData: true },
  });

  return NextResponse.json({ graphData: graph?.graphData || null });
}
