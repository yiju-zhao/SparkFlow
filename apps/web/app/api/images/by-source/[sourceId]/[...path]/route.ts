import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * Fallback image resolver: looks up a SourceImage by source ID + filename.
 * Handles cases where ingest-time URL rewriting failed (e.g., MinerU path mismatches).
 *
 * URL pattern: /api/images/by-source/{sourceId}/images/hash.jpg
 * The [...path] captures everything after the sourceId (e.g., ["images", "hash.jpg"]).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sourceId: string; path: string[] }> },
) {
  const { sourceId, path } = await params;
  const filename = path[path.length - 1]; // Last segment is the filename

  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }

  // Look up by source + original filename
  const image = await prisma.sourceImage.findFirst({
    where: {
      sourceId,
      originalName: filename,
    },
    select: { data: true, mimeType: true },
  });

  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  return new NextResponse(image.data, {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
