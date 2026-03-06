/**
 * Publications Data API Route
 *
 * Returns publications for an instance for the matcher service.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: instanceId } = await params;

    const publications = await prisma.publication.findMany({
      where: { instanceId },
      select: {
        id: true,
        title: true,
        abstract: true,
        authors: true,
        doi: true,
        pdfUrl: true,
        keywords: true,
      },
      orderBy: { title: "asc" },
    });

    return NextResponse.json(publications);
  } catch (error) {
    console.error("Get publications error:", error);
    return NextResponse.json(
      { error: "Failed to get publications" },
      { status: 500 }
    );
  }
}
