import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sourceId } = await params;

  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    select: { metadata: true },
  });

  const meta = (source?.metadata as Record<string, unknown>) || {};
  delete meta.extractionReport;

  await prisma.source.update({
    where: { id: sourceId },
    data: { metadata: meta as any },
  });

  return NextResponse.json({ ok: true });
}
